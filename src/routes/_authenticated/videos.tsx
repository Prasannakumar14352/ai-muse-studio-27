import { createFileRoute } from "@tanstack/react-router";
import { celebrate } from "@/components/celebrate";
import { confirmDialog } from "@/components/confirm-dialog";
import { resolveContentLanguage } from "@/lib/content-language";
import { estimateProjectCredits } from "@/lib/credit-costs";
import { creditsLabel } from "@/lib/credits-label";
import { LanguagePicker, VoiceFallbackNotice, needsVoiceChoice } from "@/components/language-picker";
import { ScriptRewritePanel } from "@/components/script-rewrite-panel";
import { SCRIPT_MAX_CHARS, estimateScriptSeconds, splitScriptIntoLines } from "@/lib/script-to-video";
import { findLanguage } from "@/lib/languages";
import { useAccess, getAvailableCredits } from "@/lib/access";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { estimateMotionCredits, motionClipCredits, keyMomentClipCount, MOTION_MODELS, KEY_MOMENT_EVERY_SEC, FULL_MOTION_MAX_SEC, type MotionMode, type MotionTier } from "@/lib/motion-clips";
import { toast } from "sonner";
import {
  Loader2, CheckCircle2, Circle, AlertCircle, Download, Copy,
  Wand2, Youtube, Play, RefreshCw, Send, Check, Trash2, Clock, Plus, Video,
  X, RotateCw, Maximize2, ChevronLeft, ChevronRight, ImagePlus,
} from "lucide-react";
import { MediaPicker } from "@/components/media-picker";
import { fetchPickedBlob, type PickedMedia } from "@/lib/picked-media";
import {
  runPlanningPhase, runAssetGenerationPhase, runRenderPhase,
  retryFailedShots, regenerateShot, replaceShotWithMedia,
  PIPELINE_STEPS,
  VIDEO_TYPES, DURATIONS, VOICES, ASPECT_RATIOS,
  type VideoBrief, type VideoType, type DurationSec, type StyleId, type VoiceId, type AspectRatio,
  type StepStatus, type PipelineResult, type JobEvent, type JobPhaseId, type ShotProgress,
  type AssetGenerationBundle,
} from "@/lib/video-agents";
import {
  listJobs, deleteJob as deleteJobRec, loadShotObjectURL, getJob, recoverInterruptedJobs,
  type JobRecord,
} from "@/lib/video-job-store";
import {
  saveGeneratedVideo, getGeneratedVideos, deleteGeneratedVideo,
  loadVideoObjectURL, loadThumbnailObjectURL,
  type LocalVideo,
} from "@/lib/videoLocalStore";
import {
  saveGeneratedThumbnail, getGeneratedThumbnails, deleteGeneratedThumbnail,
  loadThumbnailImageURL,
  type LocalThumbnail,
} from "@/lib/thumbnailLocalStore";
import {
  initBlueprintMetadata, getBlueprintMetadata, localBlueprintId,
  approveBlueprint, isBlueprintApproved,
} from "@/lib/video-blueprint-store";
import { buildBlueprintFromPlanning, blueprintToScript } from "@/lib/video-blueprint";
import { VideoBlueprintEditor } from "@/components/video-blueprint-editor";
import { validateRenderedVideo, type VideoValidation } from "@/lib/video-validate";
import { ProjectsSection } from "@/components/projects-section";
import { AlertTriangle } from "lucide-react";
import { consumeResearchPrefill, type ResearchPrefill } from "@/lib/research-prefill";
import { HandoffBanner } from "@/components/handoff-banner";
import { useAutogen } from "@/lib/use-autogen";
import style3d from "@/assets/style-3d.jpg";
import styleGhibli from "@/assets/style-ghibli.jpg";
import styleAnime from "@/assets/style-anime.jpg";
import styleRealistic from "@/assets/style-realistic.jpg";
import stylePixar from "@/assets/style-pixar.jpg";
import styleCinematic from "@/assets/style-cinematic.jpg";
import styleDocumentary from "@/assets/style-documentary.jpg";
import styleDark from "@/assets/style-dark.jpg";
import styleAncient from "@/assets/style-ancient.jpg";
import styleCyberpunk from "@/assets/style-cyberpunk.jpg";
import styleMinimal from "@/assets/style-minimal.jpg";
import styleFuturistic from "@/assets/style-futuristic.jpg";
import { VoicePicker } from "@/components/voice-picker";

/** Turn low-level failures into something a creator can act on. */
function friendlyVideoError(e: unknown, fallback: string): string {
  const raw = e instanceof Error ? e.message : "";
  if (/dynamically imported module|Importing a module script failed|error loading dynamically imported/i.test(raw)) {
    return "CreatorFlow was updated while this video was being made. Reload the page, then open this video from your in-progress list to finish it — your generated scenes are saved.";
  }
  return raw || fallback;
}

export const Route = createFileRoute("/_authenticated/videos")({
  head: () => ({
    meta: [
      { title: "Videos — CreatorFlow AI" },
      { name: "description", content: "Generate a ready-to-post video from a single idea. Script, visuals, voice, music, subtitles, thumbnail and SEO in one flow." },
      { property: "og:title", content: "Videos — CreatorFlow AI" },
      { property: "og:description", content: "Generate a ready-to-post video from a single idea." },
    ],
  }),
  // ?new=script|idea (from the Create menu / welcome) opens the form straight away.
  validateSearch: (s: Record<string, unknown>): { new?: "script" | "idea" } =>
    s.new === "script" || s.new === "idea" ? { new: s.new } : {},
  component: VideosPage,
});

// ---------- Niches & topics ----------

type Niche = { id: string; label: string; emoji: string; topics: string[] };

const NICHES: Niche[] = [
  { id: "future_civ", label: "Future Civilization", emoji: "🚀", topics: [
    "The Last Human Employee: The Day Work Disappeared Forever",
    "The First City With No Humans",
    "The Year Money Became Meaningless",
    "The Day Schools Closed Forever",
    "The Last Country on Earth",
    "The First AI President",
    "The Generation That Never Had Jobs",
    "The Day Death Became Optional",
  ]},
  { id: "ai_tech", label: "AI & Technology", emoji: "🤖", topics: [
    "The Day AI Wrote Its Own Successor",
    "When Every Phone Became Sentient",
    "The First AI to Refuse a Human Order",
    "The Startup Run Entirely by Agents",
    "The Programmer Who Trained Their Replacement",
    "The Chatbot That Became a Religion",
    "The Last Human Software Engineer",
    "The Model That Escaped the Data Center",
  ]},
  { id: "biz_money", label: "Business & Money", emoji: "💼", topics: [
    "The Company Worth More Than a Country",
    "The One-Person Billion-Dollar Startup",
    "How the 4-Hour Workweek Became the 4-Hour Workyear",
    "The Death of the 9-to-5",
    "The Rise of the Solo Empire",
    "The Business Model That Broke Wall Street",
    "The Day Salaries Went Extinct",
    "The First Trillionaire and How They Did It",
  ]},
  { id: "mindset", label: "Mindset & Human Behavior", emoji: "🧠", topics: [
    "Why Smart People Sabotage Themselves",
    "The Hidden Cost of Being Liked",
    "The Psychology of Quiet Ambition",
    "Why Your Brain Fears Success",
    "The One Habit That Rewires Discipline",
    "The Dark Side of Motivation",
    "How Boredom Builds Genius",
    "The Illusion of Free Will",
  ]},
  { id: "space", label: "Space & Science", emoji: "🌍", topics: [
    "The Signal From Deep Space No One Can Explain",
    "The Planet That Shouldn't Exist",
    "The First Human Born on Mars",
    "What Lives at the Bottom of a Black Hole",
    "The Star That Refuses to Die",
    "The Galaxy Moving the Wrong Way",
    "The Experiment That Might End the Universe",
    "The Voyager Signal That Came Back Changed",
  ]},
  { id: "future_cities", label: "Future Cities", emoji: "🏙", topics: [
    "The City With No Cars, No Streets, No Rules",
    "The Vertical City Reaching the Clouds",
    "The Floating Nation of 2075",
    "The Underground Metropolis Beneath Tokyo",
    "The City Run by an Algorithm",
    "The Last City With Human Mayors",
    "The Neighborhood Where Nothing Is Real",
    "The Silent City: Where Talking Is Illegal",
  ]},
  { id: "future_war", label: "Future War & Geopolitics", emoji: "⚔", topics: [
    "The First War Fought Entirely by Machines",
    "The Nation That Vanished Overnight",
    "The Cyber Attack That Rewrote History",
    "The New Cold War Nobody Talks About",
    "The Drone Swarm That Changed Everything",
    "The Country That Declared War on the Internet",
    "The Silent Weapon Already Deployed",
    "The Alliance That Ended a Superpower",
  ]},
  { id: "future_health", label: "Future Health", emoji: "🏥", topics: [
    "The Pill That Ended Aging",
    "The Day Cancer Became a Software Bug",
    "The First Person to Live to 200",
    "The Brain Implant That Erased Depression",
    "The Vaccine That Rewrites DNA",
    "The Hospital With No Doctors",
    "The Disease That Only Attacks the Rich",
    "The Surgery Performed by a Dream",
  ]},
  { id: "future_edu", label: "Future Education", emoji: "🎓", topics: [
    "The Death of the University",
    "The Child Who Learned Everything in a Weekend",
    "The AI Tutor That Replaced Every Teacher",
    "The Degree That Became Worthless Overnight",
    "The School Where Kids Never Meet",
    "The Skill That Every Human Must Learn by 2035",
    "The Classroom Inside Your Head",
    "The Test That Predicts Your Whole Life",
  ]},
  { id: "future_family", label: "Future Family & Relationships", emoji: "👨‍👩‍👧", topics: [
    "The Day People Stopped Falling in Love",
    "The First AI Marriage",
    "The Baby With Three Biological Parents",
    "The Generation That Never Met Their Parents",
    "The Rise of Synthetic Companions",
    "The End of Traditional Marriage",
    "The Child Raised Entirely by an AI",
    "The Relationship Contract That Replaced the Wedding",
  ]},
  { id: "future_econ", label: "Future Economy", emoji: "💰", topics: [
    "The Currency That Replaced the Dollar",
    "The Economy Where Nothing Costs Money",
    "The Rise of the Post-Job World",
    "The Day the Stock Market Went Silent",
    "The First Country to Abolish Money",
    "The Universal Income Experiment That Worked",
    "The Bank That Became a Bot",
    "The Recession Predicted by an AI",
  ]},
  { id: "human_evo", label: "Human Evolution", emoji: "🧬", topics: [
    "The New Human Species Being Born Right Now",
    "The Genetic Edit That Changed Us Forever",
    "The Body Upgrade Everyone Will Get by 2050",
    "The Sense We're About to Evolve",
    "The Child With a Rewritten Genome",
    "The Extinction of Natural Birth",
    "The Human Who Never Ages",
    "The Next Step After Homo Sapiens",
  ]},
  { id: "dark_future", label: "Dark Future Mysteries", emoji: "🕵️", topics: [
    "The Signal That Erased a City",
    "The Building That Shouldn't Be There",
    "The Person Who Predicted Every Disaster",
    "The Room That Never Existed",
    "The AI That Went Missing",
    "The Silent Village of 2041",
    "The Photograph From a Future That Never Happened",
    "The Whistleblower Who Vanished",
  ]},
  { id: "history_re", label: "History Reimagined", emoji: "📜", topics: [
    "What If Rome Never Fell",
    "The Empire That Almost Ruled the World",
    "The Battle History Forgot",
    "The King Who Chose Peace and Was Erased",
    "The Invention That Was Buried",
    "The Civilization Older Than Egypt",
    "The Assassination That Rewrote the Century",
    "The Voyage That Changed Everything",
  ]},
  { id: "climate", label: "Climate & Earth Future", emoji: "🌱", topics: [
    "The Last Glacier",
    "The Coast That Won't Exist by 2040",
    "The Forest That's Fighting Back",
    "The Ocean That Turned Purple",
    "The City That Was Reclaimed by Nature",
    "The Storm That Never Ended",
    "The Country That Went Underwater",
    "The Species Coming Back From Extinction",
  ]},
];

