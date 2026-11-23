import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listScheduledPosts,
  cancelScheduledPost,
  retryScheduledPost,
  retryAllFailed,
  updateScheduledPost,
  publishScheduledPostNow,
  getPublishingAnalytics,
  getPlatformStatus,
} from "@/lib/publishing.functions";
import { Button } from "@/components/ui/button";
import { ContentPlanBoard, usePlanItems } from "@/components/content-plan-board";
import type { PlanItemRow } from "@/lib/social-plan.functions";
import { useAccess } from "@/lib/access";
import { Badge } from "@/components/ui/badge";
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, RefreshCw,
  Send, Trash2, AlertTriangle, CheckCircle2, Clock, XCircle,
  Instagram, Facebook, Youtube, Linkedin, Plug,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { consumeResearchPrefill, type ResearchPrefill } from "@/lib/research-prefill";
import { HandoffBanner } from "@/components/handoff-banner";
import { openCreateMenu } from "@/components/create-menu";
import { isHiddenPath } from "@/lib/hidden-features";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
  head: () => ({
    meta: [
      { title: "Content Calendar – CreatorFlow AI" },
      { name: "description", content: "Plan, schedule, and monitor your content publishing across every platform." },
    ],
  }),
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-8 text-white">
        <h2 className="text-lg font-semibold mb-2">Calendar failed to load</h2>
        <p className="text-sm text-muted-foreground mb-4">{error instanceof Error ? error.message : String(error)}</p>
        <Button onClick={() => { reset(); router.invalidate(); }}>Retry</Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-8 text-white">Not found</div>,
});

type Tab = "calendar" | "plan" | "scheduled" | "queue" | "drafts" | "failed" | "analytics" | "platforms";

const PLATFORM_ICON: Record<string, typeof Instagram> = {
  instagram: Instagram, facebook: Facebook, youtube: Youtube, linkedin: Linkedin,
};

