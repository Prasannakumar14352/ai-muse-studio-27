import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Loader2, CheckCircle2, Circle, AlertCircle, Download, Copy,
  Wand2, Youtube, Play, RefreshCw, Send, Check, Trash2, Clock, Plus, Video,
  X, RotateCw,
} from "lucide-react";
import {
  runVideoJobPipeline, retryFailedShots,
  PIPELINE_STEPS,
  VIDEO_TYPES, DURATIONS, VOICES, ASPECT_RATIOS,
  type VideoBrief, type VideoType, type DurationSec, type StyleId, type VoiceId, type AspectRatio,
  type StepStatus, type PipelineResult, type JobEvent, type JobPhaseId, type ShotProgress,
} from "@/lib/video-agents";
import {
  listJobs, deleteJob as deleteJobRec, loadShotObjectURL,
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

export const Route = createFileRoute("/_authenticated/videos")({
  head: () => ({
    meta: [
      { title: "Videos — CreatorVaultAI" },
      { name: "description", content: "Generate a ready-to-post video from a single idea. Script, visuals, voice, music, subtitles, thumbnail and SEO in one flow." },
      { property: "og:title", content: "Videos — CreatorVaultAI" },
      { property: "og:description", content: "Generate a ready-to-post video from a single idea." },
    ],
  }),
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
  { id: "ghibli", label: "Ghibli-inspired", image: styleGhibli },
  { id: "anime", label: "Anime", image: styleAnime },
  { id: "realistic", label: "Realistic", image: styleRealistic },
  { id: "pixar", label: "Pixar-like", image: stylePixar },
  { id: "cinematic", label: "Cinematic", image: styleCinematic },
  { id: "documentary", label: "Documentary", image: styleDocumentary },
  { id: "dark_mystery", label: "Dark Mystery", image: styleDark },
  { id: "luxury", label: "Luxury", image: styleAncient },
  { id: "cyberpunk", label: "Cyberpunk", image: styleCyberpunk },
  { id: "minimal_product", label: "Minimal Product", image: styleMinimal },
  { id: "futuristic", label: "Futuristic", image: style3d },
];

type View = "landing" | "input" | "processing" | "result" | "library";
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
  const [gen, setGen] = useState<GenerateArgs | null>(null);
  const [dash, setDash] = useState<DashState>(initialDash);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState<LocalVideo[]>([]);
  const [libraryOpen, setLibraryOpen] = useState<LibraryOpen | null>(null);
  const [thumbLibrary, setThumbLibrary] = useState<LocalThumbnail[]>([]);
  const [inProgress, setInProgress] = useState<JobRecord[]>([]);
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
    void refreshInProgress();
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

  async function start(args: GenerateArgs, resumeJobId?: string) {
    setGen(args);
    setError(null);
    setResult(null);
    setLibraryOpen(null);
    setDash({ ...initialDash, jobId: resumeJobId ?? null });
    setView("processing");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { job, result: r } = await runVideoJobPipeline(args.brief, {
        jobId: resumeJobId,
        niche: args.niche,
        topic: args.topic,
        onEvent: handleJobEvent,
        signal: controller.signal,
      });
      setDash((prev) => ({ ...prev, jobId: job.id }));
      setResult(r);
      setView("result");
      await refreshInProgress();

      // Persist to browser-local library — no backend, no upload.
      try {
        const videoBlob = await (await fetch(r.render.video_url)).blob();
        const niche = args.niche;
        const nicheLabel = NICHES.find((n) => n.id === niche)?.label ?? niche;
        const styleLabel = STYLE_CARDS.find((s) => s.id === args.brief.style)?.label ?? args.brief.style;
        await saveGeneratedVideo({
          title: args.brief.title,
          niche: nicheLabel,
          topic: args.topic || args.brief.title,
          styleId: args.brief.style,
          styleLabel,
          videoType: args.brief.videoType,
          aspectRatio: args.brief.aspectRatio,
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
        toast.info("Generation paused. You can resume from your videos list.");
        setView("landing");
        await refreshInProgress();
        return;
      }
      const msg = e instanceof Error ? e.message : "Pipeline failed";
      setError(msg);
      toast.error(msg);
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  async function resumeJob(job: JobRecord) {
    const brief = JSON.parse(job.briefJson) as VideoBrief;
    await start({ brief, niche: job.niche, topic: job.topic }, job.id);
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
                One idea in, a ready-to-post video out — script, visuals, voice, music, subtitles, thumbnail, SEO.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl md:text-4xl font-bold">
                Your <span className="gradient-text">Videos</span>
              </h1>
              <p className="text-muted-foreground mt-1">
                AI-generated shorts and long-form videos with thumbnails, subtitles, and SEO.
              </p>
            </>
          )}
        </div>
        {showHeaderNewBtn && (
          <button
            onClick={() => setView("input")}
            className="rounded-lg gradient-primary text-white px-4 py-2.5 text-sm font-semibold flex items-center gap-2 shrink-0"
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
          {library.length > 0 ? (
            <LibrarySection items={library} onOpen={openFromLibrary} onDelete={removeFromLibrary} />
          ) : inProgress.length === 0 ? (
            <EmptyLibrary onNew={() => setView("input")} />
          ) : null}
          {thumbLibrary.length > 0 && (
            <ThumbnailLibrarySection items={thumbLibrary} onDelete={removeThumb} />
          )}
        </>
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
          <InputScreen onGenerate={start} />
        </>
      )}
      {view === "processing" && (
        <JobDashboard
          dash={dash}
          error={error}
          onCancel={cancel}
          onRetryFailed={retryFailed}
          onBack={() => setView("landing")}
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

function InputScreen({ onGenerate }: { onGenerate: (args: GenerateArgs) => void }) {
  const [niche, setNiche] = useState<string>(NICHES[0].id);
  const [customNiche, setCustomNiche] = useState("");
  const [title, setTitle] = useState("");
  const [videoType, setVideoType] = useState<VideoType>("shorts");
  const [duration, setDuration] = useState<DurationSec>(60);
  const [style, setStyle] = useState<StyleId>("cinematic");
  const [voice, setVoice] = useState<VoiceId>("documentary_narrator");
  const [ratio, setRatio] = useState<AspectRatio>("9:16");

  const isCustom = niche === "custom";
  const currentNiche = useMemo(() => NICHES.find((n) => n.id === niche) ?? NICHES[0], [niche]);
  const suggestedRatio = useMemo<AspectRatio>(
    () => (videoType === "youtube_long" ? "16:9" : "9:16"),
    [videoType]
  );

  function submit() {
    if (!title.trim()) return toast.error("Enter a video title or idea");
    if (isCustom && !customNiche.trim()) return toast.error("Describe your custom niche or topic area");
    onGenerate({
      brief: { title: title.trim(), videoType, duration, style, voice, aspectRatio: ratio },
      niche: isCustom ? customNiche.trim() : niche,
      topic: title.trim(),
    });
  }

  return (
    <div className="glass rounded-2xl p-6 space-y-8">
      {/* 1. Niche */}
      <Section index={1} title="Pick a niche / category">
        <div className="flex flex-wrap gap-2">
          {NICHES.map((n) => (
            <button
              key={n.id}
              onClick={() => setNiche(n.id)}
              className={`px-3.5 py-2 rounded-full text-sm border transition ${
                niche === n.id
                  ? "gradient-primary text-white border-transparent"
                  : "glass border-border hover:border-white/20"
              }`}
            >
              <span className="mr-1.5">{n.emoji}</span>{n.label}
            </button>
          ))}
        </div>
      </Section>

      {/* 2. Suggested topics */}
      <Section index={2} title="Suggested topics">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {currentNiche.topics.map((t) => (
            <button
              key={t}
              onClick={() => setTitle(t)}
              className={`text-left glass rounded-xl p-3 border transition hover:border-white/20 hover:scale-[1.02] ${
                title === t ? "border-[color:var(--neon-pink)]" : "border-border"
              }`}
            >
              <div className="text-sm leading-snug">{t}</div>
            </button>
          ))}
        </div>
      </Section>

      {/* 3. Title */}
      <Section index={3} title="Video title / idea">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. The Day Money Became Meaningless"
          className="w-full glass rounded-lg px-4 py-3 outline-none focus:border-white/30 border border-border text-base"
        />
      </Section>

      {/* 4. Video type */}
      <Section index={4} title="Video type">
        <ChipRow
          options={VIDEO_TYPES}
          value={videoType}
          onChange={(v) => { setVideoType(v); setRatio(v === "youtube_long" ? "16:9" : "9:16"); }}
        />
      </Section>

      {/* 5. Duration */}
      <Section index={5} title="Duration">
        <ChipRow options={DURATIONS} value={duration} onChange={setDuration} />
      </Section>

      {/* 6. Visual style — card grid */}
      <Section index={6} title="Visual style">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {STYLE_CARDS.map((s) => {
            const selected = style === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setStyle(s.id)}
                className={`group relative aspect-[4/5] rounded-xl overflow-hidden border transition transform hover:scale-[1.03] ${
                  selected
                    ? "border-transparent ring-2 ring-offset-2 ring-offset-background"
                    : "border-border hover:border-white/20"
                }`}
                style={selected ? { boxShadow: "0 0 0 2px transparent", backgroundImage: "linear-gradient(hsl(var(--background)), hsl(var(--background))), linear-gradient(135deg, #f97316, #ec4899)", backgroundOrigin: "border-box", backgroundClip: "padding-box, border-box" } : undefined}
              >
                <img src={s.image} alt={s.label} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                {selected && (
                  <div className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ background: "linear-gradient(135deg,#f97316,#ec4899)" }}>
                    <Check className="w-4 h-4" />
                  </div>
                )}
                <div className="absolute bottom-2 left-3 right-3 text-white text-sm font-semibold drop-shadow-md">
                  {s.label}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {/* 7. Voice */}
      <Section index={7} title="Voice">
        <ChipRow options={VOICES} value={voice} onChange={setVoice} />
      </Section>

      {/* 8. Aspect ratio */}
      <Section index={8} title={`Aspect ratio${ratio !== suggestedRatio ? ` (suggested: ${suggestedRatio})` : ""}`}>
        <ChipRow options={ASPECT_RATIOS.map((r) => ({ id: r, label: r }))} value={ratio} onChange={setRatio} />
      </Section>

      {/* 9. Generate */}
      <div className="flex items-center justify-end pt-2">
        <button
          onClick={submit}
          className="rounded-lg gradient-primary text-white px-6 py-3 text-sm font-semibold flex items-center gap-2"
        >
          <Wand2 className="w-4 h-4" /> Generate video
        </button>
      </div>
    </div>
  );
}

function Section({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center gradient-primary text-white">{index}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </div>
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
              : "glass border-border hover:border-white/20"
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
  generating_shots: "Generating shots",
  voiceover: "Narrating & subtitling",
  rendering: "Rendering final video",
  complete: "Complete",
  failed: "Failed",
};

const PHASE_ORDER: JobPhaseId[] = ["planning", "generating_shots", "voiceover", "rendering", "complete"];

function JobDashboard({
  dash, error, onCancel, onRetryFailed, onBack,
}: {
  dash: DashState;
  error: string | null;
  onCancel: () => void;
  onRetryFailed: () => void;
  onBack: () => void;
}) {
  const shotPct = dash.shotsTotal > 0 ? Math.round((dash.shotsDone / dash.shotsTotal) * 100) : 0;
  const renderPct = Math.round(dash.renderProgress * 100);
  const currentPhaseIdx = PHASE_ORDER.indexOf(dash.phase);

  return (
    <div className="space-y-4">
      {/* Phase indicator */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-lg">Building your video</h2>
            <p className="text-sm text-muted-foreground">
              Runs in the background — you can leave this page and come back.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {dash.phase !== "complete" && dash.phase !== "failed" && (
              <button
                onClick={onCancel}
                className="rounded-lg glass border border-border px-3 py-1.5 text-xs flex items-center gap-1.5"
                title="Pause — you can resume later from your videos list"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
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
                <SceneTile key={s.id} shot={s} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Voiceover progress */}
      {dash.voiceoverTotal > 0 && dash.phase !== "rendering" && dash.phase !== "complete" && (
        <div className="glass rounded-2xl p-4 text-sm flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-[color:var(--neon-purple)]" />
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
    </div>
  );
}

function SceneTile({ shot }: { shot: ShotProgress }) {
  const status = shot.status;
  const bg = status === "done" ? "bg-emerald-500/10 border-emerald-500/30" :
             status === "failed" ? "bg-rose-500/10 border-rose-500/40" :
             status === "running" ? "bg-white/5 border-white/20" :
             "bg-white/5 border-border";
  return (
    <div
      className={`relative aspect-square rounded border overflow-hidden ${bg}`}
      title={shot.error ? `Shot ${shot.index + 1}: ${shot.error}` : `Shot ${shot.index + 1}`}
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
      <div className="absolute bottom-0 right-0 text-[9px] font-mono text-white/70 bg-black/40 px-1 rounded-tl">
        {shot.index + 1}
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
        <Clock className="w-4 h-4 text-[color:var(--neon-purple)]" />
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

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="glass rounded-2xl overflow-hidden">
          <div className={`bg-black ${isVertical ? "aspect-[9/16]" : brief.aspectRatio === "1:1" ? "aspect-square" : "aspect-video"} max-h-[70vh] mx-auto`}>
            <video src={render.video_url} controls autoPlay playsInline className="w-full h-full object-contain" />
          </div>
          <div className="p-4 flex flex-wrap items-center gap-2">
            <button onClick={() => download(render.video_url, `${slug(seo.youtube_title)}.${render.extension}`)} className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium flex items-center gap-2">
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
          <button onClick={() => toast.info("YouTube publishing will connect soon")} className="w-full rounded-2xl glass border border-border p-4 text-sm flex items-center justify-center gap-2 hover:border-white/20 transition">
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
