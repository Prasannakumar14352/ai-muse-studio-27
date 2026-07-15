// LinkedIn Document Carousel Studio — render, edit, reorder, download, PDF export.
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { useServerFn } from "@tanstack/react-start";
import { saveBlob } from "@/lib/downloads";
import {
  generateLinkedinCarousel,
  transformCarouselSlide,
  type LinkedinCarouselContent,
  type LinkedinCarouselSlide,
} from "@/lib/linkedin-carousel-ai.functions";
import { getDefaultBrandKitFn } from "@/lib/brand-kit.functions";
import { ArrowDown, ArrowUp, Copy, Download, FileDown, GripVertical, Instagram, Linkedin, Package, Palette, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { CreatorFlowSelect } from "@/components/ui/creator-flow-select";


// LinkedIn document carousels display best at portrait ~4:5 (1080x1350).
// Instagram preview uses 1:1 (1080x1080).
const FORMATS = {
  linkedin: { w: 1080, h: 1350, label: "LinkedIn 4:5" },
  instagram: { w: 1080, h: 1080, label: "Instagram 1:1" },
} as const;
type FormatKey = keyof typeof FORMATS;


type Props = {
  initial?: LinkedinCarouselContent | null;
  topic: string;
  audience?: string;
  tone?: string;
  body?: string;
  brand?: string;
  cta?: string;
  onChange?: (content: LinkedinCarouselContent) => void;
};

function newSlide(kind: LinkedinCarouselSlide["kind"] = "content"): LinkedinCarouselSlide {
  const id = Math.random().toString(36).slice(2, 9);
  if (kind === "cover") return { id, kind, eyebrow: "Insight", title: "New cover title", body: "One-line sub-hook.", footer: "Swipe →" };
  if (kind === "cta") return { id, kind, title: "Follow for more like this.", body: "Save this post.", footer: "" };
  return { id, kind, eyebrow: "01 / N", title: "New point", bullets: ["Bullet one", "Bullet two"] };
}

export function LinkedinCarouselStudio({ initial, topic, audience, tone, body, brand, cta, onChange }: Props) {
  const run = useServerFn(generateLinkedinCarousel);
  const transform = useServerFn(transformCarouselSlide);
  const loadBrandKit = useServerFn(getDefaultBrandKitFn);
  const [busy, setBusy] = useState(false);
  const [aiBusyIdx, setAiBusyIdx] = useState<number | null>(null);
  const [format, setFormat] = useState<FormatKey>("linkedin");
  const SLIDE_W = FORMATS[format].w;
  const SLIDE_H = FORMATS[format].h;
  const [state, setState] = useState<LinkedinCarouselContent>(

    initial ?? { slides: [newSlide("cover"), newSlide("content"), newSlide("cta")], design: { palette: ["#0A66C2", "#F3F6F8", "#111827"], theme: "dark" } },
  );
  const [active, setActive] = useState(0);
  const [slideCount, setSlideCount] = useState(8);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  function update(next: LinkedinCarouselContent) {
    setState(next);
    onChange?.(next);
  }

  async function regenerate() {
    setBusy(true);
    try {
      const res = await run({
        data: {
          topic, audience: audience ?? "", tone: tone ?? "Professional", body: body ?? "",
          slide_count: slideCount, brand: brand ?? "", cta: cta ?? "", theme: state.design.theme,
        },
      });
      update(res.content);
      setActive(0);
      if (res.mode === "demo") toast.message("Draft carousel shown", { description: res.safeError });
      else toast.success("Carousel generated");
    } catch (e) {
      toast.error("Couldn't generate", { description: e instanceof Error ? e.message : undefined });
    } finally { setBusy(false); }
  }

  function patchSlide(idx: number, patch: Partial<LinkedinCarouselSlide>) {
    const slides = state.slides.slice();
    slides[idx] = { ...slides[idx], ...patch };
    update({ ...state, slides });
  }
  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= state.slides.length) return;
    const slides = state.slides.slice();
    [slides[idx], slides[j]] = [slides[j], slides[idx]];
    update({ ...state, slides });
    setActive(j);
  }
  function reorder(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= state.slides.length || to >= state.slides.length) return;
    const slides = state.slides.slice();
    const [moved] = slides.splice(from, 1);
    slides.splice(to, 0, moved);
    update({ ...state, slides });
    setActive(to);
  }
  function del(idx: number) {
    if (state.slides.length <= 2) return toast.error("Keep at least 2 slides");
    const slides = state.slides.slice(); slides.splice(idx, 1);
    update({ ...state, slides }); setActive(Math.max(0, idx - 1));
  }
  function add(after: number, kind: LinkedinCarouselSlide["kind"] = "content") {
    const slides = state.slides.slice();
    slides.splice(after + 1, 0, newSlide(kind));
    update({ ...state, slides }); setActive(after + 1);
  }
  function duplicate(idx: number) {
    const src = state.slides[idx];
    if (!src) return;
    const clone: LinkedinCarouselSlide = { ...src, id: Math.random().toString(36).slice(2, 9) };
    const slides = state.slides.slice();
    slides.splice(idx + 1, 0, clone);
    update({ ...state, slides }); setActive(idx + 1);
  }
  async function aiTransform(idx: number, action: "rewrite" | "expand" | "shorten") {
    const s = state.slides[idx];
    if (!s) return;
    setAiBusyIdx(idx);
    try {
      const res = await transform({
        data: {
          action, topic, tone: tone ?? "Professional",
          title: s.title ?? "", body: s.body ?? "", bullets: s.bullets ?? [],
        },
      });
      patchSlide(idx, { title: res.slide.title, body: res.slide.body, bullets: res.slide.bullets });
      if (res.mode === "ai") toast.success(`Slide ${action}n`);
      else toast.message("AI unavailable", { description: res.safeError });
    } catch (e) {
      toast.error("AI edit failed", { description: e instanceof Error ? e.message : undefined });
    } finally { setAiBusyIdx(null); }
  }

  // Auto-apply Brand Kit colors on mount if user has a default kit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const kit = await loadBrandKit();
        if (cancelled || !kit) return;
        const primary = kit.primary_color;
        const secondary = kit.secondary_color;
        if (primary || secondary) {
          const palette = state.design.palette.slice();
          if (primary) palette[0] = primary;
          if (secondary) palette[1] = secondary;
          update({ ...state, design: { ...state.design, palette } });
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  async function captureSlide(id: string): Promise<string | null> {
    const node = refs.current[id];
    if (!node) return null;
    return await toPng(node, { pixelRatio: 1, cacheBust: true, width: SLIDE_W, height: SLIDE_H });
  }

  async function downloadOne(idx: number) {
    const s = state.slides[idx];
    try {
      const dataUrl = await captureSlide(s.id);
      if (!dataUrl) throw new Error("Slide not rendered");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `linkedin-slide-${String(idx + 1).padStart(2, "0")}.png`;
      a.click();
    } catch (e) {
      toast.error("Download failed", { description: e instanceof Error ? e.message : undefined });
    }
  }

  async function exportPdf() {
    setBusy(true);
    try {
      const pdf = new jsPDF({ unit: "px", format: [SLIDE_W, SLIDE_H], orientation: "portrait" });
      for (let i = 0; i < state.slides.length; i++) {
        const dataUrl = await captureSlide(state.slides[i].id);
        if (!dataUrl) continue;
        if (i > 0) pdf.addPage([SLIDE_W, SLIDE_H], "portrait");
        pdf.addImage(dataUrl, "PNG", 0, 0, SLIDE_W, SLIDE_H, undefined, "FAST");
      }
      pdf.save(`linkedin-carousel-${Date.now()}.pdf`);
      toast.success("PDF exported");
    } catch (e) {
      toast.error("PDF export failed", { description: e instanceof Error ? e.message : undefined });
    } finally { setBusy(false); }
  }

  async function downloadAll() {
    setBusy(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder("linkedin-carousel")!;
      let n = 0;
      for (let i = 0; i < state.slides.length; i++) {
        const dataUrl = await captureSlide(state.slides[i].id);
        if (!dataUrl) continue;
        const base64 = dataUrl.split(",")[1];
        folder.file(`slide-${String(i + 1).padStart(2, "0")}.png`, base64, { base64: true });
        n++;
      }
      if (!n) throw new Error("No slides captured");
      const blob = await zip.generateAsync({ type: "blob" });
      saveBlob(blob, `linkedin-carousel-${Date.now()}.zip`);
      toast.success(`Downloaded ${n} slides`);
    } catch (e) {
      toast.error("ZIP export failed", { description: e instanceof Error ? e.message : undefined });
    } finally { setBusy(false); }
  }

  const cur = state.slides[active];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={regenerate} disabled={busy || !topic}
          className="rounded-lg gradient-primary text-white px-3 py-1.5 text-xs inline-flex items-center gap-1 shadow-[var(--shadow-glow)] disabled:opacity-60">
          <Wand2 className="w-3.5 h-3.5" /> {busy ? "Working…" : (state.slides.length ? "Regenerate with AI" : "Generate with AI")}
        </button>
        <label className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          Slides
          <input type="number" min={4} max={12} value={slideCount}
            onChange={(e) => setSlideCount(Math.min(12, Math.max(4, Number(e.target.value) || 8)))}
            className="w-16 bg-input/50 border border-border rounded px-2 py-1 text-xs" />
        </label>
        <div className="flex-1" />
        <CreatorFlowSelect
          ariaLabel="Preview format"
          className="h-8 w-40"
          value={format}
          onValueChange={(v) => setFormat(v as FormatKey)}
          options={[
            { value: "linkedin", label: "LinkedIn 4:5" },
            { value: "instagram", label: "Instagram 1:1" },
          ]}
        />
        <CreatorFlowSelect
          ariaLabel="Theme"
          className="h-8 w-28"
          value={state.design.theme}
          onValueChange={(v) => update({ ...state, design: { ...state.design, theme: v as "light" | "dark" } })}
          options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]}
        />
        <button onClick={downloadAll} disabled={busy}
          className="rounded-lg border border-border/60 px-3 py-1.5 text-xs inline-flex items-center gap-1 hover:bg-white/5"
          title={format === "instagram" ? "Instagram square PNGs (ZIP)" : "LinkedIn 4:5 PNGs (ZIP)"}>
          {format === "instagram" ? <Instagram className="w-3.5 h-3.5" /> : <Package className="w-3.5 h-3.5" />}
          {format === "instagram" ? "IG PNGs (ZIP)" : "Download all (ZIP)"}
        </button>
        <button onClick={exportPdf} disabled={busy}
          className="rounded-lg border border-border/60 px-3 py-1.5 text-xs inline-flex items-center gap-1 hover:bg-white/5"
          title="LinkedIn document carousel PDF">
          <Linkedin className="w-3.5 h-3.5" /> <FileDown className="w-3.5 h-3.5" /> LinkedIn PDF
        </button>
      </div>


      <div className="grid lg:grid-cols-[280px_1fr_320px] gap-4">
        {/* Reorder rail — drag the handle to reorder */}
        <div className="glass rounded-2xl p-3 space-y-2 max-h-[70vh] overflow-auto">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1 pb-1">Drag <GripVertical className="w-3 h-3 inline -mt-0.5" /> to reorder · autosaves</div>
          {state.slides.map((s, i) => (
            <div
              key={s.id}
              onClick={() => setActive(i)}
              onDragOver={(e) => { e.preventDefault(); if (dragOver !== i) setDragOver(i); }}
              onDragLeave={() => { if (dragOver === i) setDragOver(null); }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null) reorder(dragFrom, i);
                setDragFrom(null); setDragOver(null);
              }}
              className={`rounded-lg p-2 border cursor-pointer transition-colors ${
                active === i ? "border-[color:var(--brand-orange)] bg-white/5" : "border-border/40 hover:bg-white/5"
              } ${dragOver === i && dragFrom !== null && dragFrom !== i ? "ring-2 ring-[color:var(--brand-orange)]/60" : ""} ${
                dragFrom === i ? "opacity-40" : ""
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <button
                  draggable
                  onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(i)); } catch { /* noop */ } }}
                  onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                  onClick={(e) => e.stopPropagation()}
                  title="Drag to reorder"
                  className="p-1 rounded hover:bg-white/10 cursor-grab active:cursor-grabbing text-muted-foreground"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground flex-1">{s.kind} · {i + 1}</span>
                <div className="flex items-center gap-1">
                  <button onClick={(e) => { e.stopPropagation(); move(i, -1); }} className="p-1 hover:bg-white/10 rounded" title="Move up"><ArrowUp className="w-3 h-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); move(i, 1); }} className="p-1 hover:bg-white/10 rounded" title="Move down"><ArrowDown className="w-3 h-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); duplicate(i); }} className="p-1 hover:bg-white/10 rounded" title="Duplicate"><Copy className="w-3 h-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); del(i); }} className="p-1 hover:bg-white/10 rounded text-rose-300" title="Delete"><Trash2 className="w-3 h-3" /></button>
                </div>

              </div>
              <p className="text-xs font-medium line-clamp-2 pl-6">{s.title}</p>
            </div>
          ))}
          <div className="flex gap-1 pt-1">
            <button onClick={() => add(state.slides.length - 1, "content")} className="flex-1 text-xs rounded border border-dashed border-border/60 py-1.5 inline-flex items-center justify-center gap-1 hover:bg-white/5"><Plus className="w-3 h-3" /> Content</button>
            <button onClick={() => add(state.slides.length - 1, "cta")} className="flex-1 text-xs rounded border border-dashed border-border/60 py-1.5 hover:bg-white/5">+ CTA</button>
          </div>
        </div>

        {/* Canvas */}
        <div className="glass rounded-2xl p-4 flex items-center justify-center overflow-auto">
          <div className="relative" style={{ width: SLIDE_W / 3, height: SLIDE_H / 3 }}>
            <div
              className="absolute top-0 left-0 origin-top-left"
              style={{ transform: "scale(0.3333)", width: SLIDE_W, height: SLIDE_H }}
            >
              {state.slides.map((s, i) => (
                <div key={s.id} style={{ display: i === active ? "block" : "none" }}>
                  <SlideCanvas
                    slide={s}
                    theme={state.design.theme}
                    palette={state.design.palette}
                    slideNum={i + 1}
                    total={state.slides.length}
                    innerRef={(el) => { refs.current[s.id] = el; }}
                    width={SLIDE_W}
                    height={SLIDE_H}
                  />

                </div>
              ))}
              {/* Off-screen render for capture-any-slide */}
              <div style={{ position: "absolute", left: -99999, top: 0 }}>
                {state.slides.map((s, i) => (
                  i === active ? null : (
                    <SlideCanvas
                      key={s.id}
                      slide={s}
                      theme={state.design.theme}
                      palette={state.design.palette}
                      slideNum={i + 1}
                      total={state.slides.length}
                      innerRef={(el) => { refs.current[s.id] = el; }}
                      width={SLIDE_W}
                      height={SLIDE_H}
                    />

                  )
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Editor */}
        <div className="glass rounded-2xl p-4 space-y-3 max-h-[70vh] overflow-auto">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Edit slide {active + 1}</span>
            <button onClick={() => downloadOne(active)} className="text-xs inline-flex items-center gap-1 hover:text-foreground text-muted-foreground">
              <Download className="w-3.5 h-3.5" /> PNG
            </button>
          </div>
          <TextField label="Eyebrow" value={cur.eyebrow ?? ""} onChange={(v) => patchSlide(active, { eyebrow: v })} />
          <TextField label="Title" value={cur.title} onChange={(v) => patchSlide(active, { title: v })} multiline />
          <TextField label="Body" value={cur.body ?? ""} onChange={(v) => patchSlide(active, { body: v })} multiline />
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Bullets</div>
            <textarea
              rows={4}
              value={(cur.bullets ?? []).join("\n")}
              onChange={(e) => patchSlide(active, { bullets: e.target.value.split("\n").filter(Boolean) })}
              placeholder="One bullet per line"
              className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 text-xs"
            />
          </div>
          <TextField label="Footer" value={cur.footer ?? ""} onChange={(v) => patchSlide(active, { footer: v })} />
          <div className="pt-2 border-t border-border/40">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Palette</div>
            <div className="flex gap-2">
              {state.design.palette.map((c, i) => (
                <input key={i} type="color" value={c}
                  onChange={(e) => {
                    const palette = state.design.palette.slice();
                    palette[i] = e.target.value;
                    update({ ...state, design: { ...state.design, palette } });
                  }}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent border border-border/60"
                />
              ))}
            </div>
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(JSON.stringify(state, null, 2)); toast.success("Copied JSON"); }}
            className="text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <Copy className="w-3.5 h-3.5" /> Copy carousel JSON
          </button>
        </div>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">{label}</div>
      {multiline ? (
        <textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 text-xs" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 text-xs" />
      )}
    </label>
  );
}

function SlideCanvas({
  slide, theme, palette, slideNum, total, innerRef, width, height,
}: {
  slide: LinkedinCarouselSlide;
  theme: "light" | "dark";
  palette: string[];
  slideNum: number;
  total: number;
  innerRef: (el: HTMLDivElement | null) => void;
  width: number;
  height: number;
}) {
  const SLIDE_W = width;
  const SLIDE_H = height;

  const isDark = theme === "dark";
  const accent = palette[0] ?? "#0A66C2";
  const surface = palette[2] ?? (isDark ? "#0B1220" : "#F3F6F8");
  const ink = isDark ? "#F8FAFC" : "#0B1220";
  const sub = isDark ? "rgba(248,250,252,0.72)" : "rgba(11,18,32,0.72)";
  const bg = isDark
    ? `radial-gradient(circle at 12% 8%, ${accent}33 0%, transparent 55%), linear-gradient(180deg, ${surface} 0%, #05070d 100%)`
    : `radial-gradient(circle at 12% 8%, ${accent}22 0%, transparent 55%), linear-gradient(180deg, #ffffff 0%, ${surface} 100%)`;

  return (
    <div
      ref={innerRef}
      style={{
        width: SLIDE_W, height: SLIDE_H,
        padding: 96,
        background: bg,
        color: ink,
        fontFamily: "Inter, system-ui, sans-serif",
        position: "relative", boxSizing: "border-box",
        display: "flex", flexDirection: "column",
      }}
    >
      {slide.eyebrow && (
        <div style={{ fontSize: 26, letterSpacing: 4, textTransform: "uppercase", color: accent, fontWeight: 600 }}>
          {slide.eyebrow}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: slide.kind === "cover" ? "flex-end" : "center", paddingTop: 40, paddingBottom: 40 }}>
        <h1 style={{
          fontSize: slide.kind === "cover" ? 96 : 68,
          lineHeight: 1.05, fontWeight: 800, letterSpacing: -1,
          margin: 0, color: ink,
        }}>
          {slide.title}
        </h1>
        {slide.body && (
          <p style={{ fontSize: 32, lineHeight: 1.35, color: sub, marginTop: 28, maxWidth: 820 }}>
            {slide.body}
          </p>
        )}
        {slide.bullets && slide.bullets.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: "36px 0 0", display: "flex", flexDirection: "column", gap: 20 }}>
            {slide.bullets.map((b, i) => (
              <li key={i} style={{ fontSize: 30, lineHeight: 1.4, color: sub, display: "flex", gap: 20, alignItems: "flex-start" }}>
                <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 999, background: accent, marginTop: 14, flexShrink: 0 }} />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 22, color: sub }}>
        <span>{slide.footer || ""}</span>
        <span>{String(slideNum).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
      </div>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 8, background: accent }} />
    </div>
  );
}