function CalendarPage() {
  const [tab, setTab] = useState<Tab>("calendar");
  // Admins also see CreatorFlow's own content plan (agents draft from it).
  const isAdmin = !!useAccess().data?.isAdmin;
  const [handoff, setHandoff] = useState<ResearchPrefill | null>(() => consumeResearchPrefill("calendar"));
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  });

  const listFn = useServerFn(listScheduledPosts);
  const analyticsFn = useServerFn(getPublishingAnalytics);
  const statusFn = useServerFn(getPlatformStatus);

  const posts = useQuery({ queryKey: ["scheduled-posts"], queryFn: () => listFn({}) });
  const analytics = useQuery({ queryKey: ["publishing-analytics"], queryFn: () => analyticsFn({}) });
  const platforms = useQuery({ queryKey: ["platform-status"], queryFn: () => statusFn({}) });

  const rows = (posts.data ?? []) as Array<Record<string, unknown>>;

  // Posts published straight from a project ("Publish now") never go through
  // the scheduler, so show them on the calendar from the project record.
  const published = useQuery({
    queryKey: ["calendar-published-projects"],
    queryFn: async () => {
      const { data } = await supabase.from("projects")
        .select("id, title, platform_urls, manually_published_at, updated_at")
        .in("publish_status", ["published", "manually_published"]).limit(200);
      const out: Array<Record<string, unknown>> = [];
      for (const p of (data ?? []) as Array<{ id: string; title: string | null; platform_urls: Record<string, string> | null; manually_published_at: string | null; updated_at: string }>) {
        const urls = Object.entries(p.platform_urls ?? {});
        for (const [platform, url] of urls.length ? urls : [["youtube", ""]]) {
          out.push({ id: `project:${p.id}:${platform}`, platform, status: "published", caption: p.title ?? "Published",
            scheduled_at: p.manually_published_at ?? p.updated_at, external_post_url: url || null, readonly: true });
        }
      }
      return out;
    },
  });
  const planQuery = usePlanItems(isAdmin);
  const plannedRows = useMemo(
    () => (planQuery.data?.items ?? []).filter((i) => i.status !== "skipped" && i.status !== "done"),
    [planQuery.data],
  );
  const calendarRows = useMemo(() => {
    const seen = new Set(rows.map((r) => String(r.external_post_url ?? "")).filter(Boolean));
    return [...rows, ...(published.data ?? []).filter((r) => !r.external_post_url || !seen.has(String(r.external_post_url)))];
  }, [rows, published.data]);

  const counts = useMemo(() => {
    const c = { scheduled: 0, queue: 0, drafts: 0, failed: 0 };
    for (const r of rows) {
      const s = String(r.status);
      if (s === "scheduled") c.scheduled += 1;
      else if (s === "ready" || s === "publishing") c.queue += 1;
      else if (s === "draft") c.drafts += 1;
      else if (s === "failed") c.failed += 1;
    }
    return c;
  }, [rows]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return rows
      .filter((r) => r.status === "scheduled" && r.scheduled_at && new Date(String(r.scheduled_at)).getTime() >= now)
      .sort((a, b) => new Date(String(a.scheduled_at)).getTime() - new Date(String(b.scheduled_at)).getTime())
      .slice(0, 6);
  }, [rows]);

  const tabs = ([
    ["calendar", "Calendar"],
    ...(isAdmin ? [["plan", "Content plan"] as [Tab, string]] : []),
    ["scheduled", `Scheduled${counts.scheduled ? ` · ${counts.scheduled}` : ""}`],
    ["queue", `Queue${counts.queue ? ` · ${counts.queue}` : ""}`],
    ["drafts", `Drafts${counts.drafts ? ` · ${counts.drafts}` : ""}`],
    ["failed", `Failed${counts.failed ? ` · ${counts.failed}` : ""}`],
    ["analytics", "Analytics"],
    ["platforms", "Channels"],
  ] as Array<[Tab, string]>);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">Planner</h1>
          <p className="text-muted-foreground mt-1.5">
            Every scheduled and published post, across your connected channels.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => { posts.refetch(); analytics.refetch(); platforms.refetch(); }}>
            <RefreshCw /> Refresh
          </Button>
          <Button size="sm" onClick={openCreateMenu}>＋ Create content</Button>
        </div>
      </header>

      <HandoffBanner prefill={handoff} onDismiss={() => setHandoff(null)} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          ["scheduled", "Scheduled", counts.scheduled, "text-sky-400"],
          ["queue", "In queue", counts.queue, "text-amber-400"],
          ["drafts", "Drafts", counts.drafts, "text-muted-foreground"],
          ["failed", "Failed", counts.failed, counts.failed ? "text-rose-400" : "text-muted-foreground"],
        ] as Array<[Tab, string, number, string]>).map(([id, label, n, cls]) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={cn("glass rounded-2xl p-4 text-left transition hover:border-primary/50", tab === id && "border-primary/60")}>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={cn("mt-1 text-2xl font-bold [font-family:'Space_Grotesk',Inter,sans-serif]", cls)}>{n}</div>
          </button>
        ))}
      </div>

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 w-full sm:w-max max-w-full" role="tablist" aria-label="Planner views">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "shrink-0 px-3.5 py-2 rounded-lg text-sm font-semibold transition",
              tab === id ? "gradient-primary text-white shadow-[var(--shadow-glow)]" : "text-muted-foreground hover:text-foreground",
            )}
          >{label}</button>
        ))}
      </nav>

      {posts.isLoading ? (
        <div className="glass rounded-2xl p-12 text-center text-muted-foreground">Loading your planner…</div>
      ) : (
        <>
          {tab === "plan" && isAdmin && <ContentPlanBoard />}
          {tab === "calendar" && (
            <div className="grid xl:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
              <MonthlyCalendar
                rows={calendarRows}
                planned={isAdmin ? plannedRows : []}
                onOpenPlan={() => setTab("plan")}
                anchor={monthAnchor}
                onPrev={() => setMonthAnchor(m => { const n = new Date(m); n.setMonth(n.getMonth() - 1); return n; })}
                onNext={() => setMonthAnchor(m => { const n = new Date(m); n.setMonth(n.getMonth() + 1); return n; })}
                onToday={() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); setMonthAnchor(d); }}
                onChange={() => posts.refetch()}
              />
              <aside className="xl:sticky xl:top-20 space-y-4">
                <div className="glass rounded-2xl p-5 space-y-3">
                  <div className="font-semibold">Coming up</div>
                  {upcoming.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Nothing scheduled yet.</div>
                  ) : (
                    <ul className="space-y-2">
                      {upcoming.map((r) => (
                        <li key={String(r.id)} className="rounded-xl bg-secondary px-3 py-2.5">
                          <div className="text-sm font-medium truncate">{String(r.caption ?? r.title ?? "Post")}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            <span className="capitalize">{String(r.platform)}</span> · {new Date(String(r.scheduled_at)).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-2xl border border-sky-500/35 bg-sky-500/[0.07] p-4 text-xs leading-relaxed">
                  <div className="font-semibold text-sky-400 mb-1">How to schedule</div>
                  <span className="text-muted-foreground">Open a finished project and choose <span className="text-foreground">Publish → Schedule</span>. It appears here on its day.</span>
                </div>
              </aside>
            </div>
          )}
          {tab === "scheduled" && (
            <PostsTable rows={rows.filter(r => r.status === "scheduled")} emptyLabel="No scheduled posts" onChange={() => posts.refetch()} />
          )}
          {tab === "queue" && (
            <PostsTable rows={rows.filter(r => r.status === "ready" || r.status === "publishing")} emptyLabel="Queue is empty" onChange={() => posts.refetch()} />
          )}
          {tab === "drafts" && (
            <PostsTable rows={rows.filter(r => r.status === "draft")} emptyLabel="No drafts" onChange={() => posts.refetch()} />
          )}
          {tab === "failed" && (
            <FailedPanel rows={rows.filter(r => r.status === "failed")} onChange={() => posts.refetch()} />
          )}
          {tab === "analytics" && <AnalyticsPanel data={analytics.data} loading={analytics.isLoading} />}
          {tab === "platforms" && <PlatformsPanel data={platforms.data} loading={platforms.isLoading} />}
        </>
      )}
    </div>
  );
}

// ---------- Monthly Calendar ----------

function MonthlyCalendar({
  rows, planned = [], onOpenPlan, anchor, onPrev, onNext, onToday, onChange,
}: {
  rows: Array<Record<string, unknown>>;
  planned?: PlanItemRow[];
  onOpenPlan?: () => void;
  anchor: Date; onPrev: () => void; onNext: () => void; onToday: () => void; onChange: () => void;
}) {
  const plannedByDay = useMemo(() => {
    const map: Record<string, PlanItemRow[]> = {};
    for (const p of planned) (map[p.plan_date] ??= []).push(p);
    return map;
  }, [planned]);
  const first = new Date(anchor);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: Array<{ date: Date | null }> = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ date: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(first.getFullYear(), first.getMonth(), d) });
  while (cells.length % 7 !== 0) cells.push({ date: null });

  const byDay = useMemo(() => {
    const map: Record<string, Array<Record<string, unknown>>> = {};
    for (const r of rows) {
      const s = r.scheduled_at ? new Date(String(r.scheduled_at)) : null;
      if (!s) continue;
      const key = localDayKey(s); // local date, not UTC (IST evenings were landing on the previous day)
      (map[key] ??= []).push(r);
    }
    return map;
  }, [rows]);

  const monthLabel = first.toLocaleString(undefined, { month: "long", year: "numeric" });
  const [openDay, setOpenDay] = useState<Date | null>(null);
  const openItems = openDay ? (byDay[localDayKey(openDay)] ?? []) : [];

  return (
    <section className="glass rounded-2xl p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onPrev}><ChevronLeft className="w-4 h-4" /></Button>
          <div className="text-lg font-bold min-w-[9rem] text-center [font-family:'Space_Grotesk',Inter,sans-serif]">{monthLabel}</div>
          <Button variant="ghost" size="icon" onClick={onNext}><ChevronRight className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={onToday}>Today</Button>
        </div>
        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-3">
          {planned.length > 0 && <LegendDot color="bg-sky-400" label="planned" />}
          <LegendDot color="bg-blue-400" label="scheduled" />
          <LegendDot color="bg-amber-400" label="queue" />
          <LegendDot color="bg-emerald-400" label="published" />
          <LegendDot color="bg-red-400" label="failed" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden text-xs border border-border">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
          <div key={d} className="bg-secondary py-2 text-center text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">{d}</div>
        ))}
        {cells.map((c, i) => {
          const key = c.date ? localDayKey(c.date) : `e${i}`;
          const items = c.date ? (byDay[key] ?? []) : [];
          const isToday = c.date && c.date.toDateString() === new Date().toDateString();
          return (
            <div key={key}
              role={c.date ? "button" : undefined}
              tabIndex={c.date ? 0 : undefined}
              aria-label={c.date ? `${c.date.toDateString()}, ${items.length} post${items.length === 1 ? "" : "s"}` : undefined}
              onClick={(e) => { if (c.date && !(e.target as HTMLElement).closest("button,a")) setOpenDay(c.date); }}
              onKeyDown={(e) => { if (c.date && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpenDay(c.date); } }}
              className={cn(
              "bg-card min-h-[72px] sm:min-h-[110px] p-1 sm:p-1.5 flex flex-col gap-1",
              c.date && "cursor-pointer hover:bg-accent transition",
              !c.date && "opacity-30",
              isToday && "ring-2 ring-inset ring-primary"
            )}>
              {c.date && (
                <div className="flex justify-between items-center">
                  <span className={cn("text-[11px]", isToday ? "text-primary font-bold" : "text-muted-foreground")}>
                    {c.date.getDate()}
                  </span>
                  {items.length > 0 && <span className="text-[9px] text-muted-foreground">{items.length}</span>}
                </div>
              )}
              <div className="flex flex-col gap-1 overflow-hidden">
                {c.date && (plannedByDay[key] ?? []).map((p) => (
                  <button key={p.id} type="button" onClick={onOpenPlan} title={`Content plan: ${p.idea}`}
                    className="text-left truncate rounded px-1.5 py-0.5 text-[10px] bg-sky-500/15 text-sky-200 border border-sky-400/20 hover:bg-sky-500/25">
                    Plan · {p.idea}
                  </button>
                ))}
                {items.slice(0, 3).map((p) => (
                  <CalendarChip key={String(p.id)} row={p} onChange={onChange} />
                ))}
                {items.length > 3 && (
                  <div className="text-[10px] text-muted-foreground pl-1">+{items.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {openDay && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOpenDay(null)}>
          <div role="dialog" aria-label={openDay.toDateString()} className="w-full max-w-md rounded-2xl border border-border bg-card p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{openDay.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</h3>
              <button onClick={() => setOpenDay(null)} aria-label="Close" className="text-muted-foreground hover:text-foreground"><XCircle className="w-5 h-5" /></button>
            </div>
            {openItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing planned for this day yet.</p>
            ) : (
              <div className="space-y-2">
                {openItems.map((p) => (
                  <div key={String(p.id)} className="rounded-lg border border-border p-2.5 text-sm flex items-center gap-2">
                    <span className="capitalize text-muted-foreground text-xs w-20 shrink-0">{String(p.platform)}</span>
                    <span className="flex-1 truncate">{String(p.caption ?? p.title ?? "Post")}</span>
                    <span className="text-[11px] text-muted-foreground">{String(p.status).replace("_", " ")}</span>
                    {p.external_post_url ? <a href={String(p.external_post_url)} target="_blank" rel="noreferrer" className="text-xs underline">View</a> : null}
                  </div>
                ))}
              </div>
            )}
            <Link to="/create" className="inline-flex items-center gap-2 rounded-xl gradient-primary text-white px-4 py-2 text-sm font-semibold">
              Create content for this day
            </Link>
            <p className="text-xs text-muted-foreground">To schedule, open a finished project and choose Publish → Schedule.</p>
          </div>
        </div>
      )}
    </section>
  );
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1"><span className={cn("w-2 h-2 rounded-full", color)} />{label}</span>;
}

function CalendarChip({ row, onChange }: { row: Record<string, unknown>; onChange: () => void }) {
  const status = String(row.status);
  const bg =
    status === "published" || status === "manually_published" ? "bg-emerald-500/30 border-emerald-400/40" :
    status === "failed" ? "bg-red-500/30 border-red-400/40" :
    status === "ready" || status === "publishing" ? "bg-amber-500/30 border-amber-400/40" :
    "bg-blue-500/30 border-blue-400/40";
  const Icon = PLATFORM_ICON[String(row.platform)] ?? Instagram;
  const cancel = useServerFn(cancelScheduledPost);
  const time = row.scheduled_at ? new Date(String(row.scheduled_at)).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <div
      className={cn("rounded border px-1.5 py-1 text-[10px] flex items-center gap-1 truncate group", bg)}
      title={String(row.caption ?? row.platform)}
    >
      <Icon className="w-3 h-3 shrink-0" />
      <span className="truncate flex-1">{time} · {String(row.caption ?? "").slice(0, 24) || String(row.platform)}</span>
      {!row.readonly && (
        <button
          className="opacity-0 group-hover:opacity-100 transition"
          onClick={async () => { await cancel({ data: { id: String(row.id) } }); onChange(); }}
          title="Remove"
        ><XCircle className="w-3 h-3" /></button>
      )}
    </div>
  );
}

// ---------- Posts Table ----------

function PostsTable({
  rows, emptyLabel, onChange,
}: { rows: Array<Record<string, unknown>>; emptyLabel: string; onChange: () => void }) {
  const cancel = useServerFn(cancelScheduledPost);
  const publishNow = useServerFn(publishScheduledPostNow);
  const update = useServerFn(updateScheduledPost);

  if (rows.length === 0) {
    return <div className="p-12 text-center text-muted-foreground rounded-2xl border border-border bg-white/[0.03]">{emptyLabel}</div>;
  }
  return (
    <div className="rounded-2xl border border-border bg-white/[0.03] overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-white/5 text-muted-foreground text-xs uppercase tracking-wider">
          <tr>
            <th className="text-left px-4 py-2">Platform</th>
            <th className="text-left px-4 py-2">Caption</th>
            <th className="text-left px-4 py-2">Scheduled</th>
            <th className="text-left px-4 py-2">Status</th>
            <th className="text-right px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const Icon = PLATFORM_ICON[String(r.platform)] ?? Instagram;
            return (
              <tr key={String(r.id)} className="border-t border-white/5 hover:bg-white/[0.03]">
                <td className="px-4 py-3"><div className="flex items-center gap-2"><Icon className="w-4 h-4" />{String(r.platform)}</div></td>
                <td className="px-4 py-3 text-white/80 max-w-md truncate">{String(r.caption ?? "—")}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.scheduled_at ? new Date(String(r.scheduled_at)).toLocaleString() : "—"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={String(r.status)} />
                  {r.external_post_url ? (
                    <a href={String(r.external_post_url)} target="_blank" rel="noreferrer" className="block text-xs text-primary hover:underline mt-1">View post</a>
                  ) : r.last_error && r.status !== "published" ? (
                    <div className="text-xs text-red-300/80 mt-1 max-w-xs truncate" title={String(r.last_error)}>{String(r.last_error)}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    {String(r.status) === "draft" && (
                      <Button size="sm" variant="ghost" onClick={async () => {
                        await update({ data: { id: String(r.id), status: "ready" } });
                        toast.success("Moved to queue"); onChange();
                      }}><Send className="w-3 h-3" /></Button>
                    )}
                    {["scheduled", "ready", "failed", "reconnect_required"].includes(String(r.status)) && (
                      <Button size="sm" variant="ghost" title="Publish now" onClick={async () => {
                        const t = toast.loading("Publishing…");
                        try {
                          const res = await publishNow({ data: { id: String(r.id) } });
                          toast.dismiss(t);
                          if (res.status === "published") toast.success("Published", res.url ? { action: { label: "View", onClick: () => window.open(res.url!, "_blank") } } : undefined);
                          else if (res.status === "publishing") toast.success("Uploading — Instagram is processing the video");
                          else toast.error("Couldn't publish", { description: res.error ?? undefined });
                        } catch (e) {
                          toast.dismiss(t);
                          toast.error(e instanceof Error ? e.message : "Couldn't publish");
                        }
                        onChange();
                      }}><Send className="w-3 h-3" /></Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={async () => {
                      await cancel({ data: { id: String(r.id) } });
                      toast.success("Removed"); onChange();
                    }}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { c: string; Icon: typeof Clock }> = {
    draft:              { c: "bg-white/10 text-muted-foreground", Icon: Clock },
    ready:              { c: "bg-amber-500/20 text-amber-200", Icon: Clock },
    scheduled:          { c: "bg-blue-500/20 text-blue-200", Icon: Clock },
    publishing:         { c: "bg-amber-500/20 text-amber-200", Icon: Clock },
    published:          { c: "bg-emerald-500/20 text-emerald-200", Icon: CheckCircle2 },
    manually_published: { c: "bg-emerald-500/20 text-emerald-200", Icon: CheckCircle2 },
    failed:             { c: "bg-red-500/20 text-red-200", Icon: XCircle },
    reconnect_required: { c: "bg-orange-500/20 text-orange-200", Icon: AlertTriangle },
  };
  const { c, Icon } = map[status] ?? map.draft;
  return <span className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs", c)}><Icon className="w-3 h-3" />{status}</span>;
}

// ---------- Failed ----------

function FailedPanel({ rows, onChange }: { rows: Array<Record<string, unknown>>; onChange: () => void }) {
  const retryOne = useServerFn(retryScheduledPost);
  const retryAll = useServerFn(retryAllFailed);
  const cancel = useServerFn(cancelScheduledPost);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{rows.length} failed post{rows.length === 1 ? "" : "s"}</div>
        {rows.length > 0 && (
          <Button size="sm" variant="outline" onClick={async () => {
            const res = await retryAll({});
            toast.success(`Retrying ${res.count} post${res.count === 1 ? "" : "s"}`); onChange();
          }}><RefreshCw className="w-3 h-3 mr-2" /> Retry all</Button>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground rounded-2xl border border-border bg-white/[0.03]">No failed posts</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const Icon = PLATFORM_ICON[String(r.platform)] ?? Instagram;
            return (
              <div key={String(r.id)} className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4 text-red-300" />
                      <span className="text-sm text-white/80 truncate">{String(r.caption ?? "—")}</span>
                    </div>
                    {r.last_error ? <div className="text-xs text-red-300/80 mt-1"><AlertTriangle className="inline w-3 h-3 mr-1" />{String(r.last_error)}</div> : null}
                    <div className="text-[11px] text-muted-foreground mt-1">Attempts: {String(r.attempts ?? 0)}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" onClick={async () => {
                      await retryOne({ data: { id: String(r.id) } }); toast.success("Retrying"); onChange();
                    }}><RefreshCw className="w-3 h-3 mr-1" /> Retry</Button>
                    <Button size="sm" variant="ghost" onClick={async () => {
                      await cancel({ data: { id: String(r.id) } }); onChange();
                    }}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------- Analytics ----------

function AnalyticsPanel({ data, loading }: { data: Awaited<ReturnType<typeof getPublishingAnalytics>> | undefined; loading: boolean }) {
  if (loading || !data) return <div className="p-12 text-center text-muted-foreground">Loading analytics…</div>;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Total posts" value={data.total} />
        <Metric label="Published" value={data.published} accent="text-emerald-300" />
        <Metric label="Failed" value={data.failed} accent="text-red-300" />
        <Metric label="Success rate" value={`${data.successRate}%`} accent="text-pink-300" />
      </div>
      <div className="rounded-2xl border border-border bg-white/[0.03] p-4">
        <div className="text-sm font-semibold mb-3">By platform</div>
        <div className="grid gap-2 md:grid-cols-2">
          {Object.entries(data.byPlatform).map(([p, s]) => {
            const Icon = PLATFORM_ICON[p] ?? Instagram;
            return (
              <div key={p} className="flex items-center justify-between rounded-lg border border-white/5 bg-black/30 p-3">
                <div className="flex items-center gap-2"><Icon className="w-4 h-4" /><span className="capitalize">{p}</span></div>
                <div className="flex gap-3 text-xs">
                  <span className="text-emerald-300">✓ {s.published}</span>
                  <span className="text-amber-300">⏱ {s.scheduled}</span>
                  <span className="text-red-300">✗ {s.failed}</span>
                </div>
              </div>
            );
          })}
          {Object.keys(data.byPlatform).length === 0 && <div className="text-sm text-muted-foreground">No posts yet</div>}
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-white/[0.03] p-4">
        <div className="text-sm font-semibold mb-3">Last 30 days · published</div>
        <Sparkline data={data.last30} />
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white/[0.03] p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-3xl font-bold mt-2", accent ?? "text-white")}>{value}</div>
    </div>
  );
}

function Sparkline({ data }: { data: Record<string, number> }) {
  const days: Array<{ day: string; v: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ day: key.slice(5), v: data[key] ?? 0 });
  }
  const max = Math.max(1, ...days.map(d => d.v));
  return (
    <div className="flex items-end gap-1 h-24">
      {days.map(d => (
        <div key={d.day} title={`${d.day}: ${d.v}`} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full rounded-t bg-gradient-to-t from-pink-500/60 to-orange-400/60" style={{ height: `${(d.v / max) * 100}%`, minHeight: d.v ? 2 : 0 }} />
        </div>
      ))}
    </div>
  );
}

// ---------- Platform Status ----------

function PlatformsPanel({ data, loading }: { data: Awaited<ReturnType<typeof getPlatformStatus>> | undefined; loading: boolean }) {
  if (loading || !data) return <div className="p-12 text-center text-muted-foreground">Loading platforms…</div>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {data.map((p) => {
        const Icon = PLATFORM_ICON[p.platform] ?? Instagram;
        const ok = p.connected;
        return (
          <div key={p.platform} className={cn(
            "rounded-2xl border p-4 backdrop-blur-xl",
            ok ? "border-emerald-500/30 bg-emerald-500/[0.04]" : "border-border bg-white/[0.03]",
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center",
                  ok ? "bg-emerald-500/20 text-emerald-200" : "bg-white/5 text-muted-foreground")}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="capitalize font-semibold">{p.platform}</div>
                  <div className="text-xs text-muted-foreground">{p.accountName ?? "Not connected"}</div>
                </div>
              </div>
              <Badge variant="outline" className={ok ? "border-emerald-400/40 text-emerald-200" : "border-white/20 text-muted-foreground"}>
                {p.status}
              </Badge>
            </div>
            {!ok && !isHiddenPath("/connections") && (
              <a href="/connections" className="mt-3 inline-flex items-center gap-2 text-sm text-pink-300 hover:text-pink-200">
                <Plug className="w-3.5 h-3.5" /> Connect {p.platform}
              </a>
            )}
            {p.expiresAt && (
              <div className="text-[11px] text-muted-foreground mt-2">
                Token expires {new Date(p.expiresAt).toLocaleDateString()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
