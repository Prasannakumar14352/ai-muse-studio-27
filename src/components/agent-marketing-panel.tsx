// Agent HQ → Marketing: run the social media manager / app promoter, then
// review every draft. Nothing is posted until the admin clicks Approve.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Copy, ExternalLink, Loader2, Megaphone, Play, Rocket, Send, Sparkles, XCircle } from "lucide-react";
import { runAgentNow, updateAgentTask, sendPromoToTelegram, type AgentTask } from "@/lib/agent-hq.functions";
import { listPublishTargets, schedulePost } from "@/lib/publishing.functions";
import { attachPlanMedia, createPlanMediaUpload } from "@/lib/social-plan.functions";
import { setResearchPrefill, type ResearchModuleId } from "@/lib/research-prefill";
import { supabase } from "@/integrations/supabase/client";
import { canAutoBuild, cancelAutoBuild, clearAutoBuild, estimateMinutes, queueAutoBuild, useAutoBuild } from "@/lib/content-plan-autobuild";
import { useNavigate } from "@tanstack/react-router";

type PostRef = {
  platform?: "instagram" | "facebook" | "linkedin" | "youtube"; format?: string; hashtags?: string;
  media_url?: string | null; media_type?: "video" | "image" | null; suggested_at?: string;
  youtube_title?: string | null; first_comment?: string | null;
  // Content-plan drafts
  plan_item_id?: string; needs_build?: boolean; build?: string; build_topic?: string;
  build_language?: string | null; build_angle?: string | null; build_headline?: string | null; build_duration?: number | null;
};
type PromoRef = { channel?: string; where?: string };

const PLATFORM_LABEL: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", youtube: "YouTube" };

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["agent-hq"] });
    qc.invalidateQueries({ queryKey: ["social-plan"] });
  };
}

/** ISO → value for <input type="datetime-local"> in the viewer's time zone. */
function toLocalInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 3600e3);
  const t = d.getTime() < Date.now() + 10 * 60e3 ? new Date(Date.now() + 3600e3) : d;
  const off = t.getTimezoneOffset() * 60e3;
  return new Date(t.getTime() - off).toISOString().slice(0, 16);
}

