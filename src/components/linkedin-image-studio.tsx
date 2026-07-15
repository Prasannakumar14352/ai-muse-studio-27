// LinkedIn-ready image generator with layout-aware safe zones + native-size download.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { fetchGeneratedImage } from "@/lib/image-stream";
import { Download, Wand2 } from "lucide-react";
import { CreatorFlowSelect } from "@/components/ui/creator-flow-select";

export type LinkedinImageSize = {
  key: "share_1200x627" | "square_1080" | "portrait_1080x1350";
  label: string;
  w: number;
  h: number;
  ratio: "16:9" | "1:1" | "9:16";
  /** Safe zone (percent of canvas) reserved for headline overlay. */
  safe: { x: number; y: number; w: number; h: number };
};

export const LINKEDIN_SIZES: LinkedinImageSize[] = [
  { key: "share_1200x627", label: "Link share · 1200×627", w: 1200, h: 627, ratio: "16:9", safe: { x: 5, y: 8, w: 55, h: 84 } },
  { key: "square_1080", label: "Feed square · 1080×1080", w: 1080, h: 1080, ratio: "1:1", safe: { x: 6, y: 8, w: 60, h: 40 } },
  { key: "portrait_1080x1350", label: "Feed portrait · 1080×1350", w: 1080, h: 1350, ratio: "9:16", safe: { x: 6, y: 6, w: 88, h: 30 } },
];

export type LinkedinImageState = {
  size: LinkedinImageSize["key"];
  prompt: string;
  headline: string;
  subhead: string;
  brand: string;
  theme: "dark" | "light";
  overlayPos: "top" | "bottom" | "left";
  image: string | null;   // data URL of the AI background
};

type Props = {
  topic: string;
  initial?: Partial<LinkedinImageState> | null;
  suggestedPrompt?: string;
  suggestedHeadline?: string;
  suggestedBrand?: string;
  onChange?: (s: LinkedinImageState) => void;
};

function bySize(k: LinkedinImageState["size"]) {
  return LINKEDIN_SIZES.find((s) => s.key === k) ?? LINKEDIN_SIZES[0];
}

