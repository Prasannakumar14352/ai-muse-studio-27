// Publishing UI shared across the app.
//
// - <PublishDialog>: tick one or more connected accounts (several YouTube
//   channels, Instagram accounts, Pages… at once), edit the caption per
//   platform, then publish now or schedule. Nothing is pre-selected: content
//   only goes to accounts the user ticks. Each account gets its own post.
// - <PublishButton>: a single "Publish" button that opens the dialog — for
//   image viewers, carousel cards, Model Studio results.
// - <PublishActions>: the full action bar (status, Download, Publish, copy
//   caption/hashtags…) used on project pages.
//
// Media can be passed directly (`media`) or loaded on demand (`loadMedia`,
// e.g. carousel slides kept in the browser). Embedded data: images are
// uploaded to storage once before publishing, so requests stay small.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Download, Send, Clock, Copy, CheckCircle2, ExternalLink, Loader2, Share2, Check, X,
} from "lucide-react";
import {
  markManuallyPublished, schedulePost, listPublishTargets, platformMediaProblem, stagePublishMedia,
  PLATFORMS, type Platform, type PublishStatus,
} from "@/lib/publishing.functions";
import { copyText, downloadPlatformPackage, buildLinkedInPost } from "@/lib/downloads";
import { isHiddenPath } from "@/lib/hidden-features";
import { listProviderAvailability } from "@/lib/oauth-user.functions";

export type PublishMedia = { url: string; kind: "image" | "video" | "thumbnail"; name?: string };

