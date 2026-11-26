// Promo Studio → Video: make a YouTube Short (9:16) or regular YouTube video (16:9) that
// promotes CreatorFlow. AI writes the script, AI voice reads it (Promo Studio budget, never
// user credits), real app screenshots play in device frames, and the browser renders the MP4.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, Download, Film, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  generatePromoVideoScript,
  getPromoStudio,
  promoVideoVoice,
  type PromoVideoPlan,
} from "@/lib/promo-studio.functions";
import {
  PROMO_VIDEO_LENGTHS,
  type PromoLanguage,
  type PromoVideoFormat,
  type PromoVideoTemplate,
} from "@/lib/promo-studio/constants";
import { VOICE_CATALOG } from "@/lib/voice-catalog";
import { EndFrame, SceneFrame } from "./VideoFrame";
import { promoFontCss } from "./fonts";
import { toBlobUrl } from "./render";
import type { Brand } from "./templates/parts";

const TEMPLATES: { id: PromoVideoTemplate; name: string; hint: string }[] = [
  { id: "product_tour", name: "Product tour", hint: "Quick walk through the app" },
  { id: "feature_spotlight", name: "Feature spotlight", hint: "One feature in depth" },
  { id: "offer", name: "Offer / festival", hint: "Uses your live offer code" },
  { id: "faceless_explainer", name: "Faceless YouTube", hint: "Grow without showing your face" },
  { id: "telugu_voiceover", name: "Telugu voiceover ad", hint: "For Telugu creators" },
];
const LANGS: { id: PromoLanguage; name: string }[] = [
  { id: "en", name: "English" },
  { id: "te", name: "Telugu" },
  { id: "hi", name: "Hindi" },
];
const MOTIONS = ["zoomIn", "pushIn", "panLeft", "zoomOut", "panRight", "tiltUp"] as const;

