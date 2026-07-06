import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { STYLES } from "@/lib/constants";
import { Plus, Layers, Loader2, Sparkles, Download, ChevronLeft, ChevronRight, X } from "lucide-react";

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
type CarouselRow = {
  id: string;
  title: string;
  style: string | null;
  platform: string | null;
  tone: string | null;
  output_id: string | null;
  image_prompts: Prompt[];
  carousel_images: string[] | null;
};

function CarouselsPage() {
  const qc = useQueryClient();
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [viewer, setViewer] = useState<{ images: string[]; idx: number; title: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["carousels"],
    queryFn: async (): Promise<CarouselRow[]> => {
      const { data } = await supabase
        .from("projects")
        .select("id,title,style,platform,tone,generated_outputs(id,image_prompts,carousel_images)")
        .eq("content_type", "carousel")
        .order("created_at", { ascending: false });
      return (data ?? []).map((p: {
        id: string; title: string; style: string | null; platform: string | null; tone: string | null;
        generated_outputs:
          | { id: string; image_prompts: unknown; carousel_images: unknown }[]
          | { id: string; image_prompts: unknown; carousel_images: unknown }
          | null;
      }) => {
        const out = Array.isArray(p.generated_outputs) ? p.generated_outputs[0] : p.generated_outputs;
        return {
          id: p.id, title: p.title, style: p.style, platform: p.platform, tone: p.tone,
          output_id: out?.id ?? null,
          image_prompts: Array.isArray(out?.image_prompts) ? (out!.image_prompts as Prompt[]) : [],
          carousel_images: Array.isArray(out?.carousel_images) ? (out!.carousel_images as string[]) : null,
        };
      });
    },
  });

  async function generateSlides(row: CarouselRow) {
    if (!row.output_id) return toast.error("This project has no saved output yet.");
    if (row.image_prompts.length === 0) return toast.error("No image prompts on this carousel.");
    const styleLabel = STYLES.find((s) => s.id === (row.style ?? ""))?.label ?? row.style ?? "cinematic";
    setGeneratingId(row.id);
    setProgress({ done: 0, total: row.image_prompts.length });
    try {
      const images: string[] = [];
      let done = 0;
      // Fetch in parallel; report as each lands.
      const settled = await Promise.allSettled(
        row.image_prompts.map((p) =>
          fetch("/api/generate-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: p.prompt, style: styleLabel, ratio: "1:1" }),
          }).then(async (res) => {
            const j = (await res.json().catch(() => ({}))) as { image?: string; error?: string };
            if (!res.ok || !j.image) throw new Error(j.error ?? `HTTP ${res.status}`);
            done += 1;
            setProgress({ done, total: row.image_prompts.length });
            return j.image;
          }),
        ),
      );
      settled.forEach((r) => { if (r.status === "fulfilled") images.push(r.value); });
      if (images.length === 0) throw new Error("All slide generations failed");

      const { error } = await supabase
        .from("generated_outputs")
        .update({ carousel_images: images } as never)
        .eq("id", row.output_id);
      if (error) throw error;
      toast.success(`Generated ${images.length}/${row.image_prompts.length} slides`);
      qc.invalidateQueries({ queryKey: ["carousels"] });
      qc.invalidateQueries({ queryKey: ["project", row.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Slide generation failed");
    } finally {
      setGeneratingId(null);
      setProgress(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">Your <span className="gradient-text">Carousels</span></h1>
          <p className="text-muted-foreground mt-1">Multi-slide Instagram carousels — generate all slides in one click.</p>
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
            return (
              <div key={row.id} className="glass rounded-2xl overflow-hidden">
                <div className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to="/projects/$id" params={{ id: row.id }} className="font-semibold line-clamp-2 hover:text-white">
                      {row.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                      <span className="glass px-2 py-0.5 rounded">{row.image_prompts.length} slides</span>
                      {row.style && <span className="glass px-2 py-0.5 rounded">{row.style}</span>}
                      {row.platform && <span className="glass px-2 py-0.5 rounded">{row.platform}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => generateSlides(row)}
                    disabled={generating || row.image_prompts.length === 0}
                    className="rounded-lg gradient-primary text-white px-3 py-2 text-xs font-medium flex items-center gap-1.5 shadow-[var(--shadow-glow)] disabled:opacity-50 shrink-0"
                  >
                    {generating
                      ? <><Loader2 className="w-3 h-3 animate-spin" /> {progress?.done ?? 0}/{progress?.total ?? row.image_prompts.length}</>
                      : <><Sparkles className="w-3 h-3" /> {slides.length ? "Regenerate slides" : "Generate slides"}</>}
                  </button>
                </div>

                {slides.length > 0 ? (
                  <div className="px-4 pb-4">
                    <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1">
                      {slides.map((src, i) => (
                        <button
                          key={i}
                          onClick={() => setViewer({ images: slides, idx: i, title: row.title })}
                          className="relative shrink-0 w-40 aspect-square rounded-lg overflow-hidden snap-start border border-border hover:border-white/30 transition"
                        >
                          <img src={src} alt={`Slide ${i + 1}`} className="absolute inset-0 w-full h-full object-cover" />
                          <span className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-white font-medium">
                            {i + 1}/{slides.length}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mx-4 mb-4 rounded-lg border border-dashed border-border py-10 text-center text-xs text-muted-foreground">
                    {generating
                      ? <>Generating slide {progress?.done ?? 0} of {progress?.total ?? row.image_prompts.length}…</>
                      : <>No slides generated yet. Click <span className="text-white">Generate slides</span> to build all {row.image_prompts.length} images.</>}
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

      {viewer && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setViewer(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setViewer(null); }}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
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
            <img src={viewer.images[viewer.idx]} alt={`Slide ${viewer.idx + 1}`} className="max-w-[92vw] max-h-[80vh] object-contain rounded-lg shadow-2xl" />
            <div className="text-xs text-white/70">{viewer.title} · Slide {viewer.idx + 1}/{viewer.images.length}</div>
            <a href={viewer.images[viewer.idx]} download={`slide-${viewer.idx + 1}.png`} onClick={(e) => e.stopPropagation()}
              className="rounded-lg gradient-primary text-white px-4 py-2 text-xs font-medium flex items-center gap-2">
              <Download className="w-3 h-3" /> Download slide
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
