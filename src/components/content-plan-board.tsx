// Admin: CreatorFlow's own content plan, day by day, with the post creator's
// drafts under each day. Drafts are approved, scheduled or marked as posted
// from the same cards Agent HQ → Marketing uses.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Sparkles, Undo2, XCircle } from "lucide-react";
import { draftPlanItems, listSocialPlan, setPlanItemStatus, type PlanItemRow, type PlanTaskRow } from "@/lib/social-plan.functions";
import { SocialPostCard } from "@/components/agent-marketing-panel";
import type { AgentTask } from "@/lib/agent-hq.functions";
import { canAutoBuild, isLongYoutubeRef, queueAutoBuild, useAutoBuilds, type AutoBuildRef } from "@/lib/content-plan-autobuild";

const PLATFORM: Record<string, string> = { instagram: "Instagram", youtube: "YouTube", facebook: "Facebook", linkedin: "LinkedIn" };
const STATUS_STYLE: Record<string, string> = {
  planned: "bg-white/10 text-white/70",
  drafted: "bg-amber-500/15 text-amber-300",
  done: "bg-emerald-500/15 text-emerald-300",
  skipped: "bg-white/5 text-white/40 line-through",
};
const BUILD_LABEL: Record<string, string> = {
  walkthrough: "Product clip (ready)", video: "Video Studio", thumbnail: "Thumbnail Studio", carousel: "Carousels", image: "Image Studio",
};

function fmt12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function usePlanItems(enabled = true) {
  const listFn = useServerFn(listSocialPlan);
  return useQuery({ queryKey: ["social-plan"], queryFn: () => listFn(), staleTime: 30_000, enabled });
}

/** Status of a day from its drafts: done once every draft is handled. */
function dayStatus(item: PlanItemRow, tasks: PlanTaskRow[]): PlanItemRow["status"] {
  if (item.status === "skipped" || item.status === "planned") return item.status;
  if (tasks.length && tasks.every((t) => t.status === "done" || t.status === "rejected")) return "done";
  return item.status;
}

