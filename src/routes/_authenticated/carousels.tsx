import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { STYLES } from "@/lib/constants";
import {
  Plus, Layers, Loader2, Sparkles, Download, ChevronLeft, ChevronRight, X,
  Settings2, AlertTriangle, RefreshCw, FileArchive, FileText, Trash2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/carousels")({
  head: () => ({
    meta: [
      { title: "Carousels — CreatorVaultAI" },
      { name: "description", content: "Generate multi-slide Instagram carousels from your project prompts." },
      { property: "og:title", content: "Carousels — CreatorVaultAI" },
      { property: "og:description", content: "Generate multi-slide Instagram carousels from your project prompts." },
    ],
  }),
  component: CarouselsPage,
});

type Prompt = { n: number; prompt: string; style: string };
type SlideDiag = { at: string; ok: boolean; durationMs: number; httpStatus?: number; error?: string };
type SlideDiagMap = Record<string, SlideDiag>;
type LayoutSettings = { ratio: "1:1" | "4:5" | "9:16"; slideCount: number; spacing: number };

type CarouselRow = {
  id: string;
  title: string;
  style: string | null;
  platform: string | null;
  tone: string | null;
  output_id: string | null;
  image_prompts: Prompt[];
  carousel_images: (string | null)[] | null;
  slide_diagnostics: SlideDiagMap;
};

const RATIOS: LayoutSettings["ratio"][] = ["1:1", "4:5", "9:16"];
const ASPECT_CLASS: Record<LayoutSettings["ratio"], string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "9:16": "aspect-[9/16]",
};