export function LinkedinImageStudio({ topic, initial, suggestedPrompt, suggestedHeadline, suggestedBrand, onChange }: Props) {
  const [state, setState] = useState<LinkedinImageState>({
    size: (initial?.size as LinkedinImageState["size"]) ?? "square_1080",
    prompt: initial?.prompt ?? suggestedPrompt ?? "",
    headline: initial?.headline ?? suggestedHeadline ?? topic,
    subhead: initial?.subhead ?? "",
    brand: initial?.brand ?? suggestedBrand ?? "",
    theme: (initial?.theme as "dark" | "light") ?? "dark",
    overlayPos: (initial?.overlayPos as "top" | "bottom" | "left") ?? "bottom",
    image: initial?.image ?? null,
  });
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const size = bySize(state.size);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { onChange?.(state); }, [state, onChange]);

  async function generate() {
    if (!state.prompt.trim()) return toast.error("Describe the image first");
    setBusy(true); setPreview(null);
    try {
      // Layout-aware: instruct the model to leave the safe zone as clean negative space for headline.
      const safeDesc =
        state.overlayPos === "top" ? "Leave the TOP third as clean, empty negative space (sky/void)."
        : state.overlayPos === "left" ? "Keep the LEFT half as clean, muted negative space (blurred backdrop)."
        : "Leave the BOTTOM third as clean, empty negative space.";
      const composed = [
        `Editorial LinkedIn hero image. Aspect ${size.ratio}.`,
        `Subject: ${state.prompt}.`,
        safeDesc,
        `${state.theme === "dark" ? "Moody, cinematic lighting, deep tones." : "Bright, airy, high-key lighting."}`,
        "Absolutely NO text, NO letters, NO logos, NO watermarks. Professional composition. High detail.",
      ].join(" ");
      const res = await fetchGeneratedImage({
        prompt: composed,
        ratio: size.ratio,
        quality: "high",
        onPartial: (u) => setPreview(u),
      });
      if (res.error || !res.image) throw new Error(res.error ?? "No image");
      setState((s) => ({ ...s, image: res.image! }));
      toast.success("Image generated");
    } catch (e) {
      toast.error("Couldn't generate image", { description: e instanceof Error ? e.message : undefined });
    } finally { setBusy(false); }
  }

  async function download() {
    if (!canvasRef.current) return;
    try {
      const dataUrl = await toPng(canvasRef.current, { pixelRatio: 1, cacheBust: true, width: size.w, height: size.h });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `linkedin-${size.key}-${Date.now()}.png`;
      a.click();
      toast.success(`Downloaded ${size.w}×${size.h}`);
    } catch (e) {
      toast.error("Download failed", { description: e instanceof Error ? e.message : undefined });
    }
  }

  // Preview scaling so any size fits.
  const maxW = 520;
  const scale = Math.min(1, maxW / size.w);

  const ink = state.theme === "dark" ? "#F8FAFC" : "#0B1220";
  const sub = state.theme === "dark" ? "rgba(248,250,252,0.78)" : "rgba(11,18,32,0.72)";
  const scrim = state.theme === "dark"
    ? state.overlayPos === "top" ? "linear-gradient(180deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 60%)"
      : state.overlayPos === "left" ? "linear-gradient(90deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0) 65%)"
      : "linear-gradient(0deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0) 60%)"
    : state.overlayPos === "top" ? "linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 55%)"
      : state.overlayPos === "left" ? "linear-gradient(90deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 65%)"
      : "linear-gradient(0deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 55%)";

  const overlayStyle: React.CSSProperties =
    state.overlayPos === "top" ? { top: 0, left: 0, right: 0, padding: `${size.h * 0.06}px ${size.w * 0.06}px` }
    : state.overlayPos === "left" ? { top: 0, bottom: 0, left: 0, width: size.w * 0.55, padding: `${size.h * 0.08}px ${size.w * 0.06}px`, display: "flex", flexDirection: "column", justifyContent: "center" }
    : { bottom: 0, left: 0, right: 0, padding: `${size.h * 0.06}px ${size.w * 0.06}px` };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {LINKEDIN_SIZES.map((s) => (
          <button
            key={s.key}
            onClick={() => setState((v) => ({ ...v, size: s.key }))}
            className={`px-3 py-1.5 rounded-full text-xs border ${state.size === s.key ? "gradient-primary text-white border-transparent" : "glass border-border"}`}
          >
            {s.label}
          </button>
        ))}
        <div className="flex-1" />
        <CreatorFlowSelect
          ariaLabel="Theme"
          className="h-8 w-28"
          value={state.theme}
          onValueChange={(v) => setState((s) => ({ ...s, theme: v as "dark" | "light" }))}
          options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]}
        />
        <CreatorFlowSelect
          ariaLabel="Text position"
          className="h-8 w-36"
          value={state.overlayPos}
          onValueChange={(v) => setState((s) => ({ ...s, overlayPos: v as "top" | "bottom" | "left" }))}
          options={[
            { value: "bottom", label: "Text bottom" },
            { value: "top", label: "Text top" },
            { value: "left", label: "Text left" },
          ]}
        />
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <div className="glass rounded-2xl p-4 flex items-center justify-center overflow-auto">
          <div style={{ width: size.w * scale, height: size.h * scale, position: "relative" }}>
            <div
              ref={canvasRef}
              className="origin-top-left"
              style={{
                width: size.w, height: size.h, position: "absolute", top: 0, left: 0,
                transform: `scale(${scale})`, transformOrigin: "top left",
                background: state.theme === "dark" ? "#05070d" : "#F3F6F8",
                overflow: "hidden",
              }}
            >
              {(state.image || preview) && (
                <img src={state.image ?? preview ?? ""} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              )}
              <div style={{ position: "absolute", inset: 0, background: scrim }} />
              <div style={{ position: "absolute", ...overlayStyle, color: ink }}>
                {state.brand && (
                  <div style={{ fontSize: size.w * 0.018, letterSpacing: 4, textTransform: "uppercase", color: "#0A66C2", fontWeight: 700, marginBottom: size.h * 0.02 }}>
                    {state.brand}
                  </div>
                )}
                <div style={{ fontSize: size.w * (state.size === "share_1200x627" ? 0.055 : 0.062), fontWeight: 800, lineHeight: 1.08, letterSpacing: -0.5, maxWidth: state.overlayPos === "left" ? "100%" : "78%" }}>
                  {state.headline}
                </div>
                {state.subhead && (
                  <div style={{ fontSize: size.w * 0.024, lineHeight: 1.35, color: sub, marginTop: size.h * 0.02, maxWidth: state.overlayPos === "left" ? "100%" : "70%" }}>
                    {state.subhead}
                  </div>
                )}
              </div>
              {/* Safe-zone hint (not rendered in export because it's drawn outside via border-only) */}
            </div>
            {/* Safe-zone overlay for editor only, above the scaled canvas */}
            <div
              className="pointer-events-none"
              style={{
                position: "absolute",
                left: `${size.safe.x}%`, top: `${size.safe.y}%`,
                width: `${size.safe.w}%`, height: `${size.safe.h}%`,
                border: "1px dashed rgba(255,255,255,0.35)",
                borderRadius: 8,
              }}
            />
          </div>
        </div>

        <div className="glass rounded-2xl p-4 space-y-3">
          <Field label="Image prompt (subject, mood, setting)">
            <textarea rows={4} value={state.prompt}
              onChange={(e) => setState((v) => ({ ...v, prompt: e.target.value }))}
              placeholder="e.g. a focused engineer at a large monitor at night, warm desk lamp, blurred city lights outside"
              className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 text-xs" />
          </Field>
          <Field label="Headline (overlay)">
            <textarea rows={3} value={state.headline}
              onChange={(e) => setState((v) => ({ ...v, headline: e.target.value }))}
              className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 text-sm font-semibold" />
          </Field>
          <Field label="Subhead (optional)">
            <input value={state.subhead}
              onChange={(e) => setState((v) => ({ ...v, subhead: e.target.value }))}
              className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 text-xs" />
          </Field>
          <Field label="Brand (eyebrow)">
            <input value={state.brand}
              onChange={(e) => setState((v) => ({ ...v, brand: e.target.value }))}
              className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 text-xs" />
          </Field>

          <div className="flex gap-2 pt-2">
            <button onClick={generate} disabled={busy}
              className="flex-1 rounded-lg gradient-primary text-white px-3 py-2 text-xs inline-flex items-center justify-center gap-1 shadow-[var(--shadow-glow)] disabled:opacity-60">
              <Wand2 className="w-3.5 h-3.5" /> {busy ? "Generating…" : (state.image ? "Regenerate" : "Generate")}
            </button>
            <button onClick={download} disabled={!state.image && !preview}
              className="rounded-lg border border-border/60 px-3 py-2 text-xs inline-flex items-center gap-1 hover:bg-white/5 disabled:opacity-40">
              <Download className="w-3.5 h-3.5" /> PNG
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Dashed box = LinkedIn safe zone. The AI prompt is instructed to leave that area as clean negative space so your headline stays legible.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">{label}</div>
      {children}
    </label>
  );
}
