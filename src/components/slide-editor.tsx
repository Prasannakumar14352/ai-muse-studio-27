import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import {
  X, Type, Image as ImageIcon, Trash2, Plus, Loader2, Download, Save,
  AlignLeft, AlignCenter, AlignRight, Wand2,
} from "lucide-react";
import type {
  SlideOverlay, SlideTextOverlay, SlideLogoOverlay, SlideOverlaySet,
} from "@/lib/local-store";
import {
  pickBestLayout, LAYOUT_TEMPLATES, type LayoutTemplate,
} from "@/lib/layout-engine";

type Ratio = "1:1" | "4:5" | "9:16" | "16:9";

const ASPECT_CLASS: Record<Ratio, string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-video",
};

const NATURAL_W: Record<Ratio, number> = {
  "1:1": 1080,
  "4:5": 1080,
  "9:16": 1080,
  "16:9": 1920,
};
const NATURAL_H: Record<Ratio, number> = {
  "1:1": 1080,
  "4:5": 1350,
  "9:16": 1920,
  "16:9": 1080,
};

const uid = () => Math.random().toString(36).slice(2, 10);

function makeText(partial: Partial<SlideTextOverlay> = {}): SlideTextOverlay {
  return {
    id: uid(),
    kind: "text",
    text: "Your headline",
    xPct: 50,
    yPct: 50,
    widthPct: 70,
    fontSize: 56,
    color: "#ffffff",
    bg: "transparent",
    weight: 800,
    align: "center",
    fontFamily: "Inter, system-ui, sans-serif",
    ...partial,
  };
}
function makeLogo(src: string): SlideLogoOverlay {
  return {
    id: uid(), kind: "logo", src,
    xPct: 12, yPct: 12, widthPct: 18, opacity: 1, rounded: false,
  };
}