function CarouselsPage() {
  const qc = useQueryClient();
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [slideRetryId, setSlideRetryId] = useState<string | null>(null); // `${rowId}:${idx}`
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [viewer, setViewer] = useState<{ images: (string | null)[]; idx: number; title: string } | null>(null);
  const [editorFor, setEditorFor] = useState<string | null>(null);
  const [layout, setLayout] = useState<Record<string, LayoutSettings>>({});
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["carousels"],
    queryFn: async (): Promise<CarouselRow[]> => {
      const { data } = await supabase
        .from("projects")
        .select("id,title,style,platform,tone,generated_outputs(id,image_prompts,carousel_images,render_diagnostics)")
        .eq("content_type", "carousel")
        .order("created_at", { ascending: false });
      return (data ?? []).map((p: {
        id: string; title: string; style: string | null; platform: string | null; tone: string | null;
        generated_outputs:
          | { id: string; image_prompts: unknown; carousel_images: unknown; render_diagnostics: unknown }[]
          | { id: string; image_prompts: unknown; carousel_images: unknown; render_diagnostics: unknown }
          | null;
      }) => {
        const out = Array.isArray(p.generated_outputs) ? p.generated_outputs[0] : p.generated_outputs;
        const rd = out?.render_diagnostics as { slide_diagnostics?: SlideDiagMap } | null | undefined;
        return {
          id: p.id, title: p.title, style: p.style, platform: p.platform, tone: p.tone,
          output_id: out?.id ?? null,
          image_prompts: Array.isArray(out?.image_prompts) ? (out!.image_prompts as Prompt[]) : [],
          carousel_images: Array.isArray(out?.carousel_images) ? (out!.carousel_images as (string | null)[]) : null,
          slide_diagnostics: (rd?.slide_diagnostics ?? {}) as SlideDiagMap,
        };
      });
    },
  });

  function getLayout(row: CarouselRow): LayoutSettings {
    return layout[row.id] ?? { ratio: "1:1", slideCount: row.image_prompts.length, spacing: 8 };
  }
  function updateLayout(rowId: string, patch: Partial<LayoutSettings>) {
    setLayout((prev) => ({ ...prev, [rowId]: { ...(prev[rowId] ?? { ratio: "1:1", slideCount: 5, spacing: 8 }), ...patch } }));
  }

  async function generateOneSlide(
    prompt: Prompt, styleLabel: string, ratio: string,
  ): Promise<{ image: string | null; diag: SlideDiag }> {
    const start = Date.now();
    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.prompt, style: styleLabel, ratio }),
      });
      const j = (await res.json().catch(() => ({}))) as { image?: string; error?: string };
      if (!res.ok || !j.image) {
        return {
          image: null,
          diag: { at: new Date().toISOString(), ok: false, durationMs: Date.now() - start, httpStatus: res.status, error: j.error ?? `HTTP ${res.status}` },
        };
      }
      return { image: j.image, diag: { at: new Date().toISOString(), ok: true, durationMs: Date.now() - start, httpStatus: res.status } };
    } catch (e) {
      return {
        image: null,
        diag: { at: new Date().toISOString(), ok: false, durationMs: Date.now() - start, error: e instanceof Error ? e.message : "Network error" },
      };
    }
  }

  async function persistSlides(row: CarouselRow, images: (string | null)[], slideDiag: SlideDiagMap) {
    if (!row.output_id) return;
    const { error } = await supabase
      .from("generated_outputs")
      .update({
        carousel_images: images as never,
        render_diagnostics: { slide_diagnostics: slideDiag } as never,
      } as never)
      .eq("id", row.output_id);
    if (error) throw error;
  }

  async function generateSlides(row: CarouselRow) {
    if (!row.output_id) return toast.error("This project has no saved output yet.");
    if (row.image_prompts.length === 0) return toast.error("No image prompts on this carousel.");
    const styleLabel = STYLES.find((s) => s.id === (row.style ?? ""))?.label ?? row.style ?? "cinematic";
    const cfg = getLayout(row);
    const slice = row.image_prompts.slice(0, Math.max(1, Math.min(cfg.slideCount, row.image_prompts.length)));
    setGeneratingId(row.id);
    setProgress({ done: 0, total: slice.length });
    try {
      const results: (string | null)[] = new Array(slice.length).fill(null);
      const diag: SlideDiagMap = {};
      let done = 0;
      await Promise.all(
        slice.map(async (p, i) => {
          const r = await generateOneSlide(p, styleLabel, cfg.ratio);
          results[i] = r.image;
          diag[String(i)] = r.diag;
          done += 1;
          setProgress({ done, total: slice.length });
        }),
      );
      await persistSlides(row, results, diag);
      const okCount = results.filter(Boolean).length;
      toast[okCount === slice.length ? "success" : "warning"](`${okCount}/${slice.length} slides generated`);
      qc.invalidateQueries({ queryKey: ["carousels"] });
      qc.invalidateQueries({ queryKey: ["project", row.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Slide generation failed");
    } finally {
      setGeneratingId(null);
      setProgress(null);
    }
  }

  async function retrySlide(row: CarouselRow, idx: number) {
    const prompt = row.image_prompts[idx];
    if (!prompt) return;
    const styleLabel = STYLES.find((s) => s.id === (row.style ?? ""))?.label ?? row.style ?? "cinematic";
    const cfg = getLayout(row);
    const key = `${row.id}:${idx}`;
    setSlideRetryId(key);
    try {
      const r = await generateOneSlide(prompt, styleLabel, cfg.ratio);
      const nextImages = [...(row.carousel_images ?? new Array(row.image_prompts.length).fill(null))];
      nextImages[idx] = r.image;
      const nextDiag: SlideDiagMap = { ...row.slide_diagnostics, [String(idx)]: r.diag };
      await persistSlides(row, nextImages, nextDiag);
      if (r.image) toast.success(`Slide ${idx + 1} re-generated`);
      else toast.error(`Slide ${idx + 1} failed: ${r.diag.error ?? "unknown"}`);
      qc.invalidateQueries({ queryKey: ["carousels"] });
    } finally {
      setSlideRetryId(null);
    }
  }

  async function exportZip(row: CarouselRow) {
    const slides = (row.carousel_images ?? []).filter(Boolean) as string[];
    if (slides.length === 0) return toast.error("Generate slides first");
    setExportingId(row.id);
    try {
      const zip = new JSZip();
      slides.forEach((src, i) => {
        const base64 = src.replace(/^data:image\/\w+;base64,/, "");
        zip.file(`slide-${String(i + 1).padStart(2, "0")}.png`, base64, { base64: true });
      });
      const blob = await zip.generateAsync({ type: "blob" });
      triggerDownload(blob, `${slugify(row.title)}-carousel.zip`);
      toast.success(`ZIP with ${slides.length} slides downloaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ZIP export failed");
    } finally {
      setExportingId(null);
    }
  }

  async function exportPdf(row: CarouselRow) {
    const slides = (row.carousel_images ?? []).filter(Boolean) as string[];
    if (slides.length === 0) return toast.error("Generate slides first");
    const cfg = getLayout(row);
    setExportingId(row.id);
    try {
      const dims = cfg.ratio === "9:16" ? { w: 1080, h: 1920 } : cfg.ratio === "4:5" ? { w: 1080, h: 1350 } : { w: 1080, h: 1080 };
      const pdf = new jsPDF({ orientation: dims.w > dims.h ? "landscape" : "portrait", unit: "px", format: [dims.w, dims.h] });
      for (let i = 0; i < slides.length; i++) {
        if (i > 0) pdf.addPage([dims.w, dims.h], dims.w > dims.h ? "landscape" : "portrait");
        pdf.addImage(slides[i], "PNG", 0, 0, dims.w, dims.h, undefined, "FAST");
      }
      pdf.save(`${slugify(row.title)}-carousel.pdf`);
      toast.success(`PDF with ${slides.length} slides downloaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF export failed");
    } finally {
      setExportingId(null);
    }
  }

  async function deleteCarousel(row: CarouselRow) {
    if (!confirm(`Delete "${row.title}" and all its slides? This cannot be undone.`)) return;
    setDeletingId(row.id);
    try {
      // Cascade: delete outputs first (FK), then project.
      if (row.output_id) {
        await supabase.from("generated_outputs").delete().eq("id", row.output_id);
      }
      const { error } = await supabase.from("projects").delete().eq("id", row.id);
      if (error) throw error;
      toast.success("Carousel deleted");
      qc.invalidateQueries({ queryKey: ["carousels"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">Your <span className="gradient-text">Carousels</span></h1>
          <p className="text-muted-foreground mt-1">Multi-slide Instagram carousels with layout editor, per-slide retry, and export.</p>
        </div>
        <Link to="/create" className="rounded-lg gradient-primary text-white px-4 py-2.5 text-sm font-medium flex items-center gap-2">
          <Plus className="w-4 h-4" /> New carousel
        </Link>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="glass rounded-xl h-80 animate-pulse" />)}
        </div>
      ) : data && data.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-4">
          {data.map((row) => {
            const generating = generatingId === row.id;
            const slides = row.carousel_images ?? [];
            const failedCount = Object.values(row.slide_diagnostics).filter((d) => !d.ok).length;
            const cfg = getLayout(row);
            const isEditorOpen = editorFor === row.id;

            return (
              <div key={row.id} className="glass rounded-2xl overflow-hidden">
                <div className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to="/projects/$id" params={{ id: row.id }} className="font-semibold line-clamp-2 hover:text-white">
                      {row.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                      <span className="glass px-2 py-0.5 rounded">{row.image_prompts.length} prompts</span>
                      <span className="glass px-2 py-0.5 rounded">{cfg.ratio}</span>
                      {failedCount > 0 && (
                        <span className="bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> {failedCount} failed
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 items-end">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setEditorFor(isEditorOpen ? null : row.id)}
                        className="rounded-lg glass hover:bg-white/5 border border-border px-2.5 py-2 text-xs flex items-center gap-1.5"
                        title="Layout editor"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteCarousel(row)}
                        disabled={deletingId === row.id}
                        className="rounded-lg glass hover:bg-rose-500/20 border border-border px-2.5 py-2 text-xs flex items-center gap-1.5 text-rose-300 disabled:opacity-50"
                        title="Delete carousel"
                      >
                        {deletingId === row.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <button
                      onClick={() => generateSlides(row)}
                      disabled={generating || row.image_prompts.length === 0}
                      className="rounded-lg gradient-primary text-white px-3 py-2 text-xs font-medium flex items-center gap-1.5 shadow-[var(--shadow-glow)] disabled:opacity-50"
                    >
                      {generating
                        ? <><Loader2 className="w-3 h-3 animate-spin" /> {progress?.done ?? 0}/{progress?.total ?? cfg.slideCount}</>
                        : <><Sparkles className="w-3 h-3" /> {slides.length ? "Regenerate" : "Generate slides"}</>}
                    </button>
                  </div>
                </div>

                {isEditorOpen && (
                  <div className="mx-4 mb-4 rounded-lg border border-border bg-black/40 p-3 space-y-3">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Layout editor</div>
                    <div className="flex flex-wrap gap-3">
                      <div>
                        <div className="text-[10px] text-muted-foreground mb-1">Aspect ratio</div>
                        <div className="flex gap-1">
                          {RATIOS.map((r) => (
                            <button
                              key={r}
                              onClick={() => updateLayout(row.id, { ratio: r })}
                              className={`px-2.5 py-1 rounded text-xs border ${cfg.ratio === r ? "gradient-primary text-white border-transparent" : "glass border-border"}`}
                            >{r}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground mb-1">Slide count ({cfg.slideCount})</div>
                        <input
                          type="range"
                          min={1}
                          max={row.image_prompts.length}
                          value={cfg.slideCount}
                          onChange={(e) => updateLayout(row.id, { slideCount: parseInt(e.target.value) })}
                          className="w-32"
                        />
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground mb-1">Preview spacing ({cfg.spacing}px)</div>
                        <input
                          type="range"
                          min={0}
                          max={24}
                          value={cfg.spacing}
                          onChange={(e) => updateLayout(row.id, { spacing: parseInt(e.target.value) })}
                          className="w-32"
                        />
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Layout settings apply to the next generation and to exports below.
                    </div>
                  </div>
                )}

                {slides.length > 0 ? (
                  <div className="px-4 pb-4 space-y-3">
                    <div
                      className="flex overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1"
                      style={{ gap: `${cfg.spacing}px` }}
                    >
                      {slides.map((src, i) => {
                        const diag = row.slide_diagnostics[String(i)];
                        const failed = !src || (diag && !diag.ok);
                        const isRetrying = slideRetryId === `${row.id}:${i}`;
                        return (
                          <div key={i} className={`shrink-0 w-40 snap-start ${ASPECT_CLASS[cfg.ratio]} relative rounded-lg overflow-hidden border ${failed ? "border-rose-500/60" : "border-border"}`}>
                            {src ? (
                              <button onClick={() => setViewer({ images: slides, idx: i, title: row.title })} className="absolute inset-0">
                                <img src={src} alt={`Slide ${i + 1}`} className="absolute inset-0 w-full h-full object-cover" />
                              </button>
                            ) : (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-500/10 p-2 text-center">
                                <AlertTriangle className="w-4 h-4 text-rose-400" />
                                <div className="mt-1 text-[9px] text-rose-300 line-clamp-3">
                                  {diag?.error ?? "Not generated"}
                                </div>
                              </div>
                            )}
                            <span className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-white font-medium">
                              {i + 1}/{slides.length}
                            </span>
                            {failed && (
                              <button
                                onClick={() => retrySlide(row, i)}
                                disabled={isRetrying}
                                className="absolute bottom-1.5 right-1.5 rounded-md bg-black/80 hover:bg-black text-white p-1"
                                title={diag?.error ?? "Retry this slide"}
                              >
                                {isRetrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => exportZip(row)}
                        disabled={exportingId === row.id}
                        className="rounded-lg glass border border-border px-3 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {exportingId === row.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileArchive className="w-3 h-3" />}
                        Export ZIP
                      </button>
                      <button
                        onClick={() => exportPdf(row)}
                        disabled={exportingId === row.id}
                        className="rounded-lg glass border border-border px-3 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {exportingId === row.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                        Export PDF
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mx-4 mb-4 rounded-lg border border-dashed border-border py-10 text-center text-xs text-muted-foreground">
                    {generating
                      ? <>Generating slide {progress?.done ?? 0} of {progress?.total ?? cfg.slideCount}…</>
                      : <>No slides generated yet. Adjust layout above then click <span className="text-white">Generate slides</span>.</>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass rounded-2xl p-12 text-center">
          <Layers className="w-10 h-10 mx-auto text-muted-foreground" />
          <h3 className="mt-3 font-semibold">No carousels yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Create a carousel project to generate multi-slide posts.</p>
          <Link to="/create" className="mt-5 inline-flex rounded-lg gradient-primary px-5 py-2.5 text-sm text-white font-medium">
            <Plus className="w-4 h-4 mr-2" /> New carousel
          </Link>
        </div>
      )}

      {viewer && viewer.images[viewer.idx] && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setViewer(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setViewer(null); }}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          ><X className="w-5 h-5" /></button>
          {viewer.idx > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setViewer((v) => v && { ...v, idx: v.idx - 1 }); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            ><ChevronLeft className="w-6 h-6" /></button>
          )}
          {viewer.idx < viewer.images.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setViewer((v) => v && { ...v, idx: v.idx + 1 }); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            ><ChevronRight className="w-6 h-6" /></button>
          )}
          <div className="max-w-[92vw] max-h-[92vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <img src={viewer.images[viewer.idx]!} alt={`Slide ${viewer.idx + 1}`} className="max-w-[92vw] max-h-[80vh] object-contain rounded-lg shadow-2xl" />
            <div className="text-xs text-white/70">{viewer.title} · Slide {viewer.idx + 1}/{viewer.images.length}</div>
            <a href={viewer.images[viewer.idx]!} download={`slide-${viewer.idx + 1}.png`} onClick={(e) => e.stopPropagation()}
              className="rounded-lg gradient-primary text-white px-4 py-2 text-xs font-medium flex items-center gap-2">
              <Download className="w-3 h-3" /> Download slide
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "carousel";
}
function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
