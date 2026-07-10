import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import {
  Loader2, Wand2, Download, RefreshCw, Trash2, Sparkles,
  Layers as LayersIcon, Type as TypeIcon, Image as ImageIcon, Eye, EyeOff,
} from "lucide-react";
import { deductUsage, useAccess, canGenerate } from "@/lib/access";
import { useQueryClient } from "@tanstack/react-query";
import {
  planThumbnails, THUMBNAIL_STYLE_PRESETS, findStylePreset, rerollHeadline,
  type ThumbnailConcept, type ThumbnailPlan, type ThumbnailStyleId, type TextPlacement,
} from "@/lib/thumbnail-director";
import { renderConcept, regenerateLayer, type RenderedThumbnail } from "@/lib/thumbnail-agents";
import { saveGeneratedThumbnail, getGeneratedThumbnails, deleteGeneratedThumbnail, loadThumbnailImageURL, type LocalThumbnail } from "@/lib/thumbnailLocalStore";
import { ProjectsSection } from "@/components/projects-section";

export const Route = createFileRoute("/_authenticated/thumbnails")({
  head: () => ({
    meta: [
      { title: "AI Thumbnail Studio — CreatorVaultAI" },
      { name: "description", content: "Generate professional layered YouTube thumbnails with high-CTR composition, cinematic backgrounds, and editable text." },
    ],
  }),
  component: ThumbnailsPage,
});

type Rendered = Record<string, RenderedThumbnail | undefined>;