export function MarketingPanel({ tasks }: { tasks: AgentTask[] }) {
  const posts = tasks.filter((t) => t.kind === "social_post" && t.status === "waiting_approval");
  const promos = tasks.filter((t) => t.kind === "promo" && t.status === "waiting_approval");
  const recent = tasks.filter((t) => (t.kind === "social_post" || t.kind === "promo") && (t.status === "done" || t.status === "rejected")).slice(0, 12);
  const plans = tasks.filter((t) => t.agent === "social_media_manager" && t.kind === "report").slice(0, 1);

  return (
    <div className="space-y-6">
      <RunControls />

      {plans[0] && (
        <div className="glass rounded-2xl p-4 border border-border">
          <div className="text-xs text-muted-foreground">Latest plan from the social media manager · {new Date(plans[0].created_at).toLocaleString()}</div>
          <div className="font-semibold mt-1">{plans[0].title}</div>
          <div className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{plans[0].body}</div>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2"><Megaphone className="w-4 h-4" /> Social posts waiting for approval ({posts.length})</h2>
        {!posts.length ? <Muted text="No drafts. Run the social media manager above, or wait for Monday / Thursday." /> :
          <div className="grid lg:grid-cols-2 gap-4">{posts.map((t) => <SocialPostCard key={t.id} t={t} />)}</div>}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2"><Rocket className="w-4 h-4" /> Promotion ideas waiting ({promos.length})</h2>
        {!promos.length ? <Muted text="No promotion ideas. Run the app promoter above, or wait for Wednesday." /> :
          <div className="grid lg:grid-cols-2 gap-4">{promos.map((t) => <PromoCard key={t.id} t={t} />)}</div>}
      </section>

      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Recently handled</h2>
          <div className="glass rounded-2xl border border-border divide-y divide-white/5">
            {recent.map((t) => (
              <div key={t.id} className="p-3 text-sm flex items-center gap-2">
                <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${t.status === "done" ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-muted-foreground"}`}>{t.status === "done" ? "approved" : "rejected"}</span>
                <span className="truncate">{t.title}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RunControls() {
  const run = useServerFn(runAgentNow);
  const refresh = useRefresh();
  const [busy, setBusy] = useState<string | null>(null);
  const [focus, setFocus] = useState("");
  const [count, setCount] = useState(4);
  async function go(agent: "social_media_manager" | "app_promoter") {
    setBusy(agent);
    try {
      const r = await run({ data: { agent, count, focus: focus.trim() || undefined } });
      const created = (r.result as { created?: number } | null)?.created ?? 0;
      toast.success(agent === "social_media_manager" ? `${created} posts drafted — review them below` : `${created} promotion ideas drafted`);
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Run failed"); }
    finally { setBusy(null); }
  }
  return (
    <div className="glass rounded-2xl p-4 border border-border space-y-3">
      <div className="text-sm text-muted-foreground">
        <b className="text-foreground">Social media manager</b> plans the week and the <b className="text-foreground">post creator</b> writes each post with a real clip from the app (runs Mon &amp; Thu).
        <b className="text-foreground"> App promoter</b> drafts Reddit/Quora answers, launch posts, creator DMs and Telegram announcements (runs Wed). Nothing is posted until you approve it.
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Optional focus, e.g. Telugu creators, new HD images, Diwali"
          className="flex-1 min-w-[220px] text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500/60" />
        <select value={count} onChange={(e) => setCount(Number(e.target.value))}
          className="text-sm bg-black/30 border border-white/10 rounded-lg px-2 py-1.5">
          {[2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n} drafts</option>)}
        </select>
        <button disabled={busy !== null} onClick={() => go("social_media_manager")}
          className="rounded-lg gradient-primary text-white px-3 py-1.5 text-sm inline-flex items-center gap-1.5 disabled:opacity-60">
          {busy === "social_media_manager" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Plan &amp; write posts
        </button>
        <button disabled={busy !== null} onClick={() => go("app_promoter")}
          className="rounded-lg glass border border-border px-3 py-1.5 text-sm inline-flex items-center gap-1.5 disabled:opacity-60">
          {busy === "app_promoter" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />} Find promotion ideas
        </button>
      </div>
    </div>
  );
}

export function SocialPostCard({ t }: { t: AgentTask }) {
  const ref = t.source_ref as unknown as PostRef;
  const platform = ref.platform ?? "instagram";
  const refresh = useRefresh();
  const update = useServerFn(updateAgentTask);
  const schedule = useServerFn(schedulePost);
  const listFn = useServerFn(listPublishTargets);
  const targets = useQuery({ queryKey: ["publish-targets"], queryFn: () => listFn(), staleTime: 60_000 });
  const accounts = useMemo(() => (targets.data ?? []).filter((a) => a.platform === platform && a.usable), [targets.data, platform]);
  const [caption, setCaption] = useState(t.draft_reply ?? "");
  const [tags, setTags] = useState(ref.hashtags ?? "");
  const [ytTitle, setYtTitle] = useState(ref.youtube_title ?? "");
  const [when, setWhen] = useState(toLocalInput(ref.suggested_at));
  const [account, setAccount] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const chosen = account || accounts[0]?.id || "";
  const media = ref.media_url ? [ref.media_url] : [];

  async function approve(now: boolean) {
    if (!chosen) return;
    setBusy(now ? "now" : "schedule");
    try {
      const r = await schedule({ data: {
        platform, connectionId: chosen, caption, hashtags: tags, mediaUrls: media,
        title: platform === "youtube" ? (ytTitle || t.title).slice(0, 100) : undefined,
        scheduledAt: now ? undefined : new Date(when).toISOString(),
      } });
      if (now && !r.ok) throw new Error(r.error ?? "Publishing failed");
      await update({ data: { id: t.id, status: "done", draftReply: caption } });
      toast.success(now ? "Published" : `Scheduled for ${new Date(when).toLocaleString()}`);
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't publish"); }
    finally { setBusy(null); }
  }

  return (
    <div className="glass rounded-2xl p-4 border border-border space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 font-semibold">{PLATFORM_LABEL[platform]}</span>
        <span className="text-muted-foreground">{ref.format}</span>
      </div>
      <div className="font-semibold">{t.title.replace(/^\w+:\s*/, "")}</div>
      <div className="text-xs text-muted-foreground whitespace-pre-wrap">{t.body}</div>
      {ref.media_url && (
        <div className="rounded-xl overflow-hidden bg-black/40 border border-white/10">
          {ref.media_type === "video"
            ? <video src={ref.media_url} controls muted playsInline preload="metadata" className="w-full max-h-64 object-contain" />
            : <img src={ref.media_url} alt="" className="w-full max-h-64 object-contain" />}
        </div>
      )}
      {ref.needs_build && <BuildAndAttach t={t} ref_={ref} platform={platform} onDone={refresh} />}
      {platform === "youtube" && (
        <input value={ytTitle} onChange={(e) => setYtTitle(e.target.value)} placeholder="YouTube title"
          className="w-full text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-1.5" />
      )}
      <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={7}
        className="w-full text-sm bg-black/30 border border-white/10 rounded-lg p-3 focus:outline-none focus:border-orange-500/60" />
      <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="#hashtags"
        className="w-full text-xs bg-black/30 border border-white/10 rounded-lg px-3 py-1.5" />
      {ref.first_comment && <div className="text-xs text-muted-foreground">Suggested first comment: {ref.first_comment}</div>}

      {accounts.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {accounts.length > 1 && (
            <select value={chosen} onChange={(e) => setAccount(e.target.value)} className="text-sm bg-black/30 border border-white/10 rounded-lg px-2 py-1.5">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          )}
          {accounts.length === 1 && <span className="text-xs text-muted-foreground">to {accounts[0].label}</span>}
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
            className="text-sm bg-black/30 border border-white/10 rounded-lg px-2 py-1.5" />
        </div>
      ) : (
        <div className="text-xs text-amber-300">
          No {PLATFORM_LABEL[platform]} account connected. <a href="/connections" className="underline">Connect it</a> to publish from here, or copy the post and publish it yourself.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {accounts.length > 0 && (
          <>
            <button disabled={busy !== null || !caption.trim() || (!!ref.needs_build && !ref.media_url)} onClick={() => approve(false)}
              title={ref.needs_build && !ref.media_url ? "Build and attach the media first" : undefined}
              className="rounded-lg gradient-primary text-white px-3 py-1.5 text-sm inline-flex items-center gap-1.5 disabled:opacity-60">
              {busy === "schedule" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />} Approve &amp; schedule
            </button>
            <button disabled={busy !== null || !caption.trim() || (!!ref.needs_build && !ref.media_url)} onClick={() => approve(true)}
              className="rounded-lg glass border border-border px-3 py-1.5 text-sm inline-flex items-center gap-1.5 disabled:opacity-60">
              {busy === "now" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Approve &amp; post now
            </button>
          </>
        )}
        <button onClick={async () => {
          await navigator.clipboard.writeText(`${caption}\n\n${tags}`.trim());
          toast.success("Copied");
        }} className="rounded-lg glass border border-border px-3 py-1.5 text-sm inline-flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" /> Copy</button>
        {!accounts.length && (
          <button onClick={async () => { await update({ data: { id: t.id, status: "done", draftReply: caption } }); refresh(); }}
            className="rounded-lg glass border border-border px-3 py-1.5 text-sm">Mark as posted</button>
        )}
        {ref.media_url && (
          <a href={ref.media_url} download target="_blank" rel="noreferrer" className="rounded-lg glass border border-border px-3 py-1.5 text-sm inline-flex items-center gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" /> Media
          </a>
        )}
        <button onClick={async () => { await update({ data: { id: t.id, status: "rejected" } }); refresh(); }}
          className="rounded-lg glass border border-border px-3 py-1.5 text-sm inline-flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Reject</button>
      </div>
    </div>
  );
}

function PromoCard({ t }: { t: AgentTask }) {
  const ref = t.source_ref as unknown as PromoRef;
  const refresh = useRefresh();
  const update = useServerFn(updateAgentTask);
  const sendTg = useServerFn(sendPromoToTelegram);
  const [text, setText] = useState(t.draft_reply ?? "");
  const [busy, setBusy] = useState(false);
  const isTelegram = ref.channel === "telegram_group";
  return (
    <div className="glass rounded-2xl p-4 border border-border space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 font-semibold">{(ref.channel ?? "promo").replace(/_/g, " ")}</span>
        {t.priority === 1 && <span className="text-orange-300">high impact</span>}
      </div>
      <div className="font-semibold">{t.title.replace(/^[\w ]+:\s*/, "")}</div>
      <div className="text-xs text-muted-foreground whitespace-pre-wrap">{t.body}</div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7}
        className="w-full text-sm bg-black/30 border border-white/10 rounded-lg p-3 focus:outline-none focus:border-orange-500/60" />
      <div className="flex flex-wrap gap-2">
        {isTelegram ? (
          <button disabled={busy || !text.trim()} onClick={async () => {
            setBusy(true);
            try { await sendTg({ data: { id: t.id, text } }); toast.success("Posted in your Telegram group"); refresh(); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send"); }
            finally { setBusy(false); }
          }} className="rounded-lg gradient-primary text-white px-3 py-1.5 text-sm inline-flex items-center gap-1.5 disabled:opacity-60">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Approve &amp; post to Telegram group
          </button>
        ) : (
          <button onClick={async () => {
            await navigator.clipboard.writeText(text);
            await update({ data: { id: t.id, status: "done", draftReply: text } });
            toast.success("Copied — post it, then it's marked done");
            refresh();
          }} className="rounded-lg gradient-primary text-white px-3 py-1.5 text-sm inline-flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" /> Copy &amp; mark done</button>
        )}
        <button onClick={async () => { await navigator.clipboard.writeText(text); toast.success("Copied"); }}
          className="rounded-lg glass border border-border px-3 py-1.5 text-sm inline-flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" /> Copy</button>
        <button onClick={async () => { await update({ data: { id: t.id, status: "rejected" } }); refresh(); }}
          className="rounded-lg glass border border-border px-3 py-1.5 text-sm inline-flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Reject</button>
      </div>
    </div>
  );
}

function Muted({ text }: { text: string }) {
  return <div className="glass rounded-2xl p-6 border border-border text-sm text-muted-foreground text-center">{text}</div>;
}

// ---------------------------------------------------------------- Content plan: build + attach

const BUILD_TARGET: Record<string, { module: ResearchModuleId; path: string; label: string }> = {
  video: { module: "video", path: "/videos", label: "Video Studio" },
  thumbnail: { module: "thumbnail", path: "/thumbnails", label: "Thumbnail Studio" },
  carousel: { module: "carousel", path: "/create/carousel", label: "Carousels" },
  image: { module: "image", path: "/images", label: "Image Studio" },
};

/**
 * A content-plan draft whose media is made in a studio: "Build" opens that
 * studio prefilled with the agent's brief (the studio runs in this browser);
 * "Attach" uploads the downloaded file straight to Storage and links it to
 * this draft (and, if ticked, the day's other drafts).
 */
function BuildAndAttach({ t, ref_, platform, onDone }: { t: AgentTask; ref_: PostRef; platform: string; onDone: () => void }) {
  const navigate = useNavigate();
  const startUpload = useServerFn(createPlanMediaUpload);
  const attach = useServerFn(attachPlanMedia);
  const [busy, setBusy] = useState(false);
  const [sameDay, setSameDay] = useState(true);
  const target = BUILD_TARGET[ref_.build ?? "video"] ?? BUILD_TARGET.video;
  const isLongYt = /long/i.test(ref_.format ?? "") && platform === "youtube";
  const auto = canAutoBuild(ref_);
  const status = useAutoBuild(t.id);
  const active = status?.state === "queued" || status?.state === "running";

  // When a build finishes, reload the drafts so the new video shows up.
  const seen = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (status?.state === "done" && seen.current !== "done") {
      onDone();
      toast.success("Video ready for approval", { description: status.title });
    }
    if (status?.state === "failed" && seen.current !== "failed") toast.error(`Build failed: ${status.error ?? ""}`);
    seen.current = status?.state;
  }, [status?.state, status?.title, status?.error, onDone]);

  function autoBuild() {
    queueAutoBuild({ taskId: t.id, title: t.title, ref: { ...ref_, platform } });
    toast.message(`Building — keep this tab open (about ${estimateMinutes({ ...ref_, platform })} min)`, {
      description: "You can use other pages in the app meanwhile.",
    });
  }

  function build() {
    setResearchPrefill({
      module: target.module,
      sourceLabel: `Content plan · ${ref_.build_topic ?? t.title}`,
      topic: ref_.build_topic ?? t.title,
      angle: ref_.build_angle ?? undefined,
      platform: platform === "youtube" ? (isLongYt ? "YouTube" : "YouTube Shorts") : platform === "instagram" ? "Instagram Reels" : "Facebook",
      aspectRatio: target.module === "video" ? (isLongYt ? "16:9" : "9:16") : target.module === "thumbnail" ? "16:9" : "4:5",
      duration: target.module === "video" ? (isLongYt ? (ref_.build_duration ?? 480) : 30) : undefined,
      format: target.module === "video" ? (isLongYt ? "long" : "reel") : undefined,
      thumbnailText: ref_.build_headline ?? undefined,
      titles: ref_.build_headline ? [ref_.build_headline] : undefined,
    });
    navigate({ to: target.path });
  }

  async function onFile(file: File) {
    setBusy(true);
    try {
      const mime = file.type || (file.name.endsWith(".mp4") ? "video/mp4" : "image/png");
      const { path, token } = await startUpload({ data: { taskId: t.id, mime } });
      const { error } = await supabase.storage.from("renders").uploadToSignedUrl(path, token, file, { contentType: mime });
      if (error) throw new Error(error.message);
      const r = await attach({ data: { taskId: t.id, path, mime, sameDay } });
      toast.success(r.attached > 1 ? `Attached to ${r.attached} posts for this day` : "Media attached");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-orange-500/40 bg-orange-500/5 p-3 space-y-2 text-xs">
      <div className="text-muted-foreground">
        {ref_.media_url ? "Media attached. Replace it if you rebuild." : `Needs media from ${target.label}`}
        {ref_.build_topic && <> · <span className="text-foreground">{ref_.build_topic}</span></>}
        {ref_.build_language && <> · {ref_.build_language}</>}
        {isLongYt && <> · long video (16:9)</>}
      </div>
      {status && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {active && <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-300" />}
            <span className={status.state === "failed" ? "text-red-300" : status.state === "done" ? "text-emerald-300" : "text-foreground"}>{status.step}</span>
            {active && <button onClick={() => cancelAutoBuild(t.id)} className="ml-auto underline text-muted-foreground">{status.state === "queued" ? "Remove" : "Stop"}</button>}
            {!active && <button onClick={() => clearAutoBuild(t.id)} className="ml-auto underline text-muted-foreground">Dismiss</button>}
          </div>
          {active && (
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full gradient-primary transition-all" style={{ width: `${Math.round(status.progress * 100)}%` }} />
            </div>
          )}
          {active && <div className="text-muted-foreground">Keep this tab open. Moving to other pages in the app is fine; closing or reloading the tab stops it.</div>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {auto && (
          <button onClick={autoBuild} disabled={active}
            className="rounded-lg gradient-primary text-white px-3 py-1.5 text-sm inline-flex items-center gap-1.5 disabled:opacity-60">
            <Sparkles className="w-3.5 h-3.5" /> {ref_.media_url ? "Rebuild" : "Build"} {isLongYt ? "long video" : "reel"}
            <span className="opacity-80">· ~{estimateMinutes({ ...ref_, platform })} min</span>
          </button>
        )}
        <button onClick={build} className="rounded-lg glass border border-border px-3 py-1.5 text-sm">{auto ? `Open in ${target.label}` : `Build in ${target.label}`}</button>
        <label className={`rounded-lg glass border border-border px-3 py-1.5 text-sm cursor-pointer inline-flex items-center gap-1.5 ${busy ? "opacity-60 pointer-events-none" : ""}`}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} {ref_.media_url ? "Replace media" : "Attach media"}
          <input type="file" accept="video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onFile(f); }} />
        </label>
        {!isLongYt && (
          <label className="inline-flex items-center gap-1.5 text-muted-foreground">
            <input type="checkbox" checked={sameDay} onChange={(e) => setSameDay(e.target.checked)} />
            use for this day's other posts
          </label>
        )}
      </div>
    </div>
  );
}