type Stage = "idle" | "script" | "voice" | "frames" | "render" | "done" | "error";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function b64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export function VideoTab() {
  const studio = useQuery({
    queryKey: ["promo-studio"],
    queryFn: () => getPromoStudio(),
    refetchOnWindowFocus: false,
    staleTime: 30 * 60 * 1000,
  });
  const [template, setTemplate] = useState<PromoVideoTemplate>("product_tour");
  const [format, setFormat] = useState<PromoVideoFormat>("short");
  const [seconds, setSeconds] = useState(30);
  const [language, setLanguage] = useState<PromoLanguage>("en");
  const [voice, setVoice] = useState("Roger");
  const [topic, setTopic] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [plan, setPlan] = useState<PromoVideoPlan | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [video, setVideo] = useState<{ url: string; ext: string; seconds: number } | null>(null);
  const [frameData, setFrameData] = useState<{ brand: Brand; shots: (string | null)[] } | null>(
    null,
  );
  const frameRefs = useRef<(HTMLDivElement | null)[]>([]);
  const overflow = useRef<boolean[]>([]);

  useEffect(
    () => () => {
      if (video) URL.revokeObjectURL(video.url);
    },
    [video],
  );

  if (studio.isLoading) return <Loader2 className="m-8 h-6 w-6 animate-spin" />;
  if (!studio.data) return <p className="text-destructive">{errMsg(studio.error)}</p>;
  const s = studio.data;
  const busy = ["script", "voice", "frames", "render"].includes(stage);

  const writeScript = async () => {
    if (!picked.length) return toast.error("Pick at least one app screenshot");
    setStage("script");
    setError("");
    setVideo(null);
    try {
      const r = await generatePromoVideoScript({
        data: {
          template,
          format,
          seconds,
          language: template === "telugu_voiceover" ? "te" : language,
          assetIds: picked.slice(0, 8),
          topic: topic.trim() || undefined,
        },
      });
      if (!r.ok) {
        toast.error(r.message);
        setStage("idle");
        return;
      }
      setPlan(r.plan);
      setStage("idle");
    } catch (e) {
      toast.error(errMsg(e));
      setStage("idle");
    }
  };

  const editScene = (i: number, patch: Partial<PromoVideoPlan["script"]["scenes"][number]>) =>
    setPlan((p) =>
      p
        ? {
            ...p,
            script: {
              ...p.script,
              scenes: p.script.scenes.map((x, j) => (j === i ? { ...x, ...patch } : x)),
            },
          }
        : p,
    );

  const makeVideo = async () => {
    if (!plan) return;
    setError("");
    setVideo(null);
    try {
      // 1) Voice — one clip per scene + the end screen, two at a time.
      setStage("voice");
      setProgress(0);
      const texts = [...plan.script.scenes.map((x) => x.voiceover), plan.script.end.voiceover];
      const actx = new AudioContext();
      const audio: AudioBuffer[] = new Array(texts.length);
      let doneCount = 0;
      const queue = texts.map((t, i) => ({ t, i }));
      const worker = async () => {
        for (let job = queue.shift(); job; job = queue.shift()) {
          const r = await promoVideoVoice({
            data: {
              batchId: plan.batchId,
              text: job.t.slice(0, 400),
              language: plan.language,
              voice,
            },
          });
          if (!r.ok) throw new Error(r.message);
          audio[job.i] = await actx.decodeAudioData(b64ToArrayBuffer(r.audioBase64));
          setProgress(++doneCount / texts.length);
        }
      };
      await Promise.all([worker(), worker()]);

      // 2) Frames — screenshots and logo as blob: URLs, draw every scene + end screen.
      setStage("frames");
      const [logo, ...shots] = await Promise.all([
        toBlobUrl(s.brand.logoUrl),
        ...plan.assetUrls.map((u) => toBlobUrl(u)),
      ]);
      overflow.current = [];
      setFrameData({ brand: { ...s.brand, logoUrl: logo }, shots });
      const css = await promoFontCss(plan.language);
      await new Promise((r) => setTimeout(r, 400));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (overflow.current.some(Boolean))
        throw new Error("A caption is too long for the screen. Shorten it and try again.");
      const { toPng } = await import("html-to-image");
      const images: string[] = [];
      for (let i = 0; i < texts.length; i++) {
        const node = frameRefs.current[i]?.querySelector<HTMLElement>("[data-render-root]");
        if (!node) throw new Error("Frame not ready");
        await Promise.all(
          Array.from(node.querySelectorAll("img")).map((im) => im.decode().catch(() => {})),
        );
        images.push(await toPng(node, { pixelRatio: 1, cacheBust: true, fontEmbedCSS: css }));
      }

      // 3) Render — the app's video renderer adds motion + voice and records the file.
      setStage("render");
      setProgress(0);
      const { renderVideo } = await import("@/lib/video-renderer");
      const res = await renderVideo({
        title: plan.script.title,
        contentType: plan.format === "short" ? "short_reel" : "long_video",
        scenes: texts.map((t, i) => ({
          n: i + 1,
          visual: "",
          voiceover: t,
          duration: "3",
          motion: i === texts.length - 1 ? "pushIn" : MOTIONS[i % MOTIONS.length],
          transition: i === 0 ? "cut" : "fade",
        })),
        sceneImages: images,
        sceneAudio: audio,
        fitToAudio: true,
        showOnScreenText: false,
        onProgress: setProgress,
      });
      actx.close().catch(() => {});
      setVideo({
        url: URL.createObjectURL(res.blob),
        ext: res.extension,
        seconds: Math.round(res.durationSec),
      });
      setStage("done");
      toast.success("Video ready");
    } catch (e) {
      setError(errMsg(e));
      setStage("error");
    } finally {
      setFrameData((f) => {
        if (f) [f.brand.logoUrl, ...f.shots].forEach((u) => u && URL.revokeObjectURL(u));
        return null;
      });
    }
  };

  const download = () => {
    if (!video || !plan) return;
    const a = document.createElement("a");
    a.href = video.url;
    a.download = `creatorflow-${plan.template}-${plan.format}-${plan.batchId.slice(0, 8)}.${video.ext}`;
    a.click();
  };
  const copy = (text: string, what: string) =>
    navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied`));

  const lengths = PROMO_VIDEO_LENGTHS[format];
  const stageLabel: Record<Stage, string> = {
    idle: "",
    script: "Writing the script…",
    voice: "Recording the voiceover…",
    frames: "Drawing the scenes…",
    render: "Rendering the video… (keep this tab open)",
    done: "",
    error: "",
  };

  return (
    <div className="space-y-6">
      {/* Options */}
      <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label>Video type</Label>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={busy}
                onClick={() => {
                  setTemplate(t.id);
                  if (t.id === "telugu_voiceover") setLanguage("te");
                }}
                className={`rounded-lg border p-3 text-left ${template === t.id ? "border-primary bg-primary/5" : ""}`}
              >
                <div className="text-sm font-medium">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.hint}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Format</Label>
          <Select
            value={format}
            disabled={busy}
            onValueChange={(v) => {
              const f = v as PromoVideoFormat;
              setFormat(f);
              setSeconds(PROMO_VIDEO_LENGTHS[f][1]);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="short">YouTube Short / Reel (9:16)</SelectItem>
              <SelectItem value="regular">Regular YouTube video (16:9)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Length</Label>
          <Select
            value={String(seconds)}
            disabled={busy}
            onValueChange={(v) => setSeconds(Number(v))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {lengths.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  About {n} seconds
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Language</Label>
          <Select
            value={language}
            disabled={busy || template === "telugu_voiceover"}
            onValueChange={(v) => setLanguage(v as PromoLanguage)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGS.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Voice</Label>
          <Select value={voice} disabled={busy} onValueChange={setVoice}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VOICE_CATALOG.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label} — {v.gender}, {v.vibe}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>App screenshots to show ({picked.length} selected, up to 8)</Label>
          {s.assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Upload app screenshots in the Create tab first.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-10">
              {s.assets.map((a) => {
                const on = picked.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setPicked((p) =>
                        on ? p.filter((x) => x !== a.id) : p.length < 8 ? [...p, a.id] : p,
                      )
                    }
                    className={`relative overflow-hidden rounded-md border-2 ${on ? "border-primary" : "border-transparent"}`}
                    title={a.label}
                  >
                    <img
                      src={a.url}
                      alt={a.label}
                      className="aspect-[9/16] w-full object-cover object-top"
                    />
                    {on && (
                      <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Angle / idea (optional)</Label>
          <Textarea
            value={topic}
            disabled={busy}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={300}
            placeholder="e.g. Make Telugu YouTube videos without a camera"
          />
        </div>
        <div className="md:col-span-2">
          <Button onClick={writeScript} disabled={busy}>
            {stage === "script" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {plan ? "Write a new script" : "Write the script"}
          </Button>
        </div>
      </div>

      {/* Script editor */}
      {plan && (
        <div className="space-y-4 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Script — edit anything, then make the video</h3>
            <span className="text-xs text-muted-foreground">
              Voice cost about ${plan.estVoiceUsd.toFixed(3)} (Promo Studio budget)
            </span>
          </div>
          {plan.script.scenes.map((sc, i) => (
            <div
              key={i}
              className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_220px_120px]"
            >
              <Textarea
                value={sc.voiceover}
                disabled={busy}
                rows={2}
                maxLength={300}
                onChange={(e) => editScene(i, { voiceover: e.target.value })}
              />
              <Input
                value={sc.caption}
                disabled={busy}
                maxLength={60}
                onChange={(e) => editScene(i, { caption: e.target.value })}
                placeholder="On-screen text"
              />
              <Select
                value={String(sc.asset)}
                disabled={busy}
                onValueChange={(v) => editScene(i, { asset: Number(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {plan.assetUrls.map((_, j) => (
                    <SelectItem key={j} value={String(j)}>
                      Screen {j + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-3">
            <Input
              value={plan.script.end.headline}
              disabled={busy}
              maxLength={80}
              onChange={(e) =>
                setPlan({
                  ...plan,
                  script: { ...plan.script, end: { ...plan.script.end, headline: e.target.value } },
                })
              }
              placeholder="End screen headline"
            />
            <Input
              value={plan.script.end.cta}
              disabled={busy}
              maxLength={30}
              onChange={(e) =>
                setPlan({
                  ...plan,
                  script: { ...plan.script, end: { ...plan.script.end, cta: e.target.value } },
                })
              }
              placeholder="Button text"
            />
            <Input
              value={plan.script.end.voiceover}
              disabled={busy}
              maxLength={200}
              onChange={(e) =>
                setPlan({
                  ...plan,
                  script: {
                    ...plan.script,
                    end: { ...plan.script.end, voiceover: e.target.value },
                  },
                })
              }
              placeholder="End voiceover"
            />
          </div>
          <Button onClick={makeVideo} disabled={busy}>
            {busy && stage !== "script" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Film className="mr-2 h-4 w-4" />
            )}
            Make the video
          </Button>
          {busy && stage !== "script" && (
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">{stageLabel[stage]}</div>
              <Progress value={Math.round(progress * 100)} />
            </div>
          )}
          {stage === "error" && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {/* Result */}
      {video && plan && (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <h3 className="font-semibold">Your video ({video.seconds}s)</h3>
          <video
            src={video.url}
            controls
            className={`rounded-lg border bg-black ${plan.format === "short" ? "max-h-[70vh]" : "w-full"}`}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={download}>
              <Download className="mr-1 h-4 w-4" /> Download .{video.ext}
            </Button>
            <Button size="sm" variant="outline" onClick={() => copy(plan.script.title, "Title")}>
              <Copy className="mr-1 h-4 w-4" /> Copy title
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                copy(
                  `${plan.script.description}\n\n${plan.script.hashtags.join(" ")}`,
                  "Description",
                )
              }
            >
              <Copy className="mr-1 h-4 w-4" /> Copy description + hashtags
            </Button>
          </div>
          <div className="space-y-1 text-sm">
            <div className="font-medium">{plan.script.title}</div>
            <div className="whitespace-pre-line text-muted-foreground">
              {plan.script.description}
            </div>
            <div className="text-muted-foreground">{plan.script.hashtags.join(" ")}</div>
          </div>
          {video.ext === "webm" && (
            <p className="text-xs text-amber-600">
              This browser saved WebM. YouTube accepts WebM; for an MP4, render in Chrome or Edge.
            </p>
          )}
        </div>
      )}

      {/* Full-size frames, off-screen, used only while drawing the scenes. */}
      {frameData && plan && (
        <div aria-hidden style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }}>
          {plan.script.scenes.map((sc, i) => (
            <div
              key={i}
              ref={(el) => {
                frameRefs.current[i] = el;
              }}
            >
              <SceneFrame
                format={plan.format}
                brand={frameData.brand}
                festive={plan.template === "offer"}
                caption={sc.caption}
                subtitle={sc.voiceover}
                shot={frameData.shots[sc.asset] ?? frameData.shots[0] ?? null}
                index={i}
                total={plan.script.scenes.length}
                onOverflow={(o) => {
                  overflow.current[i] = o;
                }}
              />
            </div>
          ))}
          <div
            ref={(el) => {
              frameRefs.current[plan.script.scenes.length] = el;
            }}
          >
            <EndFrame
              format={plan.format}
              brand={frameData.brand}
              headline={plan.script.end.headline}
              cta={plan.script.end.cta}
              offer={plan.offer}
              onOverflow={(o) => {
                overflow.current[plan.script.scenes.length] = o;
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
