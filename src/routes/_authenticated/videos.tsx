import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2, CheckCircle2, Circle, AlertCircle, Download, Copy,
  Wand2, Youtube, Play, RefreshCw, Send, Check,
} from "lucide-react";
import {
  runVideoPipeline,
  PIPELINE_STEPS,
  VIDEO_TYPES, DURATIONS, VOICES, ASPECT_RATIOS,
  type VideoBrief, type VideoType, type DurationSec, type StyleId, type VoiceId, type AspectRatio,
  type StepStatus, type PipelineResult,
} from "@/lib/video-agents";
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

type View = "input" | "processing" | "result";

function VideosPage() {
  const [view, setView] = useState<View>("input");
  const [brief, setBrief] = useState<VideoBrief | null>(null);
  const [steps, setSteps] = useState<StepStatus[]>(
    PIPELINE_STEPS.map((s) => ({ id: s.id, label: s.label, state: "pending" }))
  );
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(b: VideoBrief) {
    setBrief(b);
    setError(null);
    setResult(null);
    setSteps(PIPELINE_STEPS.map((s) => ({ id: s.id, label: s.label, state: "pending" })));
    setView("processing");
    try {
      const r = await runVideoPipeline(b, (id, state, note) => {
        setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, state, note } : s)));
      });
      setResult(r);
      setView("result");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Pipeline failed";
      setError(msg);
      toast.error(msg);
    }
  }

  function reset() {
    setView("input");
    setResult(null);
    setError(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold">AI <span className="gradient-text">Video Studio</span></h1>
        <p className="text-muted-foreground mt-1">
          One idea in, a ready-to-post video out — script, visuals, voice, music, subtitles, thumbnail, SEO.
        </p>
      </div>

      {view === "input" && <InputScreen onGenerate={start} />}
      {view === "processing" && <ProcessingScreen steps={steps} error={error} onCancel={reset} />}
      {view === "result" && result && <ResultScreen result={result} onAnother={() => brief && start(brief)} onNew={reset} />}
    </div>
  );
}

// ---------------- Input ----------------

function InputScreen({ onGenerate }: { onGenerate: (b: VideoBrief) => void }) {
  const [niche, setNiche] = useState<string>(NICHES[0].id);
  const [title, setTitle] = useState("");
  const [videoType, setVideoType] = useState<VideoType>("shorts");
  const [duration, setDuration] = useState<DurationSec>(60);
  const [style, setStyle] = useState<StyleId>("cinematic");
  const [voice, setVoice] = useState<VoiceId>("documentary_narrator");
  const [ratio, setRatio] = useState<AspectRatio>("9:16");

  const currentNiche = useMemo(() => NICHES.find((n) => n.id === niche) ?? NICHES[0], [niche]);
  const suggestedRatio = useMemo<AspectRatio>(
    () => (videoType === "youtube_long" ? "16:9" : "9:16"),
    [videoType]
  );

  function submit() {
    if (!title.trim()) return toast.error("Enter a video title or idea");
    onGenerate({ title: title.trim(), videoType, duration, style, voice, aspectRatio: ratio });
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

// ---------------- Processing ----------------

function ProcessingScreen({
  steps, error, onCancel,
}: { steps: StepStatus[]; error: string | null; onCancel: () => void }) {
  const doneCount = steps.filter((s) => s.state === "done").length;
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-lg">Building your video</h2>
          <p className="text-sm text-muted-foreground">Each agent hands structured JSON to the next step.</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{pct}%</div>
          <div className="text-xs text-muted-foreground">{doneCount} / {steps.length} steps</div>
        </div>
      </div>

      <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden mb-6">
        <div className="h-full gradient-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      <ol className="space-y-2">
        {steps.map((s) => (
          <li key={s.id} className="flex items-center gap-3 text-sm">
            {s.state === "done" && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            {s.state === "running" && <Loader2 className="w-5 h-5 animate-spin text-[color:var(--neon-purple)] shrink-0" />}
            {s.state === "pending" && <Circle className="w-5 h-5 text-muted-foreground/50 shrink-0" />}
            {s.state === "error" && <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />}
            <span className={s.state === "pending" ? "text-muted-foreground" : ""}>{s.label}</span>
            {s.note && (
              <span className={`text-xs ${s.state === "error" ? "text-rose-400" : "text-muted-foreground"}`}>— {s.note}</span>
            )}
          </li>
        ))}
      </ol>

      {error && (
        <div className="mt-6 flex items-center justify-between glass border border-rose-500/30 rounded-lg p-3">
          <div className="text-sm text-rose-300">{error}</div>
          <button onClick={onCancel} className="rounded-lg glass border border-border px-3 py-1.5 text-xs">
            Start over
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------- Result ----------------

function ResultScreen({
  result, onAnother, onNew,
}: { result: PipelineResult; onAnother: () => void; onNew: () => void }) {
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
          <div className="glass rounded-2xl p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Thumbnail</div>
            <img src={thumbnail.url} alt={thumbnail.alt} className="w-full rounded-lg bg-black" />
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
