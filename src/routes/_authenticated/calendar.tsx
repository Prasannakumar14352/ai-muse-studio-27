import { createFileRoute, useRouter } from "@tanstack/react-router";
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
        <p className="text-sm text-white/60 mb-4">{error.message}</p>
        <Button onClick={() => { reset(); router.invalidate(); }}>Retry</Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-8 text-white">Not found</div>,
});

type Tab = "calendar" | "scheduled" | "queue" | "drafts" | "failed" | "analytics" | "platforms";

const PLATFORM_ICON: Record<string, typeof Instagram> = {
  instagram: Instagram, facebook: Facebook, youtube: Youtube, linkedin: Linkedin,
};

function CalendarPage() {
  const [tab, setTab] = useState<Tab>("calendar");
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#120a08] via-[#0d0605] to-black text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1 text-xs uppercase tracking-widest text-pink-300/70">
              <CalendarIcon className="w-3.5 h-3.5" /> Publishing
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-300 to-orange-300 bg-clip-text text-transparent">
              Content Calendar
            </h1>
            <p className="text-white/60 text-sm mt-1">
              Plan, schedule, and monitor every post across your connected platforms.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { posts.refetch(); analytics.refetch(); platforms.refetch(); }}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </header>

        <HandoffBanner prefill={handoff} onDismiss={() => setHandoff(null)} />


        <nav className="flex gap-2 flex-wrap mb-6 border-b border-white/10 pb-3">
          {([
            ["calendar", "Monthly Calendar"],
            ["scheduled", `Scheduled${counts.scheduled ? ` (${counts.scheduled})` : ""}`],
            ["queue", `Queue${counts.queue ? ` (${counts.queue})` : ""}`],
            ["drafts", `Drafts${counts.drafts ? ` (${counts.drafts})` : ""}`],
            ["failed", `Failed${counts.failed ? ` (${counts.failed})` : ""}`],
            ["analytics", "Analytics"],
            ["platforms", "Platform Status"],
          ] as Array<[Tab, string]>).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm transition",
                tab === id
                  ? "bg-gradient-to-r from-pink-500/30 to-orange-500/30 text-white border border-pink-400/40"
                  : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent",
              )}
            >{label}</button>
          ))}
        </nav>

        {posts.isLoading ? (
          <div className="p-12 text-center text-white/50">Loading…</div>
        ) : (
          <>
            {tab === "calendar" && (
              <MonthlyCalendar
                rows={rows}
                anchor={monthAnchor}
                onPrev={() => setMonthAnchor(m => { const n = new Date(m); n.setMonth(n.getMonth() - 1); return n; })}
                onNext={() => setMonthAnchor(m => { const n = new Date(m); n.setMonth(n.getMonth() + 1); return n; })}
                onToday={() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); setMonthAnchor(d); }}
                onChange={() => posts.refetch()}
              />
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
    </div>
  );
}

// ---------- Monthly Calendar ----------