function ThumbnailsPage() {
  const [topic, setTopic] = useState("");
  const [styleId, setStyleId] = useState<ThumbnailStyleId>("mrbeast");
  const [plan, setPlan] = useState<ThumbnailPlan | null>(null);
  const [rendered, setRendered] = useState<Rendered>({});
  const [busyConcept, setBusyConcept] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [library, setLibrary] = useState<LocalThumbnail[]>([]);
  const [libraryUrls, setLibraryUrls] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const { data: access } = useAccess();

  useEffect(() => { void refreshLibrary(); }, []);
  async function refreshLibrary() {
    const items = await getGeneratedThumbnails();
    setLibrary(items);
    const urls: Record<string, string> = {};
    for (const t of items) {
      const u = await loadThumbnailImageURL(t);
      if (u) urls[t.id] = u;
    }
    setLibraryUrls(urls);
  }

  const selectedConcept = useMemo(() => plan?.concepts.find((c) => c.id === selectedId) ?? null, [plan, selectedId]);
  const selectedRender  = useMemo(() => selectedId ? rendered[selectedId] : undefined, [selectedId, rendered]);

  async function analyze() {
    if (!topic.trim()) { toast.error("Enter a video topic"); return; }
    const p = planThumbnails(topic);
    // Apply user-picked base style to every concept as an initial nudge.
    const preset = findStylePreset(styleId);
    for (const c of p.concepts) {
      // Keep concept identity (Fear/Curiosity/Doc/Minimal) but recolor with user's chosen style.
      c.style = preset;
      c.textStyle = preset.textStyle;
      c.colorGrade = preset.colorGrade;
    }
    setPlan(p);
    setRendered({});
    setSelectedId(p.concepts[0].id);
    toast.success(`Planned 4 thumbnail concepts · detected emotion: ${p.detectedEmotion}`);
  }

  async function generateAll() {
    if (!plan) return;
    if (access && !canGenerate(access, 8)) { toast.error("Not enough credits (~2 per concept)"); return; }
    for (const c of plan.concepts) { await generateOne(c); }
  }

  async function generateOne(concept: ThumbnailConcept) {
    setBusyConcept(concept.id);
    setProgress((p) => ({ ...p, [concept.id]: "Generating background…" }));
    try {
      const r = await renderConcept(concept, (evt) => {
        setProgress((p) => ({
          ...p,
          [concept.id]:
            evt.step === "background" ? (evt.ok ? "Background ✓" : "Generating background…") :
            evt.step === "subject"    ? (evt.ok ? "Subject ✓"    : "Generating subject…") :
            evt.step === "secondary"  ? (evt.ok ? "Secondary ✓"  : "Generating secondary…") :
                                        "Done",
        }));
      });
      setRendered((prev) => ({ ...prev, [concept.id]: r }));
      const layers = [r.background, r.subject, r.secondary].filter(Boolean).length;
      await deductUsage({ amount: layers, description: `Thumbnail layers (${concept.label})` }).catch(() => {});
      qc.invalidateQueries({ queryKey: ["access"] });
      if (r.errors.length) toast.warning(`${concept.label}: ${r.errors.join(", ")}`);
      else toast.success(`${concept.label} rendered`);
    } finally {
      setBusyConcept(null);
      setProgress((p) => ({ ...p, [concept.id]: "" }));
    }
  }

  async function regenerate(concept: ThumbnailConcept, layer: "background" | "subject" | "secondary") {
    setBusyConcept(concept.id);
    try {
      const url = await regenerateLayer(concept, layer);
      if (!url) { toast.error(`Couldn't regenerate ${layer}`); return; }
      setRendered((prev) => {
        const cur = prev[concept.id] ?? { concept, background: null, subject: null, secondary: null, errors: [] };
        return { ...prev, [concept.id]: { ...cur, [layer]: url } };
      });
      await deductUsage({ amount: 1, description: `Thumbnail layer regenerated (${layer})` }).catch(() => {});
      qc.invalidateQueries({ queryKey: ["access"] });
    } finally {
      setBusyConcept(null);
    }
  }

  function updateConcept(update: Partial<ThumbnailConcept>) {
    if (!plan || !selectedConcept) return;
    const next = plan.concepts.map((c) => c.id === selectedConcept.id ? { ...c, ...update } : c);
    setPlan({ ...plan, concepts: next });
  }

  function toggleLayer(key: string) {
    if (!selectedConcept) return;
    updateConcept({
      layers: selectedConcept.layers.map((l) => l.key === key ? { ...l, visible: !l.visible } : l),
    });
  }

  const exportRef = useRef<HTMLDivElement | null>(null);
  async function exportPng() {
    if (!exportRef.current || !selectedConcept) return;
    try {
      const dataUrl = await toPng(exportRef.current, { pixelRatio: 1, cacheBust: true, width: 1280, height: 720 });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `thumbnail-${selectedConcept.label.toLowerCase()}-${Date.now()}.png`;
      a.click();
      toast.success("PNG downloaded (1280×720)");
    } catch (e) {
      toast.error("Export failed");
      console.warn(e);
    }
  }

  async function saveToLibrary() {
    if (!exportRef.current || !selectedConcept) return;
    try {
      const dataUrl = await toPng(exportRef.current, { pixelRatio: 1, cacheBust: true, width: 1280, height: 720 });
      await saveGeneratedThumbnail({
        title: topic || selectedConcept.headline,
        concept: selectedConcept.label,
        headline: selectedConcept.headline,
        niche: null,
        topic,
        styleId: selectedConcept.style.id,
        styleLabel: selectedConcept.style.label,
        image: dataUrl,
      });
      await refreshLibrary();
      toast.success("Saved to your library");
    } catch (e) {
      console.warn(e);
      toast.error("Couldn't save");
    }
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold">
          AI <span className="gradient-text">Thumbnail Studio</span>
        </h1>
        <p className="text-muted-foreground mt-1">
          Layered, high-CTR YouTube thumbnails. Cinematic background + transparent subjects + editable text overlay — exported at 1280×720.
        </p>
      </div>

      {/* Input */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <textarea rows={2} value={topic} onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. The Last Human Employee: The Day Work Disappeared Forever"
          className="w-full bg-input/50 border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-[color:var(--neon-purple)]" />

        <div>
          <div className="text-sm text-muted-foreground mb-2">Base thumbnail style</div>
          <div className="flex flex-wrap gap-2">
            {THUMBNAIL_STYLE_PRESETS.map((s) => (
              <button key={s.id} onClick={() => setStyleId(s.id)}
                className={`px-3 py-1.5 rounded-full text-xs border transition ${styleId === s.id ? "gradient-primary text-white border-transparent" : "glass border-border hover:border-white/20"}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          <button onClick={analyze}
            className="rounded-lg glass border border-border px-4 py-2.5 text-sm font-medium flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Plan 4 concepts
          </button>
          <button onClick={generateAll} disabled={!plan}
            className="rounded-lg gradient-primary text-white px-6 py-2.5 text-sm font-medium flex items-center gap-2 shadow-[var(--shadow-glow)] disabled:opacity-40">
            <Wand2 className="w-4 h-4" /> Generate all layers
          </button>
        </div>
      </div>

      <ProjectsSection
        contentTypes={["thumbnail"]}
        title="Your thumbnail projects"
        cacheKey="thumbnails"
        showStatusFilter
      />

      {/* Concept grid */}
      {plan && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {plan.concepts.map((c) => {
            const r = rendered[c.id];
            const active = selectedId === c.id;
            return (
              <button key={c.id} onClick={() => setSelectedId(c.id)}
                className={`text-left glass rounded-xl overflow-hidden border transition ${active ? "border-[color:var(--neon-purple)] ring-2 ring-[color:var(--neon-purple)]/40" : "border-border hover:border-white/20"}`}>
                <div className="aspect-video relative bg-black/40">
                  {r?.background ? (
                    <ThumbnailPreview concept={c} rendered={r} miniature />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                      {busyConcept === c.id ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> {progress[c.id] || "…"}</> : "Not rendered"}
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">{c.label}</div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full glass border border-border">CTR {c.ctrScore}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{c.reasoning}</div>
                  <button onClick={(e) => { e.stopPropagation(); void generateOne(c); }} disabled={busyConcept !== null}
                    className="mt-3 w-full rounded-lg glass border border-border py-1.5 text-xs flex items-center justify-center gap-1 disabled:opacity-40">
                    {busyConcept === c.id ? <><Loader2 className="w-3 h-3 animate-spin" /> {progress[c.id] || "Working…"}</> : <><RefreshCw className="w-3 h-3" /> {r ? "Regenerate" : "Generate"}</>}
                  </button>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Editor + preview */}
      {selectedConcept && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <div className="glass rounded-2xl p-4 space-y-4">
            <div className="rounded-xl overflow-hidden bg-black flex items-center justify-center" style={{ aspectRatio: "16 / 9" }}>
              <div ref={exportRef} style={{ width: 1280, height: 720, transform: "scale(min(1, calc((100vw - 380px) / 1280)))", transformOrigin: "top left" }}>
                <ThumbnailPreview concept={selectedConcept} rendered={selectedRender} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <button onClick={saveToLibrary} disabled={!selectedRender?.background}
                className="rounded-lg glass border border-border px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-40">
                <ImageIcon className="w-4 h-4" /> Save to library
              </button>
              <button onClick={exportPng} disabled={!selectedRender?.background}
                className="rounded-lg gradient-primary text-white px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-40">
                <Download className="w-4 h-4" /> Download PNG 1280×720
              </button>
            </div>
          </div>

          <div className="glass rounded-2xl p-4 space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-2"><TypeIcon className="w-3 h-3" /> Headline (2–5 words)</div>
              <input value={selectedConcept.headline}
                onChange={(e) => updateConcept({ headline: e.target.value.toUpperCase().slice(0, 40) })}
                className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 text-sm" />
              <button onClick={() => updateConcept({ headline: rerollHeadline(selectedConcept) })}
                className="mt-2 text-xs text-muted-foreground hover:text-white flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> Reroll headline
              </button>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Text placement</div>
              <div className="grid grid-cols-3 gap-1">
                {(["top-left","top-right","center","bottom-left","bottom-right"] as TextPlacement[]).map((p) => (
                  <button key={p} onClick={() => updateConcept({ textPlacement: p })}
                    className={`text-[11px] px-2 py-1.5 rounded border ${selectedConcept.textPlacement === p ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Text color</div>
              <div className="flex gap-1">
                {["#FFD400","#FFFFFF","#EF3340","#FF7A18","#22D3EE","#0B0B0F"].map((c) => (
                  <button key={c} onClick={() => updateConcept({ textStyle: { ...selectedConcept.textStyle, color: c } })}
                    className={`w-8 h-8 rounded border-2 ${selectedConcept.textStyle.color === c ? "border-white" : "border-transparent"}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-2"><LayersIcon className="w-3 h-3" /> Layers</div>
              <div className="space-y-1">
                {selectedConcept.layers.map((l) => (
                  <div key={l.key} className="flex items-center justify-between text-xs">
                    <button onClick={() => toggleLayer(l.key)} className="flex items-center gap-2 hover:text-white text-muted-foreground">
                      {l.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      <span className={l.visible ? "text-white" : ""}>{l.label}</span>
                    </button>
                    {(l.key === "background" || l.key === "subject" || l.key === "secondary") && selectedRender && (
                      <button onClick={() => regenerate(selectedConcept, l.key as "background" | "subject" | "secondary")} disabled={busyConcept !== null}
                        className="text-[10px] text-muted-foreground hover:text-white flex items-center gap-1 disabled:opacity-40">
                        <RefreshCw className="w-3 h-3" /> re-gen
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Library */}
      {library.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Your saved thumbnails</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {library.map((t) => (
              <div key={t.id} className="glass rounded-xl overflow-hidden">
                <div className="aspect-video bg-black">
                  {libraryUrls[t.id] && <img src={libraryUrls[t.id]} alt={t.headline} className="w-full h-full object-cover" />}
                </div>
                <div className="p-3">
                  <div className="text-xs font-semibold line-clamp-1">{t.headline}</div>
                  <div className="text-[11px] text-muted-foreground line-clamp-1">{t.styleLabel}</div>
                  <div className="mt-2 flex gap-1.5">
                    {libraryUrls[t.id] && (
                      <a href={libraryUrls[t.id]} download={`thumbnail-${t.id}.${t.extension}`}
                        className="flex-1 rounded-lg gradient-primary text-white py-1.5 text-xs flex items-center justify-center gap-1"><Download className="w-3 h-3" /> Download</a>
                    )}
                    <button onClick={async () => { await deleteGeneratedThumbnail(t.id); await refreshLibrary(); }}
                      className="rounded-lg glass border border-border hover:bg-rose-500/20 text-rose-300 py-1.5 px-2 text-xs">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** The layered composite renderer — used for both the preview and the PNG export. */
function ThumbnailPreview({
  concept, rendered, miniature = false,
}: { concept: ThumbnailConcept; rendered?: RenderedThumbnail; miniature?: boolean }) {
  const layers = Object.fromEntries(concept.layers.map((l) => [l.key, l.visible]));
  const placement = concept.textPlacement;
  const grade = concept.colorGrade;
  const text = concept.textStyle;

  const placementStyle: Record<TextPlacement, React.CSSProperties> = {
    "top-left":     { top: "6%",  left: "5%",   textAlign: "left",   maxWidth: "55%" },
    "top-right":    { top: "6%",  right: "5%",  textAlign: "right",  maxWidth: "55%" },
    "bottom-left":  { bottom: "6%",left: "5%",  textAlign: "left",   maxWidth: "60%" },
    "bottom-right": { bottom: "6%",right: "5%", textAlign: "right",  maxWidth: "60%" },
    "center":       { top: "50%", left: "50%",  transform: "translate(-50%, -50%)", textAlign: "center", maxWidth: "80%" },
  };

  const fontStack: Record<string, string> = {
    Impact: "'Impact','Anton','Bebas Neue','Arial Black',sans-serif",
    Bebas:  "'Bebas Neue','Impact','Arial Black',sans-serif",
    Anton:  "'Anton','Impact','Arial Black',sans-serif",
    Inter:  "'Inter','Helvetica Neue','Arial',sans-serif",
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#000" }}>
      {/* Background layer */}
      {layers.background && rendered?.background && (
        <img src={rendered.background} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: `saturate(${1 + grade.saturation * 0.4}) contrast(${1 + grade.contrast * 0.3})` }} />
      )}

      {/* Secondary subject */}
      {layers.secondary && rendered?.secondary && (
        <img src={rendered.secondary} alt="" style={{ position: "absolute", left: "3%", bottom: "5%", height: "55%", filter: "drop-shadow(0 20px 30px rgba(0,0,0,0.7))" }} />
      )}

      {/* Main subject */}
      {layers.subject && rendered?.subject && (
        <img src={rendered.subject} alt="" style={{ position: "absolute", right: placement.includes("left") ? "5%" : "auto", left: placement.includes("left") ? "auto" : placement === "center" ? "50%" : "5%", bottom: 0, transform: placement === "center" ? "translateX(-50%)" : "none", height: "92%", filter: "drop-shadow(0 30px 40px rgba(0,0,0,0.85))" }} />
      )}

      {/* Lighting overlay (rim) */}
      {layers.lighting && (
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 30% 40%, ${grade.primary}22 0%, transparent 60%)`, mixBlendMode: "screen", pointerEvents: "none" }} />
      )}

      {/* Effects: soft vignette / particles */}
      {layers.effects && (
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${0.15 + grade.vignette * 0.5}) 100%)`, pointerEvents: "none" }} />
      )}

      {/* Color grade overlay */}
      {layers.grade && (
        <div style={{ position: "absolute", inset: 0, background: grade.overlay, mixBlendMode: "overlay", pointerEvents: "none" }} />
      )}

      {/* Glow behind text */}
      {layers.glow && layers.text && (
        <div style={{ position: "absolute", ...placementStyle[placement], pointerEvents: "none", filter: `blur(${miniature ? 20 : 40}px)`, opacity: 0.6 }}>
          <div style={{ fontFamily: fontStack[text.fontFamily], fontWeight: text.fontWeight, color: text.color, fontSize: miniature ? "3.2vw" : "104px", lineHeight: 0.95, letterSpacing: "-0.02em" }}>
            {concept.headline}
          </div>
        </div>
      )}

      {/* Title text */}
      {layers.text && (
        <div style={{ position: "absolute", ...placementStyle[placement] }}>
          <div style={{
            fontFamily: fontStack[text.fontFamily],
            fontWeight: text.fontWeight,
            fontStyle: text.italic ? "italic" : "normal",
            color: text.color,
            textTransform: text.transform,
            fontSize: miniature ? "3.2vw" : "104px",
            lineHeight: 0.92,
            letterSpacing: "-0.02em",
            WebkitTextStroke: `${miniature ? 2 : 6}px ${text.outline}`,
            textShadow: `0 ${miniature ? 3 : 8}px ${miniature ? 8 : 20}px ${text.glow}, 0 0 ${miniature ? 6 : 24}px ${text.glow}`,
            paintOrder: "stroke fill",
          }}>
            {concept.headline}
          </div>
        </div>
      )}

      {/* Final sharpen — CSS contrast pass */}
      {layers.sharpen && (
        <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 120px rgba(0,0,0,0.4)", pointerEvents: "none" }} />
      )}
    </div>
  );
}