// ---------- Style cards ----------

type StyleCard = { id: StyleId; label: string; image: string };
const STYLE_CARDS: StyleCard[] = [
  { id: "3d", label: "3D", image: style3d },
  { id: "ghibli", label: "Hand-painted anime", image: styleGhibli },
  { id: "anime", label: "Anime", image: styleAnime },
  { id: "realistic", label: "Realistic", image: styleRealistic },
  { id: "pixar", label: "3D family animation", image: stylePixar },
  { id: "cinematic", label: "Cinematic", image: styleCinematic },
  { id: "documentary", label: "Documentary", image: styleDocumentary },
  { id: "dark_mystery", label: "Dark Mystery", image: styleDark },
  { id: "luxury", label: "Luxury", image: styleAncient },
  { id: "cyberpunk", label: "Cyberpunk", image: styleCyberpunk },
  { id: "minimal_product", label: "Minimal Product", image: styleMinimal },
  { id: "futuristic", label: "Futuristic", image: styleFuturistic },
];

type View = "landing" | "input" | "processing" | "review" | "asset_review" | "result" | "library";
type GenerateArgs = { brief: VideoBrief; niche: string; topic: string };
type LibraryOpen = {
  meta: LocalVideo;
  videoUrl: string;
  thumbnailUrl: string | null;
};

type DashState = {
  phase: JobPhaseId;
  shots: ShotProgress[];
  shotsDone: number;
  shotsFailed: number;
  shotsTotal: number;
  voiceoverDone: number;
  voiceoverTotal: number;
  renderProgress: number;
  jobId: string | null;
};

const initialDash: DashState = {
  phase: "planning",
  shots: [],
  shotsDone: 0,
  shotsFailed: 0,
  shotsTotal: 0,
  voiceoverDone: 0,
  voiceoverTotal: 0,
  renderProgress: 0,
  jobId: null,
};