export type PublishContent = {
  /** Project the post belongs to (optional — e.g. Model Studio results have none). */
  projectId?: string;
  videoApprovalId?: string;
  title: string;
  caption?: string;
  hashtags?: string;
  /** Per-platform caption/hashtags (e.g. from the Publish Kit). Falls back to caption/hashtags. */
  captions?: Partial<Record<Platform, { caption?: string; hashtags?: string }>>;
  /** Title used for YouTube (and as the LinkedIn media title). Defaults to `title`. */
  postTitle?: string;
  /** Platform whose caption is shown first. */
  defaultPlatform?: Platform;
  media?: PublishMedia[];
  /** Load media when publishing (e.g. slides stored in the browser). */
  loadMedia?: () => Promise<PublishMedia[]>;
  /** What the media is, when it's loaded later — used to show which platforms fit. */
  mediaHint?: { images?: number; videos?: number };
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

/** URLs used only to decide which platforms can take this content. */
function mediaForCheck(c: PublishContent): string[] {
  if (c.media) return c.media.filter((m) => m.kind !== "thumbnail").map((m, i) => (m.kind === "video" ? `m-${i}.mp4` : `m-${i}.jpg`));
  const out: string[] = [];
  for (let i = 0; i < (c.mediaHint?.images ?? 0); i++) out.push(`hint-${i}.jpg`);
  for (let i = 0; i < (c.mediaHint?.videos ?? 0); i++) out.push(`hint-${i}.mp4`);
  return out;
}

export function PublishDialog({
  open, onClose, content, onPublished,
}: {
  open: boolean;
  onClose: () => void;
  content: PublishContent;
  onPublished?: () => void;
}) {
  const qc = useQueryClient();
  const schedule = useServerFn(schedulePost);
  const stage = useServerFn(stagePublishMedia);
  const mark = useServerFn(markManuallyPublished);
  const targetsFn = useServerFn(listPublishTargets);
  const targetsQ = useQuery({
    queryKey: ["publish-targets"],
    queryFn: () => targetsFn(),
    enabled: open,
    staleTime: 30_000,
  });
  const targets = targetsQ.data ?? [];
  // Only offer platforms the admin has switched on (or ones already connected).
  const availFn = useServerFn(listProviderAvailability);
  const availQ = useQuery({ queryKey: ["provider-availability"], queryFn: () => availFn(), enabled: open, staleTime: 60_000 });
  const shownPlatforms = PLATFORMS.filter((p) =>
    targets.some((t) => t.platform === p) ||
    (availQ.data ?? []).some((a) => a.platform === p && a.available),
  );

  const [selected, setSelected] = useState<string[]>([]);
  const [focus, setFocus] = useState<Platform>(content.defaultPlatform ?? "instagram");
  const [edited, setEdited] = useState<Partial<Record<Platform, string>>>({});
  const [scheduleAt, setScheduleAt] = useState("");
  const [busy, setBusy] = useState<null | "publish" | "schedule" | "manual">(null);

  // Every time the dialog opens, start with nothing ticked.
  useEffect(() => {
    if (open) {
      setSelected([]);
      setEdited({});
      setScheduleAt("");
      setFocus(content.defaultPlatform ?? "instagram");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const checkUrls = mediaForCheck(content);
  const problemFor = (p: Platform) => platformMediaProblem(p, checkUrls);
  const selectedTargets = targets.filter((t) => selected.includes(t.id));
  const canPublish = selectedTargets.length > 0;

  const defaultText = (p: Platform) => {
    // `||` (not `??`): an empty per-platform caption falls back to the main one.
    const caption = content.captions?.[p]?.caption || content.caption || "";
    const tags = content.captions?.[p]?.hashtags || content.hashtags || "";
    return tags ? `${caption}\n\n${tags}`.trim() : caption;
  };
  const textFor = (p: Platform) => edited[p] ?? defaultText(p);

  function toggle(id: string, p: Platform) {
    setFocus(p);
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function resolveMediaUrls(): Promise<string[]> {
    const items = content.loadMedia ? await content.loadMedia() : (content.media ?? []);
    const urls = items.filter((m) => m.kind !== "thumbnail").map((m) => m.url).filter(Boolean);
    // Upload embedded images/videos once; every account then uses the same file.
    const out: string[] = [];
    for (const u of urls) {
      if (u.startsWith("data:")) {
        const r = await stage({ data: { dataUrl: u } });
        out.push(r.url);
      } else {
        const response = await fetch(u, { signal: AbortSignal.timeout(20_000) });
        if (!response.ok) throw new Error("Could not load the publishing image");
        const blob = await response.blob();
        if (blob.size > 4_000_000) throw new Error("Publishing images must be smaller than 4 MB");
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not read media"));
          reader.readAsDataURL(blob);
        });
        const staged = await stage({ data: { dataUrl } });
        out.push(staged.url);
      }
    }
    return out;
  }

  /** Publish/schedule to every ticked account; one post per account. */
  async function runAll(kind: "publish" | "schedule") {
    if (kind === "schedule" && !scheduleAt) return toast.error("Pick a date & time");
    const list = selectedTargets;
    if (list.length === 0) return toast.error("Tick at least one account");
    setBusy(kind);
    const iso = kind === "schedule" ? new Date(scheduleAt).toISOString() : undefined;
    const toastId = toast.loading(
      kind === "publish" ? `Publishing to ${list.length} account${list.length > 1 ? "s" : ""}…` : "Scheduling…",
    );
    let mediaUrls: string[];
    try {
      mediaUrls = await resolveMediaUrls();
    } catch (e) {
      toast.dismiss(toastId);
      setBusy(null);
      return toast.error(e instanceof Error ? e.message : "Couldn't prepare the media");
    }
    const results = await Promise.allSettled(list.map((t) => schedule({
      data: {
        projectId: content.projectId,
            videoApprovalId: content.videoApprovalId,
        platform: t.platform,
        connectionId: t.id,
        title: content.postTitle ?? content.title,
        caption: textFor(t.platform),
        hashtags: "",
        mediaUrls,
        scheduledAt: iso,
      },
    })));
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
    setBusy(null);
    if (done.length || pending.length) onPublished?.();
    if (!failed.length) onClose();
  }

  async function handleMarkPublished() {
    if (!content.projectId) return;
    setBusy("manual");
    try {
      await mark({ data: { projectId: content.projectId, platform: focus } });
      toast.success("Marked as manually published");
      onPublished?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { e.stopPropagation(); if (!busy) onClose(); }}
      onKeyDown={stop} onPointerDown={stop}>
      <div className="glass rounded-2xl max-w-lg w-full max-h-[92vh] overflow-auto p-6 space-y-5 border border-border bg-[oklch(0.14_0.012_40)]"
        onClick={stop}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold line-clamp-2">Publish "{content.title}"</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        <div className="rounded-xl border border-border p-3 space-y-3">
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
              {shownPlatforms.length === 0 && !availQ.isLoading && (
                <div className="text-xs text-muted-foreground">No publishing platforms are set up yet. Download the file and post it manually.</div>
              )}
              {shownPlatforms.map((p) => {
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
                              role="checkbox" aria-checked={on}
                              title={t.usable ? "" : "Session expired — reconnect in Connected Accounts"}
                              className={`pl-1.5 pr-3 py-1 rounded-full text-xs border inline-flex items-center gap-1.5 disabled:opacity-40 ${on ? "border-orange-500/70 bg-orange-500/15 text-white" : "border-border hover:bg-white/5"}`}>
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
            <Link to="/connections" search={{ ok: undefined, err: undefined }} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              Manage connected accounts <ExternalLink className="w-3 h-3" />
            </Link>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Caption</div>
            <div className="flex gap-1">
              {shownPlatforms.map((p) => (
                <button key={p} onClick={() => setFocus(p)}
                  className={`px-2 py-0.5 rounded-full text-[11px] capitalize border ${focus === p ? "border-orange-500/70 text-white" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={textFor(focus)}
            onChange={(e) => setEdited((cur) => ({ ...cur, [focus]: e.target.value }))}
            placeholder={`Write the ${focus} caption…`}
            rows={5}
            className="w-full text-sm bg-black/30 border border-border rounded-lg p-3 resize-y focus:outline-none focus:border-orange-500/60"
          />
          <div className="text-[11px] text-muted-foreground mt-1">Each platform keeps its own caption. Hashtags can go at the end.</div>
        </div>

        <div className="flex flex-col gap-3 pt-2 border-t border-white/5">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => runAll("publish")} disabled={busy !== null || !canPublish}
              className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-60">
              {busy === "publish" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {selected.length === 0 ? "Select an account first" : selected.length > 1 ? `Publish to ${selected.length} accounts` : "Publish now"}
            </button>
            {content.projectId && (
              <button onClick={handleMarkPublished} disabled={busy !== null}
                className="rounded-lg bg-white/5 hover:bg-white/10 border border-border px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60">
                {busy === "manual" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Mark as manually published
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)}
              min={new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)}
              className="bg-input/60 border border-border rounded-lg px-2 py-1.5 text-sm" />
            <button onClick={() => runAll("schedule")} disabled={busy !== null || !scheduleAt || !canPublish}
              className="rounded-lg bg-white/5 hover:bg-white/10 border border-border px-3 py-1.5 text-sm flex items-center gap-1.5 disabled:opacity-60">
              {busy === "schedule" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
              Schedule
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Each ticked account gets its own post with that platform's caption. Publish now posts immediately; scheduled posts go out automatically at that time (checked every 5 minutes).
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A single "Publish" button that opens the publish dialog. */
export function PublishButton({
  content, className, label = "Publish", onPublished,
}: {
  content: PublishContent;
  className?: string;
  label?: string;
  onPublished?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={className ?? "rounded-lg bg-white/5 hover:bg-white/10 border border-border px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5"}
      >
        <Send className="w-3.5 h-3.5" /> {label}
      </button>
      <PublishDialog open={open} onClose={() => setOpen(false)} content={content} onPublished={onPublished} />
    </>
  );
}

export type PublishActionsProps = PublishContent & {
  status?: PublishStatus | null;
  cta?: string;
  altText?: string;
  description?: string;
  tags?: string[];
  /** Custom Download handler. If provided, replaces the default (which packages a per-platform ZIP). */
  onDownload?: () => void | Promise<void>;
  onEdit?: () => void;
  onPreview?: () => void;
  onDuplicate?: () => void;
  className?: string;
};

/** Full action bar for project pages: status, Download, Publish, copy helpers. */
export function PublishActions(props: PublishActionsProps) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const status = props.status ?? "ready";

  async function handleDownload() {
    setDownloading(true);
    try {
      if (props.onDownload) {
        await props.onDownload();
      } else {
        await downloadPlatformPackage({
          title: props.title,
          platform: props.defaultPlatform ?? "instagram",
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
      setDownloading(false);
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
        disabled={downloading}
        className="rounded-lg gradient-primary text-white px-3 py-1.5 text-sm font-medium flex items-center gap-1.5 disabled:opacity-60"
      >
        {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        Download
      </button>

      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-white/5 hover:bg-white/10 border border-border px-3 py-1.5 text-sm font-medium flex items-center gap-1.5"
      >
        <Send className="w-3.5 h-3.5" /> Publish
      </button>

      {props.caption && (
        <button onClick={() => copyText(props.caption!, "Caption copied")}
          className="rounded-lg bg-white/5 hover:bg-white/10 border border-border px-3 py-1.5 text-sm flex items-center gap-1.5">
          <Copy className="w-3.5 h-3.5" /> Caption
        </button>
      )}
      {props.hashtags && (
        <button onClick={() => copyText(props.hashtags!, "Hashtags copied")}
          className="rounded-lg bg-white/5 hover:bg-white/10 border border-border px-3 py-1.5 text-sm flex items-center gap-1.5">
          <Copy className="w-3.5 h-3.5" /> Hashtags
        </button>
      )}
      {props.caption && (
        <button onClick={handleCopyLinkedIn}
          className="rounded-lg bg-white/5 hover:bg-white/10 border border-border px-3 py-1.5 text-sm flex items-center gap-1.5">
          <Share2 className="w-3.5 h-3.5" /> LinkedIn text
        </button>
      )}
      {props.onEdit && (
        <button onClick={props.onEdit}
          className="rounded-lg bg-white/5 hover:bg-white/10 border border-border px-3 py-1.5 text-sm">Edit</button>
      )}
      {props.onDuplicate && (
        <button onClick={props.onDuplicate}
          className="rounded-lg bg-white/5 hover:bg-white/10 border border-border px-3 py-1.5 text-sm">Duplicate</button>
      )}

      <PublishDialog open={open} onClose={() => setOpen(false)} content={props} />
    </div>
  );
}
