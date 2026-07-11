// Universal "Download / Publish / Schedule / Copy / Mark manually published"
// action bar for any generated project (image, carousel, video, thumbnail).
// Publishing opens a dialog that offers Direct Publish (stubbed → schedules
// a job and asks the user to connect an account) or Manual Posting.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Download, Send, Clock, Copy, CheckCircle2, ExternalLink, Loader2, Share2,
} from "lucide-react";
import {
  markManuallyPublished, schedulePost, PLATFORMS, type Platform, type PublishStatus,
} from "@/lib/publishing.functions";
import { copyText, downloadPlatformPackage, buildLinkedInPost } from "@/lib/downloads";

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
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [scheduleAt, setScheduleAt] = useState<string>("");
  const mark = useServerFn(markManuallyPublished);
  const schedule = useServerFn(schedulePost);

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

  async function handlePublishNow() {
    if (!props.projectId) return toast.error("Save the project first");
    setBusy("publish");
    try {
      const r = await schedule({ data: { projectId: props.projectId, platform, caption: props.caption, hashtags: props.hashtags, mediaUrls: props.media?.map((m) => m.url) } });
      if (r.ok) {
        toast.warning("Queued — connect your account to complete publishing", {
          description: "For now the post is queued and can be finished manually.",
          action: { label: "Connect", onClick: () => { window.location.href = "/connections"; } },
        });
        setOpen(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleSchedule() {
    if (!props.projectId) return toast.error("Save the project first");
    if (!scheduleAt) return toast.error("Pick a date & time");
    setBusy("schedule");
    try {
      const iso = new Date(scheduleAt).toISOString();
      const r = await schedule({ data: { projectId: props.projectId, platform, caption: props.caption, hashtags: props.hashtags, mediaUrls: props.media?.map((m) => m.url), scheduledAt: iso } });
      if (r.ok) {
        toast.success("Scheduled");
        setOpen(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Schedule failed");
    } finally {
      setBusy(null);
    }
  }

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

            <div className="rounded-xl border border-white/10 p-3 space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Destination</div>
              <div className="flex flex-wrap gap-1.5">
                {PLATFORMS.map((p) => (
                  <button key={p} onClick={() => setPlatform(p)}
                    className={`px-3 py-1.5 rounded-full text-xs border capitalize ${platform === p ? "gradient-primary text-white border-transparent" : "border-white/10 hover:bg-white/5"}`}>
                    {p}
                  </button>
                ))}
              </div>
              <Link to="/connections" className="text-xs text-[color:var(--neon-purple)] hover:underline inline-flex items-center gap-1">
                Manage connected accounts <ExternalLink className="w-3 h-3" />
              </Link>
            </div>

            {props.caption && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Caption preview</div>
                <div className="text-sm bg-black/30 rounded-lg p-3 max-h-32 overflow-auto whitespace-pre-wrap">{props.caption}</div>
              </div>
            )}

            <div className="flex flex-col gap-3 pt-2 border-t border-white/5">
              <div className="flex flex-wrap gap-2">
                <button onClick={handlePublishNow} disabled={busy !== null}
                  className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-60">
                  {busy === "publish" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Publish now
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
                  className="bg-input/60 border border-border rounded-lg px-2 py-1.5 text-sm" />
                <button onClick={handleSchedule} disabled={busy !== null || !scheduleAt}
                  className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 text-sm flex items-center gap-1.5 disabled:opacity-60">
                  {busy === "schedule" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                  Schedule
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Direct publishing requires a connected account. If no account is connected the post is queued and can be downloaded and posted manually — download stays available at all times.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