export function ContentPlanBoard() {
  const plan = usePlanItems();
  const qc = useQueryClient();
  const draftFn = useServerFn(draftPlanItems);
  const statusFn = useServerFn(setPlanItemStatus);
  const [busy, setBusy] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const builds = useAutoBuilds();
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

  const tasksByItem = useMemo(() => {
    const m = new Map<string, PlanTaskRow[]>();
    for (const t of plan.data?.tasks ?? []) {
      const id = String(t.source_ref?.plan_item_id ?? "");
      if (!id) continue;
      (m.get(id) ?? m.set(id, []).get(id)!).push(t);
    }
    return m;
  }, [plan.data]);

  const items = (plan.data?.items ?? []).filter((i) => showPast || i.plan_date >= today);
  const refresh = () => qc.invalidateQueries({ queryKey: ["social-plan"] });

  async function draft(ids: string[], key: string) {
    setBusy(key);
    try {
      const r = await draftFn({ data: { ids } });
      toast.success(r.drafted ? `${r.drafted} posts drafted` : "Nothing to draft");
      refresh();
      qc.invalidateQueries({ queryKey: ["agent-hq"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Drafting failed"); }
    finally { setBusy(null); }
  }
  async function setStatus(id: string, status: PlanItemRow["status"]) {
    await statusFn({ data: { id, status } });
    refresh();
  }

  if (plan.isLoading) return <div className="p-12 text-center text-white/50">Loading the content plan…</div>;
  if (plan.error) return <div className="p-6 text-red-300 text-sm">{(plan.error as Error).message}</div>;
  if (!plan.data?.items.length) return <div className="p-12 text-center text-white/50">No content plan yet.</div>;

  const nextPlanned = items.filter((i) => i.status === "planned").slice(0, 3);

  // Video drafts still missing their video. A reel is built once per day and
  // shared to that day's posts; a long YouTube video is its own build (plus
  // one teaser reel for the other platforms).
  const toBuild: Array<{ taskId: string; title: string; ref: AutoBuildRef }> = [];
  for (const it of items) {
    const open = (tasksByItem.get(it.id) ?? []).filter((t) => t.status === "waiting_approval");
    let reelQueued = false;
    for (const t of open) {
      const ref = t.source_ref as unknown as AutoBuildRef & { needs_build?: boolean; media_url?: string | null };
      if (!ref.needs_build || ref.media_url || !canAutoBuild(ref)) continue;
      if (isLongYoutubeRef(ref)) toBuild.push({ taskId: t.id, title: t.title, ref });
      else if (!reelQueued) { reelQueued = true; toBuild.push({ taskId: t.id, title: t.title, ref }); }
    }
  }
  const pending = toBuild.filter((b) => !builds.some((s) => s.taskId === b.taskId && (s.state === "queued" || s.state === "running" || s.state === "done")));
  const activeBuilds = builds.filter((s) => s.state === "queued" || s.state === "running");

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70 flex flex-wrap items-center gap-3 justify-between">
        <p className="max-w-3xl">
          The post creator drafts each day two days ahead (08:10 IST) — one post per platform. Days marked
          <span className="text-white"> Product clip</span> are ready to approve. Video days: click <span className="text-white">Build</span> and
          the video is made in this tab and attached for you, ready to approve. Carousel, image and thumbnail days open their studio; then
          <span className="text-white"> Attach media</span>. Nothing posts without your approval;
          platforms that aren't connected get <span className="text-white">Copy</span> and <span className="text-white">Mark as posted</span>.
        </p>
        <div className="flex items-center gap-2">
          {nextPlanned.length > 0 && (
            <button disabled={busy !== null} onClick={() => draft(nextPlanned.map((i) => i.id), "next")}
              className="rounded-lg gradient-primary text-white px-3 py-1.5 text-sm inline-flex items-center gap-1.5 disabled:opacity-60">
              {busy === "next" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Draft next {nextPlanned.length} days now
            </button>
          )}
          {pending.length > 0 && (
            <button onClick={() => {
              pending.forEach((b) => queueAutoBuild(b));
              toast.message(`${pending.length} video${pending.length === 1 ? "" : "s"} queued — keep this tab open`, { description: "They build one after another." });
            }}
              className="rounded-lg glass border border-border px-3 py-1.5 text-sm inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Build all videos ({pending.length})
            </button>
          )}
          <label className="text-xs text-white/50 inline-flex items-center gap-1.5">
            <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Show past days
          </label>
        </div>
      </div>
      {activeBuilds.length > 0 && (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 px-4 py-2 text-xs text-white/80 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-300" />
          Building {activeBuilds.length} video{activeBuilds.length === 1 ? "" : "s"}: {activeBuilds.find((b) => b.state === "running")?.step ?? "waiting"} · keep this tab open
        </div>
      )}

      {items.map((it) => {
        const tasks = tasksByItem.get(it.id) ?? [];
        const open = tasks.filter((t) => t.status === "waiting_approval");
        const status = dayStatus(it, tasks);
        const date = new Date(`${it.plan_date}T00:00:00`);
        return (
          <div key={it.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="text-xs text-white/50">
                  Day {it.day_number} · {date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                  {it.plan_date === today && <span className="ml-2 text-pink-300 font-semibold">Today</span>}
                </div>
                <div className={`font-semibold ${status === "skipped" ? "line-through text-white/40" : ""}`}>{it.idea}</div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className="px-2 py-0.5 rounded-full bg-white/10">{it.format === "long" ? "Long video + teaser" : it.format}</span>
                  <span className="px-2 py-0.5 rounded-full bg-white/10">{BUILD_LABEL[it.build]}</span>
                  {it.platforms.map((p) => (
                    <span key={p.platform} className="px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-200">{PLATFORM[p.platform] ?? p.platform} {fmt12(p.time)}</span>
                  ))}
                </div>
                {it.notes && <div className="text-xs text-white/50">{it.notes}</div>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] uppercase px-2 py-0.5 rounded ${STATUS_STYLE[status]}`}>{status}</span>
                {it.status === "planned" && (
                  <button disabled={busy !== null} onClick={() => draft([it.id], it.id)}
                    className="rounded-lg glass border border-border px-3 py-1.5 text-sm inline-flex items-center gap-1.5 disabled:opacity-60">
                    {busy === it.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Draft now
                  </button>
                )}
                {it.status !== "skipped" && it.status !== "done" && (
                  <button onClick={() => setStatus(it.id, "skipped")} title="Skip this day"
                    className="rounded-lg glass border border-border px-2 py-1.5 text-sm"><XCircle className="w-3.5 h-3.5" /></button>
                )}
                {it.status === "skipped" && (
                  <button onClick={() => setStatus(it.id, tasks.length ? "drafted" : "planned")} title="Restore"
                    className="rounded-lg glass border border-border px-2 py-1.5 text-sm"><Undo2 className="w-3.5 h-3.5" /></button>
                )}
              </div>
            </div>
            {open.length > 0 && (
              <div className="grid lg:grid-cols-2 gap-4">
                {open.map((t) => <SocialPostCard key={t.id} t={t as unknown as AgentTask} />)}
              </div>
            )}
            {tasks.length > open.length && (
              <div className="text-xs text-white/50">
                {tasks.filter((t) => t.status === "done").map((t) => `${PLATFORM[String(t.source_ref?.platform)] ?? t.source_ref?.platform} ✓`).join(" · ")}
                {tasks.some((t) => t.status === "rejected") && " · some drafts rejected"}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