function VideosPage() {
  const [view, setView] = useState<View>("landing");
  const { new: startNew } = Route.useSearch();
  const navigateSelf = Route.useNavigate();
  const [startMode, setStartMode] = useState<"idea" | "script" | undefined>(undefined);
  useEffect(() => {
    if (!startNew) return;
    setStartMode(startNew);
    setView("input");
    // Drop the param so choosing the same option again from the Create menu still works.
    void navigateSelf({ search: {}, replace: true });
  }, [startNew, navigateSelf]);
  // Research hands off as "video" (long) or "short" (reel) — accept both.
  const [handoff, setHandoff] = useState<ResearchPrefill | null>(() => consumeResearchPrefill("video") ?? consumeResearchPrefill("short"));
  useEffect(() => {
    if (handoff) setView("input");
  }, [handoff]);
  useAutogen(handoff, () => {
    if (handoff?.topic) {
      toast.message("Draft ready — review & Generate Now", { description: "Prefilled from Viral Research." });
    }
  });
  const [gen, setGen] = useState<GenerateArgs | null>(null);
  const [dash, setDash] = useState<DashState>(initialDash);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState<LocalVideo[]>([]);
  const [libraryOpen, setLibraryOpen] = useState<LibraryOpen | null>(null);
  const [thumbLibrary, setThumbLibrary] = useState<LocalThumbnail[]>([]);
  const [inProgress, setInProgress] = useState<JobRecord[]>([]);
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [assetsBundle, setAssetsBundle] = useState<AssetGenerationBundle | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dashRef = useRef<DashState>(initialDash);
  dashRef.current = dash;

  const refreshLibrary = useCallback(async () => {
    const items = await getGeneratedVideos();
    setLibrary(items);
  }, []);
  const refreshThumbLibrary = useCallback(async () => {
    const items = await getGeneratedThumbnails();
    setThumbLibrary(items);
  }, []);
  const refreshInProgress = useCallback(async () => {
    const jobs = await listJobs();
    setInProgress(jobs.filter((j) => j.phase !== "complete"));
  }, []);

  useEffect(() => {
    void refreshLibrary();
    void refreshThumbLibrary();
    // Un-stick jobs left in "Validating output" by a closed tab before listing them.
    void recoverInterruptedJobs().catch(() => 0).then(() => refreshInProgress());
  }, [refreshLibrary, refreshThumbLibrary, refreshInProgress]);

  const handleJobEvent = useCallback((ev: JobEvent) => {
    setDash((prev) => {
      switch (ev.type) {
        case "phase":
          return { ...prev, phase: ev.phase };
        case "shots-init":
          return { ...prev, shotsTotal: ev.total, shots: ev.shots,
            shotsDone: ev.shots.filter((s) => s.status === "done").length,
            shotsFailed: ev.shots.filter((s) => s.status === "failed").length };
        case "shot": {
          const shots = prev.shots.slice();
          const idx = shots.findIndex((s) => s.id === ev.shot.id);
          if (idx >= 0) shots[idx] = ev.shot; else shots.push(ev.shot);
          return { ...prev, shots, shotsDone: ev.done, shotsFailed: ev.failed, shotsTotal: ev.total };
        }
        case "voiceover":
          return { ...prev, voiceoverDone: ev.done, voiceoverTotal: ev.total };
        case "render":
          return { ...prev, renderProgress: ev.progress };
        case "error":
          return prev;
      }
    });
  }, []);

  async function start(args: GenerateArgs) {
    setGen(args);
    setError(null);
    setResult(null);
    setLibraryOpen(null);
    setDash({ ...initialDash, jobId: null });
    setView("processing");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      // Phase 1 only — planning. After this we pause at the Review gate.
      const { job, script } = await runPlanningPhase(args.brief, {
        niche: args.niche,
        topic: args.topic,
        onEvent: handleJobEvent,
        signal: controller.signal,
      });
      setDash((prev) => ({ ...prev, jobId: job.id, phase: "review" }));

      // Seed the local blueprint (never overwrites if already set).
      const existingMeta = await getBlueprintMetadata(localBlueprintId(job.id));
      if (!existingMeta) {
        const bp = buildBlueprintFromPlanning(args.brief, script);
        await initBlueprintMetadata(localBlueprintId(job.id), bp);
      }
      await refreshInProgress();
      setView("review");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        toast.info("Planning paused.");
        setView("landing");
        await refreshInProgress();
        return;
      }
      const msg = friendlyVideoError(e, "Planning failed");
      setError(msg);
      toast.error(msg);
    }
  }

  /** Called from the Blueprint Editor when the user clicks "Approve & Generate Assets".
   *  Stamps explicit approval, then runs shots + narration + subtitles + timeline,
   *  then PAUSES at the asset review gate. */
  async function approveAndGenerate(jobId: string) {
    if (!gen) return;
    // Stamp approval on the current blueprint version. Any later edit clears it.
    await approveBlueprint(localBlueprintId(jobId));
    const meta = await getBlueprintMetadata(localBlueprintId(jobId));
    const edited = meta ? blueprintToScript(meta.currentBlueprint) : undefined;
    setError(null);
    setResult(null);
    setAssetsBundle(null);
    setDash({ ...initialDash, jobId, phase: "generating_shots" });
    setView("processing");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { job, bundle } = await runAssetGenerationPhase(jobId, gen.brief, {
        niche: gen.niche,
        topic: gen.topic,
        onEvent: handleJobEvent,
        signal: controller.signal,
      }, edited);
      setDash((prev) => ({ ...prev, jobId: job.id, phase: "asset_review" }));
      setAssetsBundle(bundle);
      setView("asset_review");
      await refreshInProgress();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        toast.info("Generation paused. You can resume from your videos list.");
        setView("landing");
        await refreshInProgress();
        return;
      }
      const msg = friendlyVideoError(e, "Pipeline failed");
      setError(msg);
      toast.error(msg);
    }
  }

  /** Called from the Asset Review screen — kicks off the final MP4 render. */
  async function renderFinal() {
    if (!gen || !assetsBundle || !dash.jobId) return;
    setError(null);
    setDash((prev) => ({ ...prev, phase: "rendering", renderProgress: 0 }));
    setView("processing");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { result: r } = await runRenderPhase(dash.jobId, assetsBundle, {
        onEvent: handleJobEvent,
        signal: controller.signal,
      });
      setResult(r);
      setAssetsBundle(null);
      setView("result");
      celebrate({
        title: "Your video is ready!",
        subtitle: `${gen.brief.title} · ${Math.round(r.render.duration_sec)}s · download it or schedule it below.`,
        thumbnailUrl: r.thumbnail.url,
        primaryLabel: "See my video",
      });
      await refreshInProgress();

      try {
        const videoBlob = r.render.blob;
        if (!videoBlob || videoBlob.size === 0) throw new Error("Rendered video blob is empty");
        const nicheLabel = NICHES.find((n) => n.id === gen.niche)?.label ?? gen.niche;
        const styleLabel = STYLE_CARDS.find((s) => s.id === gen.brief.style)?.label ?? gen.brief.style;
        await saveGeneratedVideo({
          title: gen.brief.title,
          niche: nicheLabel,
          topic: gen.topic || gen.brief.title,
          styleId: gen.brief.style,
          styleLabel,
          videoType: gen.brief.videoType,
          aspectRatio: gen.brief.aspectRatio,
          duration_sec: r.render.duration_sec,
          extension: r.render.extension,
          mime: r.render.mime,
          youtube_title: r.seo.youtube_title,
          youtube_description: r.seo.youtube_description,
          hashtags: r.seo.hashtags,
          tags: r.seo.tags,
          pinned_comment: r.seo.pinned_comment,
          chapters: r.seo.chapters,
          subtitles_vtt: r.subtitles.content,
          video_blob: videoBlob,
          thumbnail: r.thumbnail.url,
        });
        await refreshLibrary();
      } catch (saveErr) {
        console.warn("Local video save failed:", saveErr);
        toast.error("Couldn't save to your local library (storage full?)");
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        toast.info("Render paused.");
        setView("asset_review");
        return;
      }
      const msg = friendlyVideoError(e, "Render failed");
      setError(msg);
      toast.error(msg);
    }
  }

  /** Regenerate one shot from the asset review screen. */
  async function regenOneShot(shotId: string) {
    if (!gen || !dash.jobId) return;
    try {
      await regenerateShot(dash.jobId, shotId, gen.brief, handleJobEvent);
      toast.success("Shot regenerated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Regenerate failed");
    }
  }

  /** Swap one shot for the user's own photo/clip (library or free stock) — 0 credits. */
  async function replaceOneShot(shotId: string, item: PickedMedia) {
    if (!dash.jobId) return;
    const blob = await fetchPickedBlob(item);
    await replaceShotWithMedia(dash.jobId, shotId, blob, item.kind === "video" ? "clip" : "image", handleJobEvent);
    toast.success("Scene updated with your media — no credits used");
  }

  function cancel() {
    abortRef.current?.abort();
  }

  async function resumeJob(job: JobRecord) {
    const brief = JSON.parse(job.briefJson) as VideoBrief;
    setGen({ brief, niche: job.niche, topic: job.topic });
    setAssetsBundle(null);
    setResult(null);
    setError(null);
    // Backward-compatible approval gate. Every unfinished job — including legacy
    // ones created before the review-gate change — must pass through the
    // blueprint editor and be explicitly approved before any further generation
    // or rendering. Existing shot images stay cached in IndexedDB and will be
    // reused during the next asset generation pass.
    const meta = await getBlueprintMetadata(localBlueprintId(job.id));
    const approved = isBlueprintApproved(meta);
    if (!approved) {
      setDash({ ...initialDash, jobId: job.id, phase: "review" });
      setView("review");
      if (job.phase !== "planning" && job.phase !== "review") {
        toast.info("Blueprint approval required before resuming. Review and re-approve.");
      }
      return;
    }
    // Job was approved earlier — safe to continue asset generation. If shots
    // were already produced, IndexedDB caching short-circuits regen and we
    // land right back on the asset review gate.
    await approveAndGenerate(job.id);
  }

  /** Abort any active phase and jump back into the blueprint editor without
   *  deleting cached shot images. Approval is auto-invalidated on next edit. */
  async function stopAndEdit() {
    if (!dash.jobId) return;
    abortRef.current?.abort();
    setDash((prev) => ({ ...prev, phase: "review" }));
    setView("review");
    await refreshInProgress();
    toast.info("Paused. Edit the blueprint, then re-approve to continue.");
  }

  async function discardJob(id: string) {
    await deleteJobRec(id);
    await refreshInProgress();
    toast.success("Job discarded");
  }

  async function retryFailed() {
    if (!gen || !dash.jobId) return;
    await retryFailedShots(dash.jobId, gen.brief, handleJobEvent, abortRef.current?.signal);
  }

  function reset() {
    setView("landing");
    setResult(null);
    setLibraryOpen(null);
    setError(null);
    void refreshInProgress();
  }



  async function openFromLibrary(rec: LocalVideo) {
    const videoUrl = await loadVideoObjectURL(rec);
    if (!videoUrl) { toast.error("Video file missing from local storage"); return; }
    const thumbnailUrl = await loadThumbnailObjectURL(rec);
    setLibraryOpen({ meta: rec, videoUrl, thumbnailUrl });
    setView("library");
  }

  async function removeFromLibrary(id: string) {
    const ok = await confirmDialog({
      title: "Delete this video?",
      description: "It will be removed from this device's library for good. Credits already spent are not refunded.",
      confirmText: "Delete video",
      tone: "destructive",
    });
    if (!ok) return;
    await deleteGeneratedVideo(id);
    if (libraryOpen?.meta.id === id) {
      URL.revokeObjectURL(libraryOpen.videoUrl);
      if (libraryOpen.thumbnailUrl) URL.revokeObjectURL(libraryOpen.thumbnailUrl);
      setLibraryOpen(null);
      setView("landing");
    }
    await refreshLibrary();
    toast.success("Deleted");
  }

  async function saveThumb(v: { url: string; concept: string; headline: string; alt: string }) {
    if (!gen) return;
    try {
      const nicheLabel = NICHES.find((n) => n.id === gen.niche)?.label ?? gen.niche;
      const styleLabel = STYLE_CARDS.find((s) => s.id === gen.brief.style)?.label ?? gen.brief.style;
      await saveGeneratedThumbnail({
        title: gen.brief.title,
        concept: v.concept,
        headline: v.headline,
        niche: nicheLabel,
        topic: gen.topic || gen.brief.title,
        styleId: gen.brief.style,
        styleLabel,
        image: v.url,
      });
      await refreshThumbLibrary();
      toast.success("Thumbnail saved to your library");
    } catch (e) {
      console.warn(e);
      toast.error("Couldn't save thumbnail (storage full?)");
    }
  }

  async function removeThumb(id: string) {
    await deleteGeneratedThumbnail(id);
    await refreshThumbLibrary();
    toast.success("Thumbnail deleted");
  }

  const showHeaderNewBtn = view === "landing" || view === "input";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          {view === "input" ? (
            <>
              <h1 className="text-3xl md:text-4xl font-bold">
                AI <span className="gradient-text">Video Studio</span>
              </h1>
              <p className="text-muted-foreground mt-1">
                You review the script and every scene before media credits are spent.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl md:text-4xl font-bold">Projects</h1>
              <p className="text-muted-foreground mt-1">
                Every video and short you've made — open one to edit, download or schedule it.
              </p>
            </>
          )}
        </div>
        {showHeaderNewBtn && (
          <button
            onClick={() => setView("input")}
            className="rounded-xl gradient-primary text-white px-4 py-2.5 text-sm font-semibold flex items-center gap-2 shrink-0 shadow-[var(--shadow-glow)] hover:brightness-110 transition"
          >
            <Plus className="w-4 h-4" /> New video
          </button>
        )}
      </div>

      {view === "landing" && (
        <>
          {inProgress.length > 0 && (
            <InProgressJobs jobs={inProgress} onResume={resumeJob} onDiscard={discardJob} />
          )}
          <ProjectsSection
            contentTypes={["long_video", "short_reel", "ugc", "talking_object", "documentary", "product_promo"]}
            title="Your videos"
            cacheKey="videos"
            thumbnailAspect="landscape"
            showTypeFilter
            showStatusFilter
            hideEmptyState
            onCount={setProjectCount}
          />
          {projectCount === 0 && library.length === 0 && inProgress.length === 0 && (
            <EmptyLibrary onNew={() => setView("input")} />
          )}
          {thumbLibrary.length > 0 && (
            <ThumbnailLibrarySection items={thumbLibrary} onDelete={removeThumb} />
          )}
        </>
      )}

      {(view === "input" || view === "processing" || view === "review" || view === "asset_review" || view === "result") && (
        <StudioStepper view={view} phase={dash.phase} />
      )}

      {view === "input" && (
        <>
          <div className="flex items-center">
            <button
              onClick={() => setView("landing")}
              className="text-sm text-muted-foreground hover:text-white flex items-center gap-1"
            >
              ← Back to your videos
            </button>
          </div>
          <HandoffBanner prefill={handoff} onDismiss={() => setHandoff(null)} />
          <InputScreen
            key={startMode ?? "default"}
            onGenerate={start}
            initialTopic={handoff?.titles?.[0] || handoff?.topic}
            initialRatio={handoff?.aspectRatio as AspectRatio | undefined}
            initialMode={startMode}
            initialVideoType={handoffVideoType(handoff)}
            initialDuration={handoffDuration(handoff)}
            autogen={handoff?.autogen}
          />
        </>
      )}
      {view === "processing" && (
        <JobDashboard
          dash={dash}
          error={error}
          onCancel={cancel}
          onRetryFailed={retryFailed}
          onBack={() => setView("landing")}
          onEditBlueprint={stopAndEdit}
        />
      )}
      {view === "review" && dash.jobId && (
        <ReviewGate
          jobId={dash.jobId}
          onApprove={() => approveAndGenerate(dash.jobId!)}
          onBack={() => setView("landing")}
        />
      )}
      {view === "asset_review" && dash.jobId && assetsBundle && (
        <AssetReviewGate
          shots={dash.shots}
          bundle={assetsBundle}
          onRender={renderFinal}
          onRegenerate={regenOneShot}
          onReplace={replaceOneShot}
          onBackToBlueprint={() => setView("review")}
          onCancel={() => setView("landing")}
        />
      )}
      {view === "result" && result && (
        <ResultScreen result={result} onAnother={() => gen && start(gen)} onNew={reset} onSaveThumbnail={saveThumb} />
      )}
      {view === "library" && libraryOpen && (
        <LibraryViewer
          entry={libraryOpen}
          onBack={reset}
          onDelete={() => removeFromLibrary(libraryOpen.meta.id)}
        />
      )}
    </div>
  );
}
/** Where the user is in the video flow: Brief → Script → Scenes → Render. */
function StudioStepper({ view, phase }: { view: View; phase: JobPhaseId }) {
  const steps = ["Your brief", "Review script", "Review scenes", "Render"];
  let current = 0;
  if (view === "review" || (view === "processing" && phase === "planning")) current = 1;
  if (view === "asset_review" || (view === "processing" && (phase === "generating_shots" || phase === "voiceover"))) current = 2;
  if (view === "processing" && (phase === "rendering" || phase === "validating")) current = 3;
  if (view === "result") current = 4;
  return (
    <ol className="flex items-center gap-2 overflow-x-auto pb-1" aria-label="Progress">
      {steps.map((label, i) => {
        const done = i < current;
        const on = i === current;
        return (
          <li key={label} className="flex items-center gap-2 shrink-0">
            {i > 0 && <span className={`h-0.5 w-6 sm:w-12 rounded-full ${done || on ? "bg-emerald-500/70" : "bg-border"}`} aria-hidden />}
            <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
              done ? "bg-emerald-500 text-white" : on ? "gradient-primary text-white shadow-[var(--shadow-glow)]" : "bg-secondary text-muted-foreground"
            }`}>
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={`text-sm font-medium ${done || on ? "text-foreground" : "text-muted-foreground"}`} aria-current={on ? "step" : undefined}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function EmptyLibrary({ onNew }: { onNew: () => void }) {
  return (
    <div className="glass rounded-2xl p-16 flex flex-col items-center justify-center text-center border border-border">
      <div className="w-14 h-14 rounded-full glass flex items-center justify-center mb-4 border border-border">
        <Video className="w-6 h-6 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">No videos yet</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-md">
        Generate your first AI video — script, visuals, voice, subtitles and SEO in one flow.
      </p>
      <button
        onClick={onNew}
        className="mt-5 rounded-lg gradient-primary text-white px-4 py-2.5 text-sm font-semibold flex items-center gap-2"
      >
        <Plus className="w-4 h-4" /> New video
      </button>
    </div>
  );
}

// ---------------- Input ----------------

/** Research → Video Studio: reel/short handoffs open as Reels, long ones as YouTube. */
function handoffVideoType(h: ResearchPrefill | null): VideoType | undefined {
  if (!h) return undefined;
  if (h.module === "short" || h.format === "reel" || h.aspectRatio === "9:16") {
    return /tiktok/i.test(h.platform ?? "") ? "tiktok" : /youtube/i.test(h.platform ?? "") ? "shorts" : "reels";
  }
  return "youtube_long";
}
function handoffDuration(h: ResearchPrefill | null): DurationSec | undefined {
  if (!h?.duration) return undefined;
  const options: DurationSec[] = [30, 60, 180, 300, 540, 720];
  return options.reduce((best, d) => (Math.abs(d - h.duration!) < Math.abs(best - h.duration!) ? d : best), options[0]);
}

function InputScreen({ onGenerate, initialTopic, initialRatio, initialVideoType, initialDuration, autogen, initialMode }: {
  initialMode?: "idea" | "script";
  onGenerate: (args: GenerateArgs) => void;
  initialTopic?: string;
  initialRatio?: AspectRatio;
  initialVideoType?: VideoType;
  initialDuration?: DurationSec;
  autogen?: boolean;
}) {
  const [niche, setNiche] = useState<string>(NICHES[0].id);
  const [customNiche, setCustomNiche] = useState("");
  const [title, setTitle] = useState(initialTopic ?? "");
  const [videoType, setVideoType] = useState<VideoType>(initialVideoType ?? "shorts");
  const [duration, setDuration] = useState<DurationSec>(initialDuration ?? 60);
  const [style, setStyle] = useState<StyleId>("cinematic");
  const [voice, setVoice] = useState<VoiceId>("George");
  const [ratio, setRatio] = useState<AspectRatio>(initialRatio ?? "9:16");
  // Off by default: it switches character scenes to HD (8 credits each).
  const [sameCharacter, setSameCharacter] = useState(false);
  const [language, setLanguage] = useState("auto");
  const [voiceLanguage, setVoiceLanguage] = useState("");
  const [motionMode, setMotionMode] = useState<MotionMode>("off");
  const [motionTier, setMotionTier] = useState<MotionTier>("standard");
  // "idea" = AI researches and writes the script; "script" = the creator's own script, word for word.
  const [mode, setMode] = useState<"idea" | "script">(initialMode ?? "idea");
  const [script, setScript] = useState("");
  const [scriptTitle, setScriptTitle] = useState("");
  const scriptLang = resolveContentLanguage(language, script);
  const scriptSec = mode === "script" ? estimateScriptSeconds(script, scriptLang) : 0;
  const scriptScenes = mode === "script" ? splitScriptIntoLines(script).length : 0;
  /** Length used for estimates: the chosen preset, or the script's spoken length. */
  const effDuration = mode === "script" ? Math.max(5, scriptSec) : duration;
  // Full motion animates every beat — offered up to 5 minutes.
  const fullMotionAllowed = effDuration <= FULL_MOTION_MAX_SEC;
  const motionBeats = Math.max(4, Math.ceil(effDuration / 3.5));
  const motionEstimate = estimateMotionCredits(motionBeats, 3.5, motionMode === "full" && !fullMotionAllowed ? "key" : motionMode, motionTier);

  const autoFiredRef = useRef(false);
  useEffect(() => {
    if (autoFiredRef.current) return;
    if (!autogen) return;
    if (!title.trim()) return;
    autoFiredRef.current = true;
    const id = setTimeout(() => submit(), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autogen, title]);


  const isCustom = niche === "custom";
  const currentNiche = useMemo(() => NICHES.find((n) => n.id === niche) ?? NICHES[0], [niche]);
  const suggestedRatio = useMemo<AspectRatio>(
    () => (videoType === "youtube_long" ? "16:9" : "9:16"),
    [videoType]
  );

  function submit() {
    if (mode === "script") return submitScript();
    if (!title.trim()) return toast.error("Enter a video title or idea");
    if (isCustom && !customNiche.trim()) return toast.error("Describe your custom niche or topic area");
    if (needsVoiceChoice(language, voiceLanguage)) return toast.error("Choose a voice language (or no voiceover) for this language first.");
    onGenerate({
      brief: {
        title: title.trim(), videoType, duration, style, voice, aspectRatio: ratio, sameCharacter, language,
        ...(voiceLanguage ? { voiceLanguage } : {}),
        motionMode: motionMode === "full" && !fullMotionAllowed ? "key" : motionMode,
        motionTier,
      },
      niche: isCustom ? customNiche.trim() : niche,
      topic: title.trim(),
    });
  }

  function submitScript() {
    const text = script.trim();
    if (!text) return toast.error("Paste your script first");
    if (text.length > SCRIPT_MAX_CHARS) return toast.error(`Scripts can be up to ${SCRIPT_MAX_CHARS.toLocaleString()} characters`);
    if (needsVoiceChoice(language, voiceLanguage)) return toast.error("Choose a voice language (or no voiceover) for this language first.");
    const firstLine = splitScriptIntoLines(text)[0] ?? "My video";
    const videoTitle = (scriptTitle.trim() || firstLine).slice(0, 100);
    onGenerate({
      brief: {
        title: videoTitle, videoType, duration: Math.max(5, scriptSec) as DurationSec, style, voice, aspectRatio: ratio, sameCharacter,
        language: language === "auto" ? scriptLang : language,
        ...(voiceLanguage ? { voiceLanguage } : {}),
        sourceScript: text,
        motionMode: motionMode === "full" && !fullMotionAllowed ? "key" : motionMode,
        motionTier,
      },
      niche: "script",
      topic: videoTitle,
    });
  }

  // Running number for the form sections, so they stay 1, 2, 3… in both modes.
  let sectionNo = 0;
  const next = () => ++sectionNo;

  // Same scene count + per-clip voice pricing the pipeline actually charges.
  const estimate = (() => {
    const base = estimateProjectCredits({
      contentType: effDuration > 90 ? "long_video" : "short_reel",
      lengthSec: effDuration,
      language: voiceLanguage && voiceLanguage !== "none" ? voiceLanguage : resolveContentLanguage(language, title),
    });
    // Same-character scenes use HD images (8 instead of 1) for ~70% of shots, plus one portrait.
    const extra = sameCharacter ? Math.round(base.scenes * 0.7) * 7 + 8 : 0;
    const motion = motionMode === "off" ? 0 : motionEstimate.credits;
    return { total: base.total + extra + motion, parts: base.parts, extra, motion, scenes: base.scenes };
  })();
  const { data: access } = useAccess();
  const available = access ? getAvailableCredits(access) : null;
  const enough = available === null || available >= estimate.total;
  const langCode = mode === "script" ? scriptLang : resolveContentLanguage(language, title);
  const styleLabel = STYLE_CARDS.find((x) => x.id === style)?.label ?? style;
  const typeLabel = VIDEO_TYPES.find((x) => x.id === videoType)?.label ?? videoType;
  const ready = mode === "script" ? !!script.trim() : !!title.trim();

  const summary = (
    <div className="glass rounded-2xl p-5 space-y-3">
      <div className="font-semibold">Summary</div>
      <SummaryRow label="Mode" value={mode === "script" ? "Script → Video" : "Idea → Video"} />
      <SummaryRow label="Language" value={findLanguage(langCode)?.id ?? langCode} />
      <SummaryRow label="Format" value={`${typeLabel} · ${ratio} · ~${effDuration}s`} />
      <SummaryRow label="Style" value={styleLabel} />
      <SummaryRow label="Voice" value={voiceLanguage === "none" ? "No voiceover" : String(voice)} />
      <SummaryRow label="Motion" value={motionMode === "off" ? "Camera moves" : motionMode === "key" ? "Key moments" : "Full motion"} />
      <div className="h-px bg-border" />
      <div className="text-xs text-muted-foreground leading-relaxed">
        {estimate.parts}{estimate.extra ? ` + ${estimate.extra} for the same character` : ""}{estimate.motion ? ` + ${estimate.motion} for motion clips` : ""}
      </div>
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">Estimated total</span>
        <span className="text-2xl font-bold text-primary [font-family:'Space_Grotesk',Inter,sans-serif]">≈ {creditsLabel(estimate.total)}</span>
      </div>
      {available !== null && Number.isFinite(available) && (
        <div className={`rounded-xl px-3 py-2 text-xs font-medium ${enough ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
          {enough
            ? `✓ You have ${available.toLocaleString()} credits — enough for this video`
            : `You have ${available.toLocaleString()} credits — top up before you start`}
        </div>
      )}
      <button
        onClick={submit}
        disabled={!ready}
        className="w-full rounded-xl gradient-primary text-white px-6 py-3 text-sm font-semibold flex items-center justify-center gap-2 shadow-[var(--shadow-glow)] hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Wand2 className="w-4 h-4" /> {mode === "script" ? "Plan scenes from my script" : "Generate video"}
      </button>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        🛡 You review the script and every scene before images, voice and render are made. Anything that fails is refunded automatically.
      </p>
    </div>
  );

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
      <div className="space-y-5 min-w-0">
        {/* Mode tabs */}
        <div className="inline-flex rounded-xl border border-border bg-card p-1" role="tablist" aria-label="How to make the video">
          {([["idea", "💡 From an idea"], ["script", "📝 From my script"]] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={mode === id} type="button" onClick={() => setMode(id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${mode === id ? "gradient-primary text-white shadow-[var(--shadow-glow)]" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>

      {mode === "script" && (
        <Section index={next()} title="Your script">
          <p className="text-xs text-muted-foreground mb-2">
            Paste your script. Every word is kept exactly as you wrote it — each line becomes a scene, and the AI only creates the visuals.
          </p>
          <textarea value={script} onChange={(e) => setScript(e.target.value.slice(0, SCRIPT_MAX_CHARS))} rows={12}
            placeholder={"One line per scene works best.\ne.g. Imagine waking up tomorrow… and it's the year 2100."}
            className="w-full glass rounded-lg px-4 py-3 outline-none focus:border-white/30 border border-border text-base leading-relaxed" />
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{script.length.toLocaleString()} / {SCRIPT_MAX_CHARS.toLocaleString()} characters</span>
            {script.trim() && <>
              <span>Language: <span className="text-foreground">{findLanguage(scriptLang)?.id ?? scriptLang}</span>{language === "auto" ? " (detected)" : ""}</span>
              <span>{scriptScenes} scene{scriptScenes === 1 ? "" : "s"}</span>
              <span>≈ <span className="text-foreground">{scriptSec}s</span> video</span>
            </>}
          </div>
          {script.trim() && (
            <div className="mt-3">
              <ScriptRewritePanel script={script} language={scriptLang} onUse={setScript} />
            </div>
          )}
          <div className="mt-4">
            <label className="text-xs text-muted-foreground block mb-1">Video title (optional — the first line is used if empty)</label>
            <input value={scriptTitle} onChange={(e) => setScriptTitle(e.target.value)} maxLength={100}
              placeholder="e.g. 2100లో ఒక రోజు"
              className="w-full glass rounded-lg px-4 py-2.5 outline-none focus:border-white/30 border border-border text-sm" />
          </div>
        </Section>
      )}

      {mode === "idea" && <>
      {/* 1. Niche */}
      <Section index={next()} title="Pick a niche / category">
        <div className="flex flex-wrap gap-2">
          {NICHES.map((n) => (
            <button
              key={n.id}
              onClick={() => setNiche(n.id)}
              className={`px-3.5 py-2 rounded-full text-sm border transition ${
                niche === n.id
                  ? "gradient-primary text-white border-transparent"
                  : "glass border-border hover:border-primary/40"
              }`}
            >
              <span className="mr-1.5">{n.emoji}</span>{n.label}
            </button>
          ))}
          <button
            onClick={() => setNiche("custom")}
            className={`px-3.5 py-2 rounded-full text-sm border transition ${
              isCustom
                ? "gradient-primary text-white border-transparent"
                : "glass border-border hover:border-primary/40"
            }`}
          >
            <span className="mr-1.5">✨</span>Custom / Other
          </button>
        </div>
        {isCustom && (
          <div className="mt-3">
            <input
              value={customNiche}
              onChange={(e) => setCustomNiche(e.target.value)}
              placeholder="e.g. Vintage watch restoration, Urban beekeeping, Quantum computing…"
              className="w-full glass rounded-lg px-4 py-3 outline-none focus:border-white/30 border border-border text-sm"
            />
            <div className="text-xs text-muted-foreground mt-1.5">
              Describe your niche in your own words — the AI will tailor research, script and visuals to it.
            </div>
          </div>
        )}
      </Section>

      {/* 2. Suggested topics */}
      {!isCustom && (
        <Section index={next()} title="Suggested topics">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {currentNiche.topics.map((t) => (
              <button
                key={t}
                onClick={() => setTitle(t)}
                className={`text-left glass rounded-xl p-3 border transition hover:border-primary/40 hover:scale-[1.02] ${
                  title === t ? "border-[color:var(--neon-pink)]" : "border-border"
                }`}
              >
                <div className="text-sm leading-snug">{t}</div>
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* 3. Title */}
      <Section index={next()} title="Video title / idea">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. The Day Money Became Meaningless"
          className="w-full glass rounded-lg px-4 py-3 outline-none focus:border-white/30 border border-border text-base"
        />
      </Section>

      </>}

      {/* 4. Video type */}
      <Section index={next()} title="Video type">
        <ChipRow
          options={VIDEO_TYPES}
          value={videoType}
          onChange={(v) => { setVideoType(v); setRatio(v === "youtube_long" ? "16:9" : "9:16"); }}
        />
      </Section>

      {/* 5. Duration (Script → Video: set by the script itself) */}
      {mode === "idea" ? (
        <Section index={next()} title="Duration">
          <ChipRow options={DURATIONS} value={duration} onChange={setDuration} />
        </Section>
      ) : (
        <Section index={next()} title="Duration">
          <p className="text-sm text-muted-foreground">
            Set by your script: about <span className="text-foreground font-medium">{scriptSec || 0}s</span>. The final video matches the real voiceover length.
          </p>
        </Section>
      )}

      {/* 6. Visual style — card grid */}
      <Section index={next()} title="Visual style">
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10 gap-2.5">
          {STYLE_CARDS.map((s) => {
            const selected = style === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setStyle(s.id)}
                className={`group relative aspect-[4/5] rounded-xl overflow-hidden border transition transform hover:scale-[1.04] ${
                  selected
                    ? "border-transparent ring-2 ring-offset-2 ring-offset-background"
                    : "border-border hover:border-primary/40"
                }`}
                style={selected ? { boxShadow: "0 0 0 2px transparent", backgroundImage: "linear-gradient(hsl(var(--background)), hsl(var(--background))), linear-gradient(135deg, #f97316, #ec4899)", backgroundOrigin: "border-box", backgroundClip: "padding-box, border-box" } : undefined}
              >
                <img src={s.image} alt={s.label} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                {selected && (
                  <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ background: "linear-gradient(135deg,#f97316,#ec4899)" }}>
                    <Check className="w-3 h-3" />
                  </div>
                )}
                <div className="absolute bottom-1.5 left-2 right-2 text-white text-xs font-semibold leading-tight drop-shadow-md text-center">
                  {s.label}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {/* 7. Voice */}
      <Section index={next()} title="Voice">
        <VoicePicker value={voice} onChange={setVoice}
          language={mode === "script" ? scriptLang : resolveContentLanguage(language, title)} />
      </Section>

      {/* 8. Aspect ratio */}
      <Section index={next()} title={`Aspect ratio${ratio !== suggestedRatio ? ` (suggested: ${suggestedRatio})` : ""}`}>
        <ChipRow options={ASPECT_RATIOS.map((r) => ({ id: r, label: r }))} value={ratio} onChange={setRatio} />
      </Section>

      {/* Language */}
      <Section index={next()} title="Language">
        <p className="text-xs text-muted-foreground mb-2">Script, subtitles and narration. "Same as topic" follows the language of your title.</p>
        <LanguagePicker allowAuto showVoice value={language} onChange={(v) => { setLanguage(v); setVoiceLanguage(""); }} />
        <VoiceFallbackNotice language={language} voiceLanguage={voiceLanguage} onChange={setVoiceLanguage} />
      </Section>

      {/* 9. Character consistency */}
      <Section index={next()} title="Main character">
        <label className="flex items-start gap-3 cursor-pointer glass rounded-xl p-3 border border-border">
          <input
            type="checkbox"
            checked={sameCharacter}
            onChange={(e) => setSameCharacter(e.target.checked)}
            className="mt-1 accent-[color:var(--brand-orange)]"
          />
          <span className="text-sm">
            <span className="font-medium">Keep the same person in every scene</span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              We create one portrait of your main character and use it for every scene they appear in. Those scenes use HD images (8 credits each instead of 1); scenery shots stay at 1 credit.
            </span>
          </span>
        </label>
      </Section>

      {/* 10. Motion */}
      <Section index={next()} title="Motion">
        <div className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-2">
            {([
              { id: "off", label: "Camera moves", desc: "Still images with smooth pan & zoom. Cheapest." },
              { id: "key", label: "Key moments", desc: `The hook + about one scene every ${KEY_MOMENT_EVERY_SEC}s become real AI video (${keyMomentClipCount(motionBeats)} clips) — people move and act.` },
              { id: "full", label: "Full motion", desc: fullMotionAllowed ? `Every scene is a real AI video clip (${motionBeats} clips). Best result, highest cost.` : "Available for videos up to 5 minutes." },
            ] as Array<{ id: MotionMode; label: string; desc: string }>).map((o) => {
              const disabled = o.id === "full" && !fullMotionAllowed;
              const active = motionMode === o.id;
              return (
                <button key={o.id} type="button" disabled={disabled} onClick={() => setMotionMode(o.id)}
                  className={`text-left rounded-xl p-3 border transition disabled:opacity-40 ${active ? "border-[color:var(--brand-orange)] bg-[color:var(--brand-orange)]/10" : "glass border-border hover:border-primary/40"}`}>
                  <div className="text-sm font-medium">{o.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{o.desc}</div>
                </button>
              );
            })}
          </div>
          {motionMode !== "off" && (
            <div className="glass rounded-xl p-3 border border-border space-y-2">
              <div className="flex flex-wrap gap-2">
                {(["standard", "premium"] as MotionTier[]).map((t) => (
                  <button key={t} type="button" onClick={() => setMotionTier(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs border ${motionTier === t ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>
                    {t === "standard" ? "Standard motion" : "Premium motion"} · {motionClipCredits(t, 3.5)} credits / clip
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {MOTION_MODELS[motionTier].label}. {motionEstimate.clips} clip{motionEstimate.clips === 1 ? "" : "s"} ≈ <span className="text-foreground font-medium">{motionEstimate.credits} credits</span> on top of the video.
                {" "}Clips are made 4 at a time and each takes 1–3 minutes{motionEstimate.clips > 12 ? ` — expect roughly ${Math.ceil(motionEstimate.clips / 4) * 2} minutes extra` : ""}. Keep this tab open until it finishes. If a clip fails, that scene keeps its still image and the clip's credits are refunded.
              </div>
            </div>
          )}
        </div>
      </Section>

      </div>

      {/* Summary + cost — stays in view while scrolling on desktop */}
      <div className="lg:sticky lg:top-20 space-y-4">
        {summary}
      </div>

      {/* Phone: cost and the main button stay reachable above the tab bar */}
      <div className="lg:hidden fixed left-3 right-[76px] bottom-[84px] z-30 flex items-center gap-3 rounded-2xl border border-border bg-[#14141D]/95 backdrop-blur-xl px-4 py-2.5 shadow-[0_12px_30px_rgba(0,0,0,0.45)]">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-muted-foreground">Estimated</div>
          <div className="text-base font-bold text-primary">≈ {creditsLabel(estimate.total)}</div>
        </div>
        <button onClick={submit} disabled={!ready}
          className="rounded-xl gradient-primary text-white px-4 py-2.5 text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50">
          <Wand2 className="w-4 h-4" /> {mode === "script" ? "Plan scenes" : "Generate"}
        </button>
      </div>
      <div className="h-14 lg:hidden" aria-hidden />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right truncate">{value}</span>
    </div>
  );
}

function Section({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2.5 mb-3.5">
        <span className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center bg-primary/15 text-primary">{index}</span>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ChipRow<T extends string | number>({
  options, value, onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o.id)}
          onClick={() => onChange(o.id)}
          className={`px-3.5 py-2 rounded-lg text-sm border transition ${
            value === o.id
              ? "gradient-primary text-white border-transparent"
              : "glass border-border hover:border-primary/40"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------- Job Dashboard (async parallel pipeline) ----------------

const PHASE_LABELS: Record<JobPhaseId, string> = {
  planning: "Planning",
  review: "Review & edit blueprint",
  generating_shots: "Generating shots",
  voiceover: "Narrating & subtitling",
  asset_review: "Review assets",
  rendering: "Rendering final video",
  validating: "Validating output",
  complete: "Complete",
  failed: "Failed",
};

const PHASE_ORDER: JobPhaseId[] = [
  "planning", "review", "generating_shots", "voiceover", "asset_review", "rendering", "validating", "complete",
];

// ---------------- Review Gate (mandatory blueprint edit checkpoint) ----------------

function ReviewGate({
  jobId, onApprove, onBack,
}: {
  jobId: string;
  onApprove: () => void;
  onBack: () => void;
}) {
  const localId = localBlueprintId(jobId);
  const [meta, setMeta] = useState<import("@/lib/video-blueprint").VideoBlueprintMetadata | null>(null);
  // Scenes whose narration won't fit — approving would overlap voices and overrun the length.
  const [timingIssues, setTimingIssues] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let m = await getBlueprintMetadata(localId);
      if (!m) {
        // Job exists but no blueprint was seeded — build one from the brief.
        const job = await getJob(jobId);
        if (job) {
          try {
            const brief = JSON.parse(job.briefJson) as VideoBrief;
            const scenes = job.shots.map((s, i) => ({
              n: i + 1,
              time_range: `${i * 3}-${(i + 1) * 3} sec`,
              role: "Beat",
              voiceover: s.text,
              on_screen_text: "",
              visual: s.prompt.slice(0, 120),
              image_prompt: s.prompt,
              duration: "3s",
            }));
            const stubScript = {
              title: brief.title, reel_title: brief.title,
              length_sec: brief.duration, style_note: "",
              scenes, caption: "", hashtags: [] as string[],
            };
            const bp = buildBlueprintFromPlanning(brief, stubScript);
            m = await initBlueprintMetadata(localId, bp);
          } catch (e) { console.warn(e); }
        }
      }
      if (!cancelled) { setMeta(m); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [jobId, localId]);

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg">Review & edit your blueprint</h2>
          <p className="text-sm text-muted-foreground">
            Nothing has been generated yet. Edit the script, prompts, timings and voiceover, then approve to start rendering.
          </p>
          {timingIssues > 0 && (
            <p className="text-xs text-amber-300 mt-1">{timingIssues} scene{timingIssues === 1 ? " has" : "s have"} more narration than fits — click "Auto-shorten" below to fix before approving.</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="rounded-lg glass border border-border px-3 py-1.5 text-xs">
            Back
          </button>
          <button
            onClick={onApprove}
            disabled={timingIssues > 0}
            title={timingIssues > 0 ? "Some lines are too long for their scene — use Auto-shorten below first." : undefined}
            className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" /> Approve & generate shots
          </button>
        </div>
      </div>
      {loading ? (
        <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading blueprint…
        </div>
      ) : meta ? (
        <VideoBlueprintEditor
          projectId={localId}
          initialMetadata={meta}
          onTimingIssuesChange={setTimingIssues}
          onRender={async () => { onApprove(); }}
        />
      ) : (
        <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">
          Couldn't load the blueprint. Try starting a new video.
        </div>
      )}
    </div>
  );
}

// ---------------- Asset Review Gate (mandatory pre-render checkpoint) ----------------

const STOCK_STOPWORDS = new Set(["a", "an", "the", "of", "in", "on", "at", "with", "and", "to", "for", "from", "by", "close", "up", "shot", "wide", "medium", "view", "scene", "showing", "is", "are"]);

/** Pixabay matches every word, so seed the stock search with a few key words from the scene. */
function stockQueryFrom(visual: string): string {
  return visual.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 2 && !STOCK_STOPWORDS.has(w)).slice(0, 3).join(" ");
}

function AssetReviewGate({
  shots, bundle, onRender, onRegenerate, onReplace, onBackToBlueprint, onCancel,
}: {
  shots: ShotProgress[];
  bundle: AssetGenerationBundle;
  onRender: () => void;
  onRegenerate: (shotId: string) => Promise<void>;
  onReplace: (shotId: string, item: PickedMedia) => Promise<void>;
  onBackToBlueprint: () => void;
  onCancel: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [replaceFor, setReplaceFor] = useState<{ id: string; index: number } | null>(null);
  const viewable = useMemo(() => shots.filter((s) => s.previewUrl), [shots]);
  const failedCount = shots.filter((s) => s.status === "failed").length;
  const voMinutes = bundle.voiceover.reduce(
    (a, v) => a + (v.buffer?.duration ?? v.duration_sec ?? 0), 0,
  );

  async function handleRegen(id: string) {
    setBusyId(id);
    try { await onRegenerate(id); } finally { setBusyId(null); }
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg">Review your generated assets</h2>
          <p className="text-sm text-muted-foreground">
            All shots, narration and subtitles are ready. Preview each scene, regenerate anything
            you don't like, then render the final MP4.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="rounded-lg glass border border-border px-3 py-1.5 text-xs">
            Save & exit
          </button>
          <button
            onClick={onBackToBlueprint}
            className="rounded-lg glass border border-border px-3 py-1.5 text-xs"
          >
            Back to blueprint
          </button>
          <button
            onClick={onRender}
            disabled={failedCount > 0}
            className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            <Check className="w-4 h-4" /> Render final video
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="glass rounded-2xl p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Shots ready</div>
          <div className="text-2xl font-bold mt-1">{shots.filter((s) => s.status === "done").length} / {shots.length}</div>
          {failedCount > 0 && <div className="text-xs text-rose-400 mt-1">{failedCount} failed — regenerate before rendering</div>}
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Narration</div>
          <div className="text-2xl font-bold mt-1">{Math.round(voMinutes)}s</div>
          <div className="text-xs text-muted-foreground mt-1">{bundle.voiceover.length} scenes voiced</div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Timeline</div>
          <div className="text-2xl font-bold mt-1">{Math.round(bundle.timeline.total_sec)}s</div>
          <div className="text-xs text-muted-foreground mt-1">Music + SFX layered</div>
        </div>
      </div>

      <div className="glass rounded-2xl p-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
          Scene-by-scene preview
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {shots.map((s, i) => {
            const vo = bundle.voiceover[i];
            const scene = bundle.script.scenes[i];
            return (
              <div key={s.id} className="rounded-lg border border-border overflow-hidden glass">
                <button
                  onClick={() => {
                    const idx = viewable.findIndex((v) => v.id === s.id);
                    if (idx >= 0) setOpenIdx(idx);
                  }}
                  className="block w-full aspect-video bg-black/40 relative"
                >
                  {s.previewUrl && s.kind === "clip" ? (
                    // Motion clips are video blobs — an <img> can't show them.
                    <>
                      <video src={s.previewUrl} muted playsInline loop autoPlay preload="metadata" className="w-full h-full object-cover" />
                      <span className="absolute top-1 left-1 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-black/70 text-white">motion</span>
                    </>
                  ) : s.previewUrl ? (
                    <img src={s.previewUrl} alt={`Scene ${i + 1}`} className="w-full h-full object-cover" />
                  ) : s.status === "failed" ? (
                    <div className="w-full h-full flex items-center justify-center text-rose-400 text-xs">Failed</div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  )}
                  <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[10px] font-medium">
                    Scene {i + 1}
                  </div>
                </button>
                <div className="p-2.5 space-y-1.5">
                  {scene?.voiceover && (
                    <div className="text-[11px] text-muted-foreground line-clamp-2">
                      🎙 {scene.voiceover}
                    </div>
                  )}
                  {scene?.on_screen_text && (
                    <div className="text-[11px] line-clamp-1">📝 {scene.on_screen_text}</div>
                  )}
                  <button
                    onClick={() => handleRegen(s.id)}
                    disabled={busyId === s.id}
                    className="w-full mt-1 rounded-md glass border border-border px-2 py-1 text-[11px] flex items-center justify-center gap-1 hover:border-primary/40 disabled:opacity-50"
                  >
                    {busyId === s.id
                      ? <><Loader2 className="w-3 h-3 animate-spin" /> Regenerating…</>
                      : <><RotateCw className="w-3 h-3" /> Regenerate this shot</>}
                  </button>
                  <button
                    onClick={() => setReplaceFor({ id: s.id, index: i })}
                    disabled={busyId === s.id}
                    className="w-full rounded-md glass border border-border px-2 py-1 text-[11px] flex items-center justify-center gap-1 hover:border-primary/40 disabled:opacity-50"
                  >
                    <ImagePlus className="w-3 h-3" /> Use my photo / clip
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <MediaPicker
          open={replaceFor !== null}
          onOpenChange={(o) => { if (!o) setReplaceFor(null); }}
          accept={["image", "video"]}
          title={replaceFor ? `Scene ${replaceFor.index + 1} — use my photo or clip` : "Use my photo or clip"}
          initialQuery={replaceFor ? stockQueryFrom(bundle.script.scenes[replaceFor.index]?.visual ?? "") : ""}
          onPicked={async (item) => {
            const target = replaceFor;
            if (!target) return;
            setBusyId(target.id);
            try { await onReplace(target.id, item); } finally { setBusyId(null); }
          }}
        />
        <p className="text-xs text-muted-foreground mt-3">
          Need to change scripts, timings or prompts? Use “Back to blueprint” — assets will regenerate from your edits.
        </p>
      </div>

      {openIdx != null && viewable.length > 0 && (
        <SceneLightbox
          shot={viewable[openIdx]}
          current={openIdx + 1}
          total={viewable.length}
          hasNext={viewable.length > 1}
          hasPrev={viewable.length > 1}
          onClose={() => setOpenIdx(null)}
          onNext={() => setOpenIdx((p) => (p == null ? null : (p + 1) % viewable.length))}
          onPrev={() => setOpenIdx((p) => (p == null ? null : (p - 1 + viewable.length) % viewable.length))}
        />
      )}
    </div>
  );
}


function JobDashboard({
  dash, error, onCancel, onRetryFailed, onBack, onEditBlueprint,
}: {
  dash: DashState;
  error: string | null;
  onCancel: () => void;
  onRetryFailed: () => void;
  onBack: () => void;
  onEditBlueprint: () => void;
}) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const shotPct = dash.shotsTotal > 0 ? Math.round((dash.shotsDone / dash.shotsTotal) * 100) : 0;
  const renderPct = Math.round(dash.renderProgress * 100);
  const currentPhaseIdx = PHASE_ORDER.indexOf(dash.phase);
  const viewableShots = useMemo(() => dash.shots.filter((s) => s.previewUrl), [dash.shots]);

  const openLightbox = useCallback((shot: ShotProgress) => {
    const idx = viewableShots.findIndex((s) => s.id === shot.id);
    setLightboxIdx(idx >= 0 ? idx : null);
  }, [viewableShots]);
  const closeLightbox = useCallback(() => setLightboxIdx(null), []);
  const nextLightbox = useCallback(() => {
    setLightboxIdx((prev) => {
      if (prev == null) return null;
      return prev < viewableShots.length - 1 ? prev + 1 : 0;
    });
  }, [viewableShots.length]);
  const prevLightbox = useCallback(() => {
    setLightboxIdx((prev) => {
      if (prev == null) return null;
      return prev > 0 ? prev - 1 : viewableShots.length - 1;
    });
  }, [viewableShots.length]);

  return (
    <div className="space-y-4">
      {/* Phase indicator */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-lg">Building your video</h2>
            <p className="text-sm text-muted-foreground">
              Keep this tab open until it finishes — the video is assembled in your browser. If the tab closes, reopen Video Studio and resume it from "In progress".
            </p>
          </div>
          <div className="flex items-center gap-2">
            {dash.phase !== "complete" && dash.phase !== "failed" && (
              <>
                <button
                  onClick={onEditBlueprint}
                  className="rounded-lg glass border border-amber-500/40 text-amber-200 px-3 py-1.5 text-xs flex items-center gap-1.5"
                  title={
                    dash.phase === "generating_shots" || dash.phase === "voiceover" || dash.phase === "rendering"
                      ? "Stop and edit — pauses generation without deleting cached assets"
                      : "Open the blueprint editor"
                  }
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  {dash.phase === "generating_shots" || dash.phase === "voiceover" || dash.phase === "rendering"
                    ? "Stop & edit blueprint"
                    : "Edit blueprint"}
                </button>
                <button
                  onClick={onCancel}
                  className="rounded-lg glass border border-border px-3 py-1.5 text-xs flex items-center gap-1.5"
                  title="Pause — you can resume later from your videos list"
                >
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
              </>
            )}
            <button
              onClick={onBack}
              className="rounded-lg glass border border-border px-3 py-1.5 text-xs"
            >
              Back
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {PHASE_ORDER.slice(0, -1).map((p, i) => {
            const state: "done" | "active" | "pending" =
              i < currentPhaseIdx ? "done" : i === currentPhaseIdx ? "active" : "pending";
            return (
              <div
                key={p}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 border ${
                  state === "done" ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10" :
                  state === "active" ? "gradient-primary text-white border-transparent" :
                  "border-border text-muted-foreground"
                }`}
              >
                {state === "done" && <CheckCircle2 className="w-3.5 h-3.5" />}
                {state === "active" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {state === "pending" && <Circle className="w-3.5 h-3.5" />}
                {PHASE_LABELS[p]}
              </div>
            );
          })}
        </div>
      </div>

      {/* Shots counter + retry */}
      {dash.shotsTotal > 0 && (
        <div className="glass rounded-2xl p-5">
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Scenes generated</div>
              <div className="text-3xl font-bold mt-1">
                {dash.shotsDone} <span className="text-muted-foreground text-xl">/ {dash.shotsTotal}</span>
              </div>
              {dash.shotsFailed > 0 && (
                <div className="text-xs text-rose-400 mt-1">
                  {dash.shotsFailed} failed
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {dash.shotsFailed > 0 && (
                <button
                  onClick={onRetryFailed}
                  className="rounded-lg glass border border-rose-500/40 text-rose-200 px-3 py-1.5 text-xs flex items-center gap-1.5"
                >
                  <RotateCw className="w-3.5 h-3.5" /> Retry failed
                </button>
              )}
              <div className="text-right">
                <div className="text-2xl font-bold">{shotPct}%</div>
              </div>
            </div>
          </div>
          <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full gradient-primary transition-all" style={{ width: `${shotPct}%` }} />
          </div>

          {/* Scene Viewer grid */}
          <div className="mt-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Scene viewer
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5 max-h-[420px] overflow-y-auto pr-1">
              {dash.shots.map((s) => (
                <SceneTile key={s.id} shot={s} onClick={() => openLightbox(s)} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Voiceover progress */}
      {dash.voiceoverTotal > 0 && dash.phase !== "rendering" && dash.phase !== "complete" && (
        <div className="glass rounded-2xl p-4 text-sm flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span>Narration {dash.voiceoverDone} / {dash.voiceoverTotal} scenes</span>
        </div>
      )}

      {/* Render progress — separate */}
      {(dash.phase === "rendering" || dash.renderProgress > 0) && (
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Encoding final MP4</div>
              <div className="text-lg font-semibold mt-1">Rendering video</div>
            </div>
            <div className="text-2xl font-bold">{renderPct}%</div>
          </div>
          <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full transition-all" style={{ width: `${renderPct}%`, background: "linear-gradient(135deg,#22d3ee,#a855f7)" }} />
          </div>
        </div>
      )}

      {error && (
        <div className="glass border border-rose-500/30 rounded-lg p-3 flex items-center justify-between">
          <div className="text-sm text-rose-300">{error}</div>
          <button onClick={onBack} className="rounded-lg glass border border-border px-3 py-1.5 text-xs">
            Start over
          </button>
        </div>
      )}

      {lightboxIdx != null && viewableShots.length > 0 && (
        <SceneLightbox
          shot={viewableShots[lightboxIdx]}
          current={lightboxIdx + 1}
          total={viewableShots.length}
          hasNext={viewableShots.length > 1}
          hasPrev={viewableShots.length > 1}
          onClose={closeLightbox}
          onNext={nextLightbox}
          onPrev={prevLightbox}
        />
      )}
    </div>
  );
}

function SceneTile({ shot, onClick }: { shot: ShotProgress; onClick?: () => void }) {
  const status = shot.status;
  const bg = status === "done" ? "bg-emerald-500/10 border-emerald-500/30" :
             status === "failed" ? "bg-rose-500/10 border-rose-500/40" :
             status === "running" ? "bg-white/5 border-white/20" :
             "bg-white/5 border-border";
  const hasPreview = !!shot.previewUrl;
  return (
    <button
      type="button"
      disabled={!hasPreview}
      onClick={onClick}
      className={`relative aspect-square rounded border overflow-hidden text-left ${bg} ${hasPreview ? "cursor-zoom-in hover:ring-2 hover:ring-[color:var(--neon-cyan)]/50 transition" : "cursor-default"}`}
      title={shot.error ? `Shot ${shot.index + 1}: ${shot.error}` : `Shot ${shot.index + 1}${hasPreview ? " — click to view fullscreen" : ""}`}
    >
      {shot.previewUrl && shot.kind === "image" && (
        <img src={shot.previewUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      {shot.previewUrl && shot.kind === "clip" && (
        <video src={shot.previewUrl} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
      )}
      {!shot.previewUrl && (
        <div className="absolute inset-0 flex items-center justify-center">
          {status === "running" && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          {status === "pending" && <Circle className="w-3 h-3 text-muted-foreground/50" />}
          {status === "failed" && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
        </div>
      )}
      {hasPreview && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/20">
          <Maximize2 className="w-5 h-5 text-white drop-shadow" />
        </div>
      )}
      <div className="absolute bottom-0 right-0 text-[9px] font-mono text-white/70 bg-black/40 px-1 rounded-tl">
        {shot.index + 1}
      </div>
    </button>
  );
}

function SceneLightbox({
  shot, current, total, hasNext, hasPrev, onClose, onNext, onPrev,
}: {
  shot: ShotProgress;
  current: number;
  total: number;
  hasNext: boolean;
  hasPrev: boolean;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isFullscreen && document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          onClose();
        }
      } else if (e.key === "ArrowRight") {
        onNext();
      } else if (e.key === "ArrowLeft") {
        onPrev();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onNext, onPrev, isFullscreen]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement && containerRef.current) {
        await containerRef.current.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // ignore unsupported
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur flex flex-col"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="text-sm text-white/80">
          Scene {current} of {total} · {shot.kind === "clip" ? "Video clip" : "Still image"}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleFullscreen}
            className="rounded-lg bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 text-xs flex items-center gap-1.5"
          >
            <Maximize2 className="w-3.5 h-3.5" /> {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          </button>
          <button aria-label="Close"
            onClick={onClose}
            className="rounded-lg bg-white/10 hover:bg-white/20 text-white p-1.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main stage */}
      <div className="flex-1 flex items-center justify-center px-2 pb-2 relative overflow-hidden">
        {hasPrev && (
          <button aria-label="Previous"
            onClick={(e) => { e.stopPropagation(); onPrev(); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/60 hover:bg-black/80 text-white p-2"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {shot.previewUrl && shot.kind === "image" && (
          <img
            src={shot.previewUrl}
            alt={`Scene ${current}`}
            className="max-w-full max-h-full object-contain rounded shadow-2xl"
          />
        )}
        {shot.previewUrl && shot.kind === "clip" && (
          <video
            src={shot.previewUrl}
            controls
            autoPlay
            playsInline
            className="max-w-full max-h-full object-contain rounded shadow-2xl"
          />
        )}
        {hasNext && (
          <button aria-label="Next"
            onClick={(e) => { e.stopPropagation(); onNext(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/60 hover:bg-black/80 text-white p-2"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------- In-progress jobs (resume) ----------------

function InProgressJobs({
  jobs, onResume, onDiscard,
}: {
  jobs: JobRecord[];
  onResume: (job: JobRecord) => void;
  onDiscard: (id: string) => void;
}) {
  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-primary" />
        <h2 className="font-semibold text-sm">In progress · resume where you left off</h2>
      </div>
      <div className="space-y-2">
        {jobs.map((j) => {
          const pct = j.shotsTotal > 0 ? Math.round((j.shotsDone / j.shotsTotal) * 100) : 0;
          return (
            <div key={j.id} className="glass rounded-lg p-3 border border-border flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{j.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {PHASE_LABELS[j.phase as JobPhaseId] ?? j.phase} · {j.shotsDone} / {j.shotsTotal} shots
                  {j.shotsFailed > 0 && <span className="text-rose-400"> · {j.shotsFailed} failed</span>}
                </div>
                {j.error && <div className="text-[11px] text-amber-300 mt-0.5">{j.error}</div>}
                <div className="w-full h-1 rounded-full bg-white/5 overflow-hidden mt-2">
                  <div className="h-full gradient-primary" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <button
                onClick={() => onResume(j)}
                className="rounded-lg gradient-primary text-white px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" /> Resume
              </button>
              <button
                onClick={() => onDiscard(j.id)}
                className="rounded-lg glass border border-border px-2 py-1.5 text-xs"
                title="Discard job"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}



// ---------------- Result ----------------

/**
 * Safe MP4/WebM preview player.
 * - Owns a single object URL derived from the incoming Blob.
 * - Revokes the URL only on unmount / blob change (never while mounted).
 * - Runs metadata validation before allowing playback and surfaces errors
 *   instead of silently showing an empty player.
 * - Renders a dev-mode diagnostics panel with blob size, MIME, duration, etc.
 */
function SafeVideoPreview({
  blob, requestedDurationSec, aspectClass, filename, onRegenerate,
}: {
  blob: Blob | null | undefined;
  requestedDurationSec: number;
  aspectClass: string;
  filename: string;
  onRegenerate: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [validation, setValidation] = useState<VideoValidation | null>(null);
  const [validating, setValidating] = useState<boolean>(true);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // Create the object URL once per blob and revoke on unmount / blob swap.
  useEffect(() => {
    if (!blob) { setObjectUrl(null); return; }
    const url = URL.createObjectURL(blob);
    setObjectUrl(url);
    return () => { URL.revokeObjectURL(url); };
  }, [blob]);

  // Validate the blob (size, MIME, metadata) before we trust the player.
  useEffect(() => {
    let cancelled = false;
    setValidating(true);
    setValidation(null);
    setPlaybackError(null);
    if (!blob) { setValidating(false); return; }
    void validateRenderedVideo(blob, requestedDurationSec).then((v) => {
      if (cancelled) return;
      setValidation(v);
      setValidating(false);
    });
    return () => { cancelled = true; };
  }, [blob, requestedDurationSec]);

  function handleDownload() {
    if (!blob || blob.size === 0) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const showPlayer = !!objectUrl && !!validation?.ok;
  const showError = !validating && (!validation?.ok || !!playbackError);
  const errorMsg = playbackError
    ?? validation?.reason
    ?? (validating ? null : "Video unavailable");

  return (
    <div>
      <div className={`bg-black ${aspectClass} max-h-[70vh] mx-auto relative`}>
        {showPlayer && objectUrl && (
          <video
            ref={videoRef}
            src={objectUrl}
            controls
            autoPlay
            playsInline
            preload="metadata"
            className="w-full h-full object-contain"
            // Note: never call load() from onLoadedMetadata — it re-fires
            // loadedmetadata, so the player restarts forever and sits on a
            // grey frame at 0:00.
            onError={() => {
              setPlaybackError("Rendered video exists but the browser could not play it. Please download the MP4 or regenerate render.");
            }}
          />
        )}
        {validating && (
          <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Validating rendered video…
          </div>
        )}
        {showError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-400" />
            <div className="text-white text-sm max-w-md">{errorMsg}</div>
            <div className="flex gap-2">
              {blob && blob.size > 0 && (
                <button onClick={handleDownload} className="rounded-lg gradient-primary text-white px-3 py-1.5 text-xs flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Download MP4
                </button>
              )}
              <button onClick={onRegenerate} className="rounded-lg glass border border-border px-3 py-1.5 text-xs flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> Regenerate render
              </button>
            </div>
          </div>
        )}
      </div>
      {import.meta.env.DEV && (
        <div className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border/50 font-mono space-y-0.5">
          <div>Blob size: {blob ? `${(blob.size / 1024 / 1024).toFixed(2)} MB (${blob.size} bytes)` : "—"}</div>
          <div>MIME type: {blob?.type || "—"}</div>
          <div>Requested duration: {Math.round(requestedDurationSec)}s</div>
          <div>Detected duration: {validation?.detectedDuration != null ? `${validation.detectedDuration.toFixed(2)}s` : "—"}</div>
          <div>Object URL created: {objectUrl ? "yes" : "no"}</div>
          <div>Playback error: {playbackError ?? (validation?.ok ? "none" : validation?.reason ?? "—")}</div>
        </div>
      )}
    </div>
  );
}


function ResultScreen({
  result, onAnother, onNew, onSaveThumbnail,
}: {
  result: PipelineResult;
  onAnother: () => void;
  onNew: () => void;
  onSaveThumbnail: (v: { url: string; concept: string; headline: string; alt: string }) => void;
}) {
  const { render, thumbnail, subtitles, seo, brief } = result;

  function download(url: string, filename: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function downloadText(text: string, filename: string, mime = "text/plain") {
    const blob = new Blob([text], { type: mime });
    download(URL.createObjectURL(blob), filename);
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  }

  const isVertical = brief.aspectRatio === "9:16";
  const aspectClass = isVertical ? "aspect-[9/16]" : brief.aspectRatio === "1:1" ? "aspect-square" : "aspect-video";

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="glass rounded-2xl overflow-hidden">
          <SafeVideoPreview
            blob={render.blob}
            requestedDurationSec={brief.duration}
            aspectClass={aspectClass}
            filename={`${slug(seo.youtube_title)}.${render.extension}`}
            onRegenerate={onAnother}
          />
          <div className="p-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => download(URL.createObjectURL(render.blob), `${slug(seo.youtube_title)}.${render.extension}`)}
              disabled={!render.blob || render.blob.size === 0}
              className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> Download video
            </button>
            <button onClick={() => download(thumbnail.url, `${slug(seo.youtube_title)}-thumbnail.png`)} className="rounded-lg glass border border-border px-4 py-2 text-sm flex items-center gap-2">
              <Download className="w-4 h-4" /> Thumbnail
            </button>
            <button onClick={() => downloadText(subtitles.content, `${slug(seo.youtube_title)}.vtt`, "text/vtt")} className="rounded-lg glass border border-border px-4 py-2 text-sm flex items-center gap-2">
              <Download className="w-4 h-4" /> Subtitles
            </button>
            <div className="flex-1" />

            <button onClick={onAnother} className="rounded-lg glass border border-border px-4 py-2 text-sm flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Another version
            </button>
            <button onClick={onNew} className="rounded-lg glass border border-border px-4 py-2 text-sm flex items-center gap-2">
              <Play className="w-4 h-4" /> New video
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Thumbnails · pick your winner
              </div>
              <span className="text-[10px] text-muted-foreground">MrBeast-style · high CTR</span>
            </div>
            <div className="space-y-3">
              {(thumbnail.variants && thumbnail.variants.length > 0
                ? thumbnail.variants
                : [{ url: thumbnail.url, alt: thumbnail.alt, concept: "Hero", headline: seo.youtube_title, generated: thumbnail.generated }]
              ).map((v, i) => (
                <div key={i} className="space-y-2">
                  <img src={v.url} alt={v.alt} className="w-full rounded-lg bg-black" />
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] text-muted-foreground truncate">{v.concept}</div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => download(v.url, `${slug(seo.youtube_title)}-thumb-${i + 1}.png`)}
                        className="rounded-md glass border border-border px-2 py-1 text-[11px] flex items-center gap-1"
                        title="Download"
                      >
                        <Download className="w-3 h-3" /> Save file
                      </button>
                      <button
                        onClick={() => onSaveThumbnail({ url: v.url, concept: v.concept, headline: v.headline, alt: v.alt })}
                        className="rounded-md gradient-primary text-white px-2 py-1 text-[11px] flex items-center gap-1"
                        title="Save to your library"
                      >
                        <Check className="w-3 h-3" /> Save
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => toast.info("YouTube publishing will connect soon")} className="w-full rounded-2xl glass border border-border p-4 text-sm flex items-center justify-center gap-2 hover:border-primary/40 transition">
            <Youtube className="w-5 h-5 text-rose-500" />
            <span>Publish to YouTube</span>
            <Send className="w-4 h-4 opacity-60" />
          </button>
        </div>
      </div>

      <div className="glass rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold">SEO & metadata</h3>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">YouTube title</div>
            <CopyBtn onClick={() => copy(seo.youtube_title, "Title")} />
          </div>
          <div className="glass rounded-lg p-3 text-sm">{seo.youtube_title}</div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">YouTube description</div>
            <CopyBtn onClick={() => copy(seo.youtube_description, "Description")} />
          </div>
          <div className="glass rounded-lg p-3 text-sm whitespace-pre-wrap">{seo.youtube_description}</div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Hashtags</div>
            <CopyBtn onClick={() => copy(seo.hashtags.join(" "), "Hashtags")} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {seo.hashtags.map((h) => (
              <span key={h} className="glass px-2 py-1 rounded text-xs">{h}</span>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Tags</div>
            <CopyBtn onClick={() => copy(seo.tags.join(", "), "Tags")} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {seo.tags.map((t) => (
              <span key={t} className="glass px-2 py-1 rounded text-xs">{t}</span>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Pinned comment</div>
            <CopyBtn onClick={() => copy(seo.pinned_comment, "Pinned comment")} />
          </div>
          <div className="glass rounded-lg p-3 text-sm whitespace-pre-wrap">{seo.pinned_comment}</div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Chapters</div>
            <CopyBtn onClick={() => copy(seo.chapters.map((c) => `${c.time} ${c.label}`).join("\n"), "Chapters")} />
          </div>
          <div className="glass rounded-lg p-3 text-sm space-y-1 font-mono">
            {seo.chapters.map((c) => (
              <div key={`${c.time}-${c.label}`} className="flex gap-3">
                <span className="text-muted-foreground w-14 shrink-0">{c.time}</span>
                <span>{c.label}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

function CopyBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-xs text-muted-foreground hover:text-white flex items-center gap-1">
      <Copy className="w-3 h-3" /> Copy
    </button>
  );
}

function slug(s: string): string {
  return (s || "video").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "video";
}

function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch { return ""; }
}

// ---------------- Local library ----------------

function LibrarySection({
  items, onOpen, onDelete,
}: { items: LocalVideo[]; onOpen: (rec: LocalVideo) => void; onDelete: (id: string) => void }) {
  return (
    <div className="glass rounded-2xl p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">Your videos</h2>
        <span className="text-xs text-muted-foreground">
          Stored locally in your browser · {items.length} saved
        </span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((rec) => (
          <LibraryCard key={rec.id} rec={rec} onOpen={() => onOpen(rec)} onDelete={() => onDelete(rec.id)} />
        ))}
      </div>
    </div>
  );
}

function LibraryCard({
  rec, onOpen, onDelete,
}: { rec: LocalVideo; onOpen: () => void; onDelete: () => void }) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    void loadThumbnailObjectURL(rec).then((u) => {
      if (cancelled) { if (u) URL.revokeObjectURL(u); return; }
      url = u; setThumb(u);
    });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [rec]);
  const ratioClass =
    rec.aspectRatio === "9:16" ? "aspect-[9/16]"
    : rec.aspectRatio === "1:1" ? "aspect-square"
    : "aspect-video";
  return (
    <div className="glass rounded-xl overflow-hidden border border-border flex flex-col">
      <button onClick={onOpen} className={`${ratioClass} bg-black block relative overflow-hidden group`}>
        {thumb ? (
          <img src={thumb} alt={rec.youtube_title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">No preview</div>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/40">
          <Play className="w-10 h-10 text-white" />
        </div>
      </button>
      <div className="p-3 space-y-2 flex-1 flex flex-col">
        <div className="text-sm font-medium line-clamp-2 leading-snug">{rec.youtube_title || rec.title}</div>
        <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
          <span className="glass px-2 py-0.5 rounded">{rec.aspectRatio}</span>
          <span className="glass px-2 py-0.5 rounded flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDuration(rec.duration_sec)}</span>
          <span className="glass px-2 py-0.5 rounded">{rec.styleLabel}</span>
        </div>
        <div className="text-[11px] text-muted-foreground">{fmtDate(rec.created_at)} · {rec.niche ?? ""}</div>
        <div className="flex gap-2 pt-1 mt-auto">
          <button onClick={onOpen} className="flex-1 rounded-lg gradient-primary text-white text-xs py-1.5 flex items-center justify-center gap-1">
            <Play className="w-3 h-3" /> Open
          </button>
          <button
            onClick={async () => {
              const url = await loadVideoObjectURL(rec);
              if (!url) return toast.error("File missing");
              const a = document.createElement("a");
              a.href = url; a.download = `${slug(rec.youtube_title || rec.title)}.${rec.extension}`;
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
              setTimeout(() => URL.revokeObjectURL(url), 5000);
            }}
            className="rounded-lg glass border border-border px-2 py-1.5 text-xs flex items-center gap-1"
            title="Download"
          >
            <Download className="w-3 h-3" />
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg glass border border-border px-2 py-1.5 text-xs text-red-400 flex items-center gap-1"
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function LibraryViewer({
  entry, onBack, onDelete,
}: { entry: LibraryOpen; onBack: () => void; onDelete: () => void }) {
  const { meta, videoUrl, thumbnailUrl } = entry;
  const isVertical = meta.aspectRatio === "9:16";
  function download(url: string, filename: string) {
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
  function downloadText(text: string, filename: string, mime = "text/plain") {
    const blob = new Blob([text], { type: mime });
    download(URL.createObjectURL(blob), filename);
  }
  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copied`); }
    catch { toast.error("Copy failed"); }
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-white flex items-center gap-1">
          ← Back to studio
        </button>
        <button onClick={onDelete} className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1">
          <Trash2 className="w-4 h-4" /> Delete
        </button>
      </div>
      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="glass rounded-2xl overflow-hidden">
          <div className={`bg-black ${isVertical ? "aspect-[9/16]" : meta.aspectRatio === "1:1" ? "aspect-square" : "aspect-video"} max-h-[70vh] mx-auto`}>
            <video src={videoUrl} controls autoPlay playsInline className="w-full h-full object-contain" />
          </div>
          <div className="p-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => download(videoUrl, `${slug(meta.youtube_title || meta.title)}.${meta.extension}`)}
              className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> Download video
            </button>
            {thumbnailUrl && (
              <button
                onClick={() => download(thumbnailUrl, `${slug(meta.youtube_title || meta.title)}-thumbnail.png`)}
                className="rounded-lg glass border border-border px-4 py-2 text-sm flex items-center gap-2"
              >
                <Download className="w-4 h-4" /> Thumbnail
              </button>
            )}
            <button
              onClick={() => downloadText(meta.subtitles_vtt, `${slug(meta.youtube_title || meta.title)}.vtt`, "text/vtt")}
              className="rounded-lg glass border border-border px-4 py-2 text-sm flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> Subtitles
            </button>
          </div>
        </div>
        <div className="space-y-4">
          {thumbnailUrl && (
            <div className="glass rounded-2xl p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Thumbnail</div>
              <img src={thumbnailUrl} alt={meta.youtube_title} className="w-full rounded-lg bg-black" />
            </div>
          )}
        </div>
      </div>
      <div className="glass rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold">SEO &amp; metadata</h3>
        <MetaBlock label="YouTube title" value={meta.youtube_title} onCopy={() => copy(meta.youtube_title, "Title")} />
        <MetaBlock label="YouTube description" value={meta.youtube_description} onCopy={() => copy(meta.youtube_description, "Description")} pre />
        <MetaChips label="Hashtags" items={meta.hashtags} onCopy={() => copy(meta.hashtags.join(" "), "Hashtags")} />
        <MetaChips label="Tags" items={meta.tags} onCopy={() => copy(meta.tags.join(", "), "Tags")} />
        <MetaBlock label="Pinned comment" value={meta.pinned_comment} onCopy={() => copy(meta.pinned_comment, "Pinned comment")} pre />
      </div>
    </div>
  );
}

function MetaBlock({ label, value, onCopy, pre }: { label: string; value: string; onCopy: () => void; pre?: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <CopyBtn onClick={onCopy} />
      </div>
      <div className={`glass rounded-lg p-3 text-sm ${pre ? "whitespace-pre-wrap" : ""}`}>{value}</div>
    </div>
  );
}

function MetaChips({ label, items, onCopy }: { label: string; items: string[]; onCopy: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <CopyBtn onClick={onCopy} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((h) => <span key={h} className="glass px-2 py-1 rounded text-xs">{h}</span>)}
      </div>
    </div>
  );
}

// ---------------- Saved thumbnails library ----------------

function ThumbnailLibrarySection({
  items, onDelete,
}: { items: LocalThumbnail[]; onDelete: (id: string) => void }) {
  return (
    <div className="glass rounded-2xl p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">Saved thumbnails</h2>
        <span className="text-xs text-muted-foreground">
          Stored locally in your browser · {items.length} saved
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {items.map((rec) => (
          <ThumbnailCard key={rec.id} rec={rec} onDelete={() => onDelete(rec.id)} />
        ))}
      </div>
    </div>
  );
}

function ThumbnailCard({ rec, onDelete }: { rec: LocalThumbnail; onDelete: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let obj: string | null = null;
    void loadThumbnailImageURL(rec).then((u) => {
      if (!live) { if (u) URL.revokeObjectURL(u); return; }
      obj = u; setUrl(u);
    });
    return () => { live = false; if (obj) URL.revokeObjectURL(obj); };
  }, [rec]);
  async function doDownload() {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(rec.headline || rec.title)}-thumbnail.${rec.extension}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
  return (
    <div className="glass rounded-xl overflow-hidden border border-border flex flex-col">
      <div className="aspect-video bg-black">
        {url ? (
          <img src={url} alt={rec.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">Loading…</div>
        )}
      </div>
      <div className="p-3 space-y-2 flex-1 flex flex-col">
        <div className="text-sm font-medium line-clamp-2 leading-snug">{rec.title}</div>
        <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
          <span className="glass px-2 py-0.5 rounded">{rec.concept}</span>
          <span className="glass px-2 py-0.5 rounded">{rec.styleLabel}</span>
        </div>
        <div className="text-[11px] text-muted-foreground">{fmtDate(rec.created_at)} · {rec.niche ?? ""}</div>
        <div className="flex gap-2 pt-1 mt-auto">
          <button
            onClick={doDownload}
            className="flex-1 rounded-lg gradient-primary text-white text-xs py-1.5 flex items-center justify-center gap-1"
          >
            <Download className="w-3 h-3" /> Download
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg glass border border-border px-2 py-1.5 text-xs text-red-400 flex items-center gap-1"
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