function MonthlyCalendar({
  rows, anchor, onPrev, onNext, onToday, onChange,
}: {
  rows: Array<Record<string, unknown>>;
  anchor: Date; onPrev: () => void; onNext: () => void; onToday: () => void; onChange: () => void;
}) {
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
      const key = s.toISOString().slice(0, 10);
      (map[key] ??= []).push(r);
    }
    return map;
  }, [rows]);

  const monthLabel = first.toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onPrev}><ChevronLeft className="w-4 h-4" /></Button>
          <div className="text-lg font-semibold min-w-[10rem] text-center">{monthLabel}</div>
          <Button variant="ghost" size="icon" onClick={onNext}><ChevronRight className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={onToday}>Today</Button>
        </div>
        <div className="text-xs text-white/50 flex items-center gap-3">
          <LegendDot color="bg-blue-400" label="scheduled" />
          <LegendDot color="bg-amber-400" label="queue" />
          <LegendDot color="bg-emerald-400" label="published" />
          <LegendDot color="bg-red-400" label="failed" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px bg-white/5 rounded-xl overflow-hidden text-xs">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
          <div key={d} className="bg-black/40 py-2 text-center text-white/50 uppercase tracking-wider">{d}</div>
        ))}
        {cells.map((c, i) => {
          const key = c.date ? c.date.toISOString().slice(0,10) : `e${i}`;
          const items = c.date ? (byDay[key] ?? []) : [];
          const isToday = c.date && c.date.toDateString() === new Date().toDateString();
          return (
            <div key={key} className={cn(
              "bg-black/30 min-h-[110px] p-1.5 flex flex-col gap-1",
              !c.date && "opacity-30",
              isToday && "ring-1 ring-pink-400/60"
            )}>
              {c.date && (
                <div className="flex justify-between items-center">
                  <span className={cn("text-[11px]", isToday ? "text-pink-300 font-semibold" : "text-white/60")}>
                    {c.date.getDate()}
                  </span>
                  {items.length > 0 && <span className="text-[9px] text-white/40">{items.length}</span>}
                </div>
              )}
              <div className="flex flex-col gap-1 overflow-hidden">
                {items.slice(0, 3).map((p) => (
                  <CalendarChip key={String(p.id)} row={p} onChange={onChange} />
                ))}
                {items.length > 3 && (
                  <div className="text-[10px] text-white/40 pl-1">+{items.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
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
      <button
        className="opacity-0 group-hover:opacity-100 transition"
        onClick={async () => { await cancel({ data: { id: String(row.id) } }); onChange(); }}
        title="Remove"
      ><XCircle className="w-3 h-3" /></button>
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
    return <div className="p-12 text-center text-white/50 rounded-2xl border border-white/10 bg-white/[0.03]">{emptyLabel}</div>;
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-white/5 text-white/60 text-xs uppercase tracking-wider">
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
                <td className="px-4 py-3 text-white/60">{r.scheduled_at ? new Date(String(r.scheduled_at)).toLocaleString() : "—"}</td>
                <td className="px-4 py-3"><StatusBadge status={String(r.status)} /></td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    {String(r.status) === "draft" && (
                      <Button size="sm" variant="ghost" onClick={async () => {
                        await update({ data: { id: String(r.id), status: "ready" } });
                        toast.success("Moved to queue"); onChange();
                      }}><Send className="w-3 h-3" /></Button>
                    )}
                    {String(r.status) === "scheduled" && (
                      <Button size="sm" variant="ghost" onClick={async () => {
                        await publishNow({ data: { id: String(r.id) } });
                        toast.success("Queued for immediate publishing"); onChange();
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
    draft:              { c: "bg-white/10 text-white/70", Icon: Clock },
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
        <div className="text-sm text-white/60">{rows.length} failed post{rows.length === 1 ? "" : "s"}</div>
        {rows.length > 0 && (
          <Button size="sm" variant="outline" onClick={async () => {
            const res = await retryAll({});
            toast.success(`Retrying ${res.count} post${res.count === 1 ? "" : "s"}`); onChange();
          }}><RefreshCw className="w-3 h-3 mr-2" /> Retry all</Button>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="p-12 text-center text-white/50 rounded-2xl border border-white/10 bg-white/[0.03]">No failed posts</div>
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
                    <div className="text-[11px] text-white/40 mt-1">Attempts: {String(r.attempts ?? 0)}</div>
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
  if (loading || !data) return <div className="p-12 text-center text-white/50">Loading analytics…</div>;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Total posts" value={data.total} />
        <Metric label="Published" value={data.published} accent="text-emerald-300" />
        <Metric label="Failed" value={data.failed} accent="text-red-300" />
        <Metric label="Success rate" value={`${data.successRate}%`} accent="text-pink-300" />
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
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
          {Object.keys(data.byPlatform).length === 0 && <div className="text-sm text-white/50">No posts yet</div>}
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="text-sm font-semibold mb-3">Last 30 days · published</div>
        <Sparkline data={data.last30} />
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-xs uppercase tracking-wider text-white/50">{label}</div>
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
  if (loading || !data) return <div className="p-12 text-center text-white/50">Loading platforms…</div>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {data.map((p) => {
        const Icon = PLATFORM_ICON[p.platform] ?? Instagram;
        const ok = p.connected;
        return (
          <div key={p.platform} className={cn(
            "rounded-2xl border p-4 backdrop-blur-xl",
            ok ? "border-emerald-500/30 bg-emerald-500/[0.04]" : "border-white/10 bg-white/[0.03]",
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center",
                  ok ? "bg-emerald-500/20 text-emerald-200" : "bg-white/5 text-white/50")}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="capitalize font-semibold">{p.platform}</div>
                  <div className="text-xs text-white/50">{p.accountName ?? "Not connected"}</div>
                </div>
              </div>
              <Badge variant="outline" className={ok ? "border-emerald-400/40 text-emerald-200" : "border-white/20 text-white/60"}>
                {p.status}
              </Badge>
            </div>
            {!ok && (
              <a href="/connections" className="mt-3 inline-flex items-center gap-2 text-sm text-pink-300 hover:text-pink-200">
                <Plug className="w-3.5 h-3.5" /> Connect {p.platform}
              </a>
            )}
            {p.expiresAt && (
              <div className="text-[11px] text-white/40 mt-2">
                Token expires {new Date(p.expiresAt).toLocaleDateString()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
