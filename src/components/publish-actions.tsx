// Universal "Download / Publish / Schedule / Copy / Mark manually published"
// action bar for any generated project (image, carousel, video, thumbnail).
// Publishing opens a dialog: tick one or more connected accounts (several
// YouTube channels, Instagram accounts, Pages… at once), then publish now or
// schedule. Each account gets its own post, with that platform's caption.
// Platforms that aren't connected, or can't take this content, show why and
// link to Connected Accounts. Download and manual posting always work.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Download, Send, Clock, Copy, CheckCircle2, ExternalLink, Loader2, Share2, Check,
} from "lucide-react";
import {
  markManuallyPublished, schedulePost, listPublishTargets, platformMediaProblem,
  PLATFORMS, type Platform, type PublishStatus,
} from "@/lib/publishing.functions";
import { copyText, downloadPlatformPackage, buildLinkedInPost } from "@/lib/downloads";
import { isHiddenPath } from "@/lib/hidden-features";

export type PublishActionsProps = {
  projectId?: string;
  title: string;
  status?: PublishStatus | null;
  caption?: string;
  hashtags?: string;
  cta?: string;
  altText?: string;
  description?: string;
  tags?: string[];
  media?: Array<{ url: string; kind: "image" | "video" | "thumbnail"; name?: string }>;
  /** Per-platform caption/hashtags (e.g. from the Publish Kit). Falls back to caption/hashtags. */
  captions?: Partial<Record<Platform, { caption?: string; hashtags?: string }>>;
  /** Title used for YouTube (and as the LinkedIn media title). Defaults to `title`. */
  postTitle?: string;
  /** Platform selected when the dialog opens. */
  defaultPlatform?: Platform;
  /** Custom Download handler. If provided, replaces the default (which packages a per-platform ZIP). */
  onDownload?: () => void | Promise<void>;
  onEdit?: () => void;
  onPreview?: () => void;
  onDuplicate?: () => void;
  className?: string;
};

const LABELS: Record<PublishStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  scheduled: "Scheduled",
  publishing: "Publishing…",
  published: "Published",
  manually_published: "Manually published",
  failed: "Failed",
  reconnect_required: "Reconnect required",
};

const BADGE_COLORS: Record<PublishStatus, string> = {
  draft: "bg-white/5 text-muted-foreground",
  ready: "bg-blue-500/15 text-blue-300",
  scheduled: "bg-amber-500/15 text-amber-300",
  publishing: "bg-amber-500/15 text-amber-300",
  published: "bg-emerald-500/15 text-emerald-300",
  manually_published: "bg-emerald-500/15 text-emerald-300",
  failed: "bg-red-500/15 text-red-300",
  reconnect_required: "bg-amber-500/15 text-amber-300",
};