async function fileToDataURL(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

export type SlideEditorProps = {
  src: string;                        // image URL (object URL or data URL)
  ratio: Ratio;
  title: string;
  slideNumber: number;
  initial?: SlideOverlaySet | null;
  /** Optional copy the auto-layout engine will use to place text into the
   *  template's safe zones without covering hero subjects. */
  copy?: {
    headline?: string;
    subhead?: string;
    bullets?: string[];
    cta?: string;
  } | null;
  onClose: () => void;
  onSave: (dataURL: string, overlays: SlideOverlaySet) => Promise<void> | void;
};

export function SlideEditor(props: SlideEditorProps) {
  const [overlays, setOverlays] = useState<SlideOverlay[]>(props.initial?.overlays ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; ox: number; oy: number } | null>(null);

  const selected = overlays.find((o) => o.id === selectedId) ?? null;
  const natW = NATURAL_W[props.ratio];
  const natH = NATURAL_H[props.ratio];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") props.onClose();
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        const active = document.activeElement;
        if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
        setOverlays((ov) => ov.filter((o) => o.id !== selectedId));
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, props]);

  function updateSelected<T extends SlideOverlay>(patch: Partial<T>) {
    if (!selectedId) return;
    setOverlays((ov) => ov.map((o) => (o.id === selectedId ? ({ ...o, ...patch } as SlideOverlay) : o)));
  }

  function startDrag(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const ov = overlays.find((o) => o.id === id);
    if (!ov) return;
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, ox: ov.xPct, oy: ov.yPct };
    setSelectedId(id);
  }
  function onDrag(e: React.PointerEvent) {
    const d = dragRef.current;
    const el = previewRef.current;
    if (!d || !el) return;
    const rect = el.getBoundingClientRect();
    const dx = ((e.clientX - d.startX) / rect.width) * 100;
    const dy = ((e.clientY - d.startY) / rect.height) * 100;
    setOverlays((ov) => ov.map((o) => o.id === d.id
      ? { ...o, xPct: Math.max(0, Math.min(100, d.ox + dx)), yPct: Math.max(0, Math.min(100, d.oy + dy)) }
      : o));
  }
  function endDrag() { dragRef.current = null; }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) return toast.error("Logo must be under 4 MB");
    try {
      const durl = await fileToDataURL(f);
      const logo = makeLogo(durl);
      setOverlays((ov) => [...ov, logo]);
      setSelectedId(logo.id);
    } catch {
      toast.error("Could not read logo file");
    } finally {
      e.target.value = "";
    }
  }

  async function handleSave() {
    if (!exportRef.current) return;
    setSaving(true);
    try {
      const dataUrl = await toPng(exportRef.current, {
        width: natW,
        height: natH,
        pixelRatio: 1,
        cacheBust: true,
        skipFonts: true,
      });
      await props.onSave(dataUrl, { overlays });
      toast.success("Slide updated");
      props.onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload() {
    if (!exportRef.current) return;
    try {
      const dataUrl = await toPng(exportRef.current, {
        width: natW, height: natH, pixelRatio: 1, cacheBust: true, skipFonts: true,
      });
      const a = document.createElement("a");
      a.href = dataUrl; a.download = `slide-${props.slideNumber}.png`; a.click();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  }

  const [lastTemplate, setLastTemplate] = useState<LayoutTemplate | null>(null);

  function applyAutoLayout(templateOverride?: LayoutTemplate) {
    const copy = props.copy;
    if (!copy || !copy.headline) {
      toast.error("No slide copy available to auto-layout");
      return;
    }
    const candidates = templateOverride ? [templateOverride] : LAYOUT_TEMPLATES;
    const { template, overlays: placed, score } = pickBestLayout(
      { ratio: props.ratio, headline: copy.headline, subhead: copy.subhead, bullets: copy.bullets, cta: copy.cta },
      candidates,
    );
    setLastTemplate(template);
    // Preserve existing logo overlays, replace text overlays.
    const kept = overlays.filter((o) => o.kind !== "text");
    const added: SlideOverlay[] = placed.map((p) => ({
      id: uid(),
      kind: "text",
      text: p.text,
      xPct: p.xPct, yPct: p.yPct, widthPct: p.widthPct,
      fontSize: p.fontSize,
      color: "#ffffff",
      bg: p.role === "cta" ? "#111827" : "transparent",
      weight: p.weight,
      align: p.align,
      fontFamily: "Inter, system-ui, sans-serif",
    }));
    setOverlays([...kept, ...added]);
    setSelectedId(null);
    const collisions = score.collisions.length;
    if (collisions === 0 && score.total >= 90) {
      toast.success(`Auto layout: ${template.label} — score ${score.total}`);
    } else if (collisions > 0) {
      toast.warning(`Auto layout used ${template.label}; ${collisions} collision(s) auto-adjusted`);
    } else {
      toast.info(`Auto layout: ${template.label} — score ${score.total}`);
    }
  }

  const overlayNodes = useMemo(() => overlays, [overlays]);

  return (
    <div className="fixed inset-0 z-[70] bg-black/95 backdrop-blur-sm flex items-center justify-center p-3 md:p-6" onClick={props.onClose}>
      <div className="w-full max-w-6xl max-h-[95vh] rounded-2xl overflow-hidden glass border border-border flex flex-col md:flex-row" onClick={(e) => e.stopPropagation()}>
        {/* Preview */}
        <div className="flex-1 min-w-0 bg-black/60 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{props.title}</div>
              <div className="text-[11px] text-muted-foreground">Slide {props.slideNumber} · {props.ratio}</div>
            </div>
            <button aria-label="Close" onClick={props.onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
            <div
              ref={previewRef}
              onPointerMove={onDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onClick={() => setSelectedId(null)}
              className={`relative w-full max-w-[520px] ${ASPECT_CLASS[props.ratio]} bg-black rounded-lg overflow-hidden select-none touch-none`}
            >
              <img src={props.src} alt="" crossOrigin="anonymous" className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
              {overlayNodes.map((o) => (
                <OverlayNode
                  key={o.id}
                  ov={o}
                  selected={o.id === selectedId}
                  onPointerDown={(e) => startDrag(e, o.id)}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
            <button onClick={() => { const t = makeText(); setOverlays((ov) => [...ov, t]); setSelectedId(t.id); }}
              className="rounded-lg glass border border-border px-3 py-1.5 text-xs flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5" /> Add text
            </button>
            <label className="rounded-lg glass border border-border px-3 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer">
              <ImageIcon className="w-3.5 h-3.5" /> Add logo
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </label>
            {props.copy?.headline && (
              <button
                onClick={() => applyAutoLayout()}
                title="Place text into template safe zones (no overlap with faces / products)"
                className="rounded-lg glass border border-[color:var(--neon-purple)]/50 px-3 py-1.5 text-xs flex items-center gap-1.5 hover:bg-white/5"
              >
                <Wand2 className="w-3.5 h-3.5" /> Auto layout
              </button>
            )}
            <div className="flex-1" />
            <button onClick={handleDownload} className="rounded-lg glass border border-border px-3 py-1.5 text-xs flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> PNG
            </button>
            <button onClick={handleSave} disabled={saving}
              className="rounded-lg gradient-primary text-white px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-border bg-black/40 flex flex-col">
          <div className="px-4 py-3 border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
            Layers ({overlays.length})
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {props.copy?.headline && (
              <div className="rounded-lg border border-border bg-black/30 p-2.5 space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Wand2 className="w-3 h-3" /> Layout templates
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {LAYOUT_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => applyAutoLayout(t)}
                      title={t.description}
                      className={`text-[10px] rounded border px-1.5 py-1 text-left ${lastTemplate?.id === t.id ? "border-[color:var(--neon-purple)] bg-white/5" : "border-border hover:bg-white/5"}`}
                    >
                      {t.id.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1">
              {overlays.length === 0 && (
                <div className="text-[11px] text-muted-foreground text-center py-4">
                  Add text or logo overlays to customize this slide.
                </div>
              )}
              {overlays.map((o) => (
                <button key={o.id} onClick={() => setSelectedId(o.id)}
                  className={`w-full text-left rounded-md border px-2.5 py-1.5 text-xs flex items-center gap-2 ${o.id === selectedId ? "border-[color:var(--neon-purple)] bg-white/5" : "border-border hover:bg-white/5"}`}>
                  {o.kind === "text" ? <Type className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
                  <span className="flex-1 truncate">{o.kind === "text" ? o.text || "Text" : "Logo"}</span>
                  <span
                    onClick={(e) => { e.stopPropagation(); setOverlays((ov) => ov.filter((x) => x.id !== o.id)); if (selectedId === o.id) setSelectedId(null); }}
                    className="text-rose-300 hover:text-rose-200"
                    role="button" tabIndex={0}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </span>
                </button>
              ))}
            </div>

            {selected && selected.kind === "text" && (
              <TextControls ov={selected} onChange={(p) => updateSelected(p)} />
            )}
            {selected && selected.kind === "logo" && (
              <LogoControls ov={selected} onChange={(p) => updateSelected(p)} />
            )}
          </div>
          <div className="p-3 border-t border-border">
            <button onClick={() => { const t = makeText(); setOverlays((ov) => [...ov, t]); setSelectedId(t.id); }}
              className="w-full rounded-lg glass border border-border px-3 py-2 text-xs flex items-center justify-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> New text layer
            </button>
          </div>
        </div>
      </div>

      {/* Offscreen high-res export node */}
      <div style={{ position: "fixed", left: -99999, top: 0, pointerEvents: "none" }} aria-hidden>
        <div
          ref={exportRef}
          style={{ width: natW, height: natH, position: "relative", background: "#000", overflow: "hidden" }}
        >
          <img
            src={props.src}
            crossOrigin="anonymous"
            alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
          {overlays.map((o) => (
            <OverlayNode key={o.id} ov={o} selected={false} exportMode />
          ))}
        </div>
      </div>
    </div>
  );
}

function OverlayNode(props: {
  ov: SlideOverlay;
  selected: boolean;
  exportMode?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const { ov, selected, exportMode, onPointerDown } = props;

  const commonStyle: React.CSSProperties = {
    position: "absolute",
    left: `${ov.xPct}%`,
    top: `${ov.yPct}%`,
    transform: "translate(-50%, -50%)",
    width: `${ov.widthPct}%`,
    cursor: exportMode ? "default" : "move",
    outline: selected ? "2px dashed rgba(139, 92, 246, 0.9)" : "none",
    outlineOffset: "2px",
  };

  if (ov.kind === "text") {
    // fontSize is expressed at natural preview width (~500 px); scale to container width via em using cqw.
    // Simpler: use fontSize as % of container width — treat ov.fontSize as px at container width 1000.
    // In export container width = natural width, in preview width ~500. Use responsive vw-like: fontSize% of parent width.
    const fontSizeCss = `calc(${ov.fontSize / 10} * 1cqw)`;
    return (
      <div style={{ ...commonStyle, containerType: "inline-size" }} onPointerDown={onPointerDown}>
        <div
          style={{
            fontFamily: ov.fontFamily,
            fontWeight: ov.weight,
            color: ov.color,
            background: ov.bg === "transparent" ? "transparent" : ov.bg,
            padding: ov.bg === "transparent" ? 0 : "0.4em 0.6em",
            borderRadius: 8,
            textAlign: ov.align,
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
            fontSize: fontSizeCss,
            wordBreak: "break-word",
            textShadow: ov.bg === "transparent" ? "0 2px 12px rgba(0,0,0,0.55)" : "none",
          }}
        >
          {ov.text || (exportMode ? "" : "Text")}
        </div>
      </div>
    );
  }

  return (
    <img
      src={ov.src}
      alt=""
      draggable={false}
      onPointerDown={onPointerDown}
      style={{
        ...commonStyle,
        opacity: ov.opacity,
        borderRadius: ov.rounded ? "9999px" : 0,
        objectFit: "contain",
      }}
    />
  );
}

function TextControls(props: { ov: SlideTextOverlay; onChange: (p: Partial<SlideTextOverlay>) => void }) {
  const { ov, onChange } = props;
  return (
    <div className="rounded-lg border border-border bg-black/30 p-3 space-y-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Text</div>
      <textarea
        value={ov.text}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={2}
        className="w-full rounded-md bg-black/60 border border-border px-2 py-1.5 text-xs"
        placeholder="Type here…"
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] text-muted-foreground">
          Size ({ov.fontSize})
          <input type="range" min={16} max={220} value={ov.fontSize}
            onChange={(e) => onChange({ fontSize: parseInt(e.target.value) })} className="w-full" />
        </label>
        <label className="text-[10px] text-muted-foreground">
          Width % ({ov.widthPct})
          <input type="range" min={15} max={100} value={ov.widthPct}
            onChange={(e) => onChange({ widthPct: parseInt(e.target.value) })} className="w-full" />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-muted-foreground flex items-center gap-1">
          Color
          <input type="color" value={ov.color} onChange={(e) => onChange({ color: e.target.value })} className="w-7 h-7 rounded" />
        </label>
        <label className="text-[10px] text-muted-foreground flex items-center gap-1">
          BG
          <input type="color" value={ov.bg === "transparent" ? "#000000" : ov.bg}
            onChange={(e) => onChange({ bg: e.target.value })} className="w-7 h-7 rounded" />
        </label>
        <button
          onClick={() => onChange({ bg: ov.bg === "transparent" ? "#000000" : "transparent" })}
          className="text-[10px] rounded border border-border px-1.5 py-0.5 hover:bg-white/5"
        >
          {ov.bg === "transparent" ? "Add BG" : "Clear BG"}
        </button>
      </div>
      <div className="flex items-center gap-1">
        {[400, 600, 700, 800, 900].map((w) => (
          <button key={w} onClick={() => onChange({ weight: w as 400 | 600 | 700 | 800 | 900 })}
            className={`text-[10px] rounded border px-1.5 py-0.5 ${ov.weight === w ? "gradient-primary text-white border-transparent" : "border-border hover:bg-white/5"}`}>
            {w}
          </button>
        ))}
        <div className="flex-1" />
        {(["left", "center", "right"] as const).map((a) => (
          <button key={a} onClick={() => onChange({ align: a })}
            className={`rounded p-1 border ${ov.align === a ? "gradient-primary text-white border-transparent" : "border-border hover:bg-white/5"}`}>
            {a === "left" ? <AlignLeft className="w-3 h-3" /> : a === "center" ? <AlignCenter className="w-3 h-3" /> : <AlignRight className="w-3 h-3" />}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] text-muted-foreground">
          X ({Math.round(ov.xPct)}%)
          <input type="range" min={0} max={100} value={ov.xPct} onChange={(e) => onChange({ xPct: parseInt(e.target.value) })} className="w-full" />
        </label>
        <label className="text-[10px] text-muted-foreground">
          Y ({Math.round(ov.yPct)}%)
          <input type="range" min={0} max={100} value={ov.yPct} onChange={(e) => onChange({ yPct: parseInt(e.target.value) })} className="w-full" />
        </label>
      </div>
    </div>
  );
}

function LogoControls(props: { ov: SlideLogoOverlay; onChange: (p: Partial<SlideLogoOverlay>) => void }) {
  const { ov, onChange } = props;
  return (
    <div className="rounded-lg border border-border bg-black/30 p-3 space-y-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Logo</div>
      <label className="text-[10px] text-muted-foreground block">
        Size % ({ov.widthPct})
        <input type="range" min={5} max={60} value={ov.widthPct}
          onChange={(e) => onChange({ widthPct: parseInt(e.target.value) })} className="w-full" />
      </label>
      <label className="text-[10px] text-muted-foreground block">
        Opacity ({Math.round(ov.opacity * 100)}%)
        <input type="range" min={10} max={100} value={Math.round(ov.opacity * 100)}
          onChange={(e) => onChange({ opacity: parseInt(e.target.value) / 100 })} className="w-full" />
      </label>
      <label className="flex items-center gap-2 text-[11px]">
        <input type="checkbox" checked={ov.rounded} onChange={(e) => onChange({ rounded: e.target.checked })} />
        Circular mask
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] text-muted-foreground">
          X ({Math.round(ov.xPct)}%)
          <input type="range" min={0} max={100} value={ov.xPct} onChange={(e) => onChange({ xPct: parseInt(e.target.value) })} className="w-full" />
        </label>
        <label className="text-[10px] text-muted-foreground">
          Y ({Math.round(ov.yPct)}%)
          <input type="range" min={0} max={100} value={ov.yPct} onChange={(e) => onChange({ yPct: parseInt(e.target.value) })} className="w-full" />
        </label>
      </div>
    </div>
  );
}