export function PublishActions(props: PublishActionsProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "download" | "publish" | "schedule" | "manual">(null);
  const [platform, setPlatform] = useState<Platform>(props.defaultPlatform ?? "instagram");
  const [scheduleAt, setScheduleAt] = useState<string>("");
  const mark = useServerFn(markManuallyPublished);
  const schedule = useServerFn(schedulePost);
  const targetsFn = useServerFn(listPublishTargets);
  const qc = useQueryClient();
  const targetsQ = useQuery({
    queryKey: ["publish-targets"],
    queryFn: () => targetsFn(),
    enabled: open,
    staleTime: 30_000,
  });
  const targets = targetsQ.data ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const mediaUrls = (props.media ?? []).filter((m) => m.kind !== "thumbnail").map((m) => m.url);
  const problemFor = (p: Platform) => platformMediaProblem(p, mediaUrls);
  const selectedTargets = targets.filter((t) => selected.includes(t.id));
  const canPublish = selectedTargets.length > 0;

  // Nothing is pre-selected: content is only published to accounts the user ticks.
  useEffect(() => {
    if (!open) setSelected([]);
  }, [open]);

  function toggle(id: string, p: Platform) {
    setPlatform(p);
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }
  const textFor = (p: Platform) => ({
    caption: props.captions?.[p]?.caption ?? props.caption,
    hashtags: props.captions?.[p]?.hashtags ?? props.hashtags,
  });

  const status = props.status ?? "ready";

  async function handleDownload() {
    setBusy("download");
    try {
      if (props.onDownload) {
        await props.onDownload();
      } else {
        await downloadPlatformPackage({
          title: props.title,
          platform,
          caption: props.caption,
          hashtags: props.hashtags,
          cta: props.cta,
          altText: props.altText,
          description: props.description,
          tags: props.tags,
          media: props.media,
        });
        toast.success("Download started");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(null);
    }
  }

  function payloadFor(t: { id: string; platform: Platform }, scheduledAt?: string) {
    const txt = textFor(t.platform);
    return {
      projectId: props.projectId!, platform: t.platform, connectionId: t.id,
      title: props.postTitle ?? props.title,
      caption: txt.caption, hashtags: txt.hashtags, mediaUrls, scheduledAt,
    };
  }

  /** Publish/schedule to every ticked account; one post per account. */
  async function runAll(kind: "publish" | "schedule") {
    if (!props.projectId) return toast.error("Save the project first");
    if (kind === "schedule" && !scheduleAt) return toast.error("Pick a date & time");
    const list = selectedTargets;
    if (list.length === 0) return toast.error("Pick at least one account");
    setBusy(kind);
    const iso = kind === "schedule" ? new Date(scheduleAt).toISOString() : undefined;
    const toastId = toast.loading(
      kind === "publish" ? `Publishing to ${list.length} account${list.length > 1 ? "s" : ""}…` : "Scheduling…",
    );
    const results = await Promise.allSettled(list.map((t) => schedule({ data: payloadFor(t, iso) })));
    toast.dismiss(toastId);
    qc.invalidateQueries({ queryKey: ["scheduled_posts"] });

    const done: Array<{ label: string; url: string | null }> = [];
    const pending: string[] = [];
    const failed: string[] = [];
    results.forEach((r, i) => {
      const t = list[i];
      const name = `${t.label} (${t.platform})`;
      if (r.status === "rejected") { failed.push(`${name}: ${r.reason instanceof Error ? r.reason.message : "failed"}`); return; }
      const v = r.value;
      if (v.status === "published") done.push({ label: name, url: v.url });
      else if (v.status === "scheduled" && kind === "schedule") done.push({ label: name, url: null });
      else if (v.status === "publishing" || v.status === "scheduled") pending.push(name);
      else failed.push(`${name}: ${v.error ?? v.status}`);
    });

    if (done.length) {
      const first = done.find((d) => d.url);
      toast.success(
        kind === "publish"
          ? `Published to ${done.length} account${done.length > 1 ? "s" : ""}`
          : `Scheduled for ${new Date(iso!).toLocaleString()} on ${done.length} account${done.length > 1 ? "s" : ""}`,
        {
          description: done.map((d) => d.label).join(", "),
          ...(first?.url ? { action: { label: "View post", onClick: () => window.open(first.url!, "_blank") } } : {}),
        },
      );
    }
    if (pending.length) toast.message("Still processing — goes live within a few minutes", { description: pending.join(", ") });
    if (failed.length) {
      toast.error(`Couldn't publish to ${failed.length} account${failed.length > 1 ? "s" : ""}`, { description: failed.join("\n") });
      qc.invalidateQueries({ queryKey: ["publish-targets"] });
    }
    if (!failed.length) setOpen(false);
    setBusy(null);
  }

  const handlePublishNow = () => runAll("publish");
  const handleSchedule = () => runAll("schedule");

  async function handleMarkPublished() {
    if (!props.projectId) return toast.error("Save the project first");
    setBusy("manual");
    try {
      await mark({ data: { projectId: props.projectId, platform } });
      toast.success("Marked as manually published");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleCopyLinkedIn() {
    await copyText(buildLinkedInPost({ caption: props.caption ?? "", hashtags: props.hashtags, cta: props.cta }), "LinkedIn post copied");
  }

  return (
    <div className={"flex flex-wrap items-center gap-2 " + (props.className ?? "")}>
      <span className={`px-2 py-0.5 rounded-full text-xs ${BADGE_COLORS[status]}`}>{LABELS[status]}</span>

      <button
        onClick={handleDownload}
        disabled={busy !== null}
        className="rounded-lg gradient-primary text-white px-3 py-1.5 text-sm font-medium flex items-center gap-1.5 disabled:opacity-60"
      >
        {busy === "download" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        Download
      </button>

      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 text-sm font-medium flex items-center gap-1.5"
      >
        <Send className="w-3.5 h-3.5" /> Publish
      </button>

      {props.caption && (
        <button onClick={() => copyText(props.caption!, "Caption copied")}
          className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 text-sm flex items-center gap-1.5">
          <Copy className="w-3.5 h-3.5" /> Caption
        </button>
      )}
      {props.hashtags && (
        <button onClick={() => copyText(props.hashtags!, "Hashtags copied")}
          className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 text-sm flex items-center gap-1.5">
          <Copy className="w-3.5 h-3.5" /> Hashtags
        </button>
      )}
      {props.caption && (
        <button onClick={handleCopyLinkedIn}
          className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 text-sm flex items-center gap-1.5">
          <Share2 className="w-3.5 h-3.5" /> LinkedIn text
        </button>
      )}
      {props.onEdit && (
        <button onClick={props.onEdit}
          className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 text-sm">Edit</button>
      )}
      {props.onDuplicate && (
        <button onClick={props.onDuplicate}
          className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 text-sm">Duplicate</button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !busy && setOpen(false)}>
          <div className="glass rounded-2xl max-w-lg w-full p-6 space-y-5 border border-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Publish "{props.title}"</h3>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">×</button>
            </div>

            <div className="rounded-xl border border-white/10 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Post to</div>
                <div className={`text-xs ${selected.length ? "text-muted-foreground" : "text-amber-300"}`}>
                  {selected.length ? `${selected.length} selected` : "Tick the accounts to post to"}
                </div>
              </div>
              {targetsQ.isLoading ? (
                <div className="text-xs text-muted-foreground">Checking connected accounts…</div>
              ) : (
                <div className="space-y-2.5 max-h-64 overflow-auto pr-1">
                  {PLATFORMS.map((p) => {
                    const accts = targets.filter((t) => t.platform === p);
                    const problem = problemFor(p);
                    return (
                      <div key={p}>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground capitalize mb-1">{p}</div>
                        {accts.length === 0 ? (
                          <div className="text-xs text-muted-foreground">
                            Not connected.{" "}
                            {!isHiddenPath("/connections") && <Link to="/connections" search={{ ok: undefined, err: undefined }} className="underline">Connect</Link>}
                          </div>
                        ) : problem ? (
                          <div className="text-xs text-amber-300">{problem}</div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {accts.map((t) => {
                              const on = selected.includes(t.id);
                              return (
                                <button key={t.id} disabled={!t.usable} onClick={() => toggle(t.id, t.platform)}
                                  title={t.usable ? "" : "Session expired — reconnect in Connected Accounts"}
                                  role="checkbox" aria-checked={on}
                                  className={`pl-1.5 pr-3 py-1 rounded-full text-xs border inline-flex items-center gap-1.5 disabled:opacity-40 ${on ? "border-[color:var(--brand-orange,#f97316)] bg-orange-500/15 text-white" : "border-white/10 hover:bg-white/5"}`}>
                                  <span className={`w-4 h-4 rounded-[5px] border inline-flex items-center justify-center shrink-0 ${on ? "gradient-primary border-transparent" : "border-white/30"}`}>
                                    {on && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                                  </span>
                                  {t.avatarUrl && <img src={t.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />}
                                  {t.label}
                                  {!t.usable && " · reconnect"}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {!isHiddenPath("/connections") && (
                <Link to="/connections" search={{ ok: undefined, err: undefined }} className="text-xs text-[color:var(--neon-purple)] hover:underline inline-flex items-center gap-1">
                  Manage connected accounts <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>

            {textFor(platform).caption && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Caption preview · <span className="capitalize">{platform}</span></div>
                <div className="text-sm bg-black/30 rounded-lg p-3 max-h-32 overflow-auto whitespace-pre-wrap">
                  {textFor(platform).caption}
                  {textFor(platform).hashtags ? `\n\n${textFor(platform).hashtags}` : ""}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 pt-2 border-t border-white/5">
              <div className="flex flex-wrap gap-2">
                <button onClick={handlePublishNow} disabled={busy !== null || !canPublish}
                  className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-60">
                  {busy === "publish" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {selected.length === 0 ? "Select an account first" : selected.length > 1 ? `Publish to ${selected.length} accounts` : "Publish now"}
                </button>
                <button onClick={handleMarkPublished} disabled={busy !== null}
                  className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60">
                  {busy === "manual" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Mark as manually published
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)}
                  min={new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)}
                  className="bg-input/60 border border-border rounded-lg px-2 py-1.5 text-sm" />
                <button onClick={handleSchedule} disabled={busy !== null || !scheduleAt || !canPublish}
                  className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 text-sm flex items-center gap-1.5 disabled:opacity-60">
                  {busy === "schedule" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                  Schedule
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Each selected account gets its own post with that platform's caption. Publish now posts immediately; scheduled posts go out automatically at that time (checked every 5 minutes). Already posted it yourself? Use "Mark as manually published".
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
