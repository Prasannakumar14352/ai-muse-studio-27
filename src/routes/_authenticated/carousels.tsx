import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PublishButton } from "@/components/publish-actions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { useAccess } from "@/lib/access";
import { supabase } from "@/integrations/supabase/client";
import { STYLES } from "@/lib/constants";
import { autoSlideOverlays, renderSlideWithOverlays, textFreeSlidePrompt, photoToSlideBackground } from "@/lib/carousel-compose";
import { MediaPicker } from "@/components/media-picker";
import { fetchPickedBlob, type PickedMedia } from "@/lib/picked-media";
import { listOutputs, saveOutput, deleteOutput, getOutput, type CarouselSlide, type SlideOverlaySet } from "@/lib/local-store";
import {
  putDataURL, getObjectURL, getDataURL, deleteBlob, deleteBlobsByPrefix, isBlobKey, makeBlobKey,
} from "@/lib/blob-store";
import { SlideEditor } from "@/components/slide-editor";

import { useProjectDelete } from "@/hooks/use-project-delete";
import {
  Plus, Layers, Loader2, Sparkles, Download, ChevronLeft, ChevronRight, X,
  Settings2, AlertTriangle, RefreshCw, FileArchive, FileText, Trash2, Film, Pencil, ImagePlus,
} from "lucide-react";



export const Route = createFileRoute("/_authenticated/carousels")({
  head: () => ({
    meta: [
      { title: "Carousels — CreatorFlow AI" },
      { name: "description", content: "Generate multi-slide Instagram carousels from your project prompts." },
      { property: "og:title", content: "Carousels — CreatorFlow AI" },
      { property: "og:description", content: "Generate multi-slide Instagram carousels from your project prompts." },
    ],
  }),
  // ?autogen=<projectId> — start making slide images right after creation.
  validateSearch: (s: Record<string, unknown>): { autogen?: string } =>
    typeof s.autogen === "string" ? { autogen: s.autogen } : {},
  component: CarouselsPage,
});

type Prompt = { n: number; prompt: string; style: string };
type SlideDiag = {
  at: string;
  ok: boolean;
  durationMs: number;
  httpStatus?: number;
  error?: string;
  attempts?: number;
  prompt?: string;
  style?: string;
  ratio?: string;
};
type SlideDiagMap = Record<string, SlideDiag>;
type LayoutSettings = { ratio: "1:1" | "4:5" | "9:16" | "16:9"; slideCount: number; spacing: number };

type CarouselRow = {
  id: string;
  title: string;
  style: string | null;
  platform: string | null;
  tone: string | null;
  image_prompts: Prompt[];
  carousel_images: (string | null)[] | null;
  display_images: (string | null)[] | null;
  carousel_slides: CarouselSlide[] | null;
  base_images: (string | null)[] | null;
  /** Object URLs for base_images — the editor edits overlays on the clean background. */
  base_display: (string | null)[] | null;
  slide_overlays: Record<number, SlideOverlaySet>;
  slide_diagnostics: SlideDiagMap;
  saved_ratio: LayoutSettings["ratio"] | null;
  saved_slide_count: number | null;
  caption: string;
  hashtags: string;
};

const RATIOS: LayoutSettings["ratio"][] = ["1:1", "4:5", "9:16", "16:9"];
const ASPECT_CLASS: Record<LayoutSettings["ratio"], string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-video",
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function shouldRetrySlide(diag: SlideDiag) {
  if (!diag.ok && !diag.httpStatus) return true;
  return Boolean(diag.httpStatus && [408, 409, 425, 429, 500, 502, 503, 504, 520, 522, 524].includes(diag.httpStatus));
}

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
  const [collapsedSlides, setCollapsedSlides] = useState<Record<string, boolean>>({});
  const [editingSlide, setEditingSlide] = useState<{ rowId: string; idx: number } | null>(null);
  const [bgPickerFor, setBgPickerFor] = useState<{ rowId: string; idx: number } | null>(null);
  const deleteProject = useProjectDelete();
  const isAdmin = !!useAccess().data?.isAdmin;

  async function saveEditedSlide(row: CarouselRow, idx: number, dataUrl: string, overlays: SlideOverlaySet) {
    const versionedId = `carousel:${row.id}:${idx}:v${Date.now()}`;
    const newKey = await putDataURL(versionedId, dataUrl);
    const prev = row.carousel_images ?? [];
    const nextImages: (string | null)[] = prev.length
      ? [...prev]
      : new Array(row.image_prompts.length).fill(null);
    const old = nextImages[idx];
    nextImages[idx] = newKey;
    const existing = await getOutput(row.id);
    const nextOverlays: Record<number, SlideOverlaySet> = {
      ...(existing?.slide_overlays ?? {}),
      [idx]: overlays,
    };
    await saveOutput(row.id, {
      carousel_images: nextImages,
      slide_overlays: nextOverlays,
    });
    if (old && isBlobKey(old) && old !== newKey) {
      try { await deleteBlob(old); } catch { /* ignore */ }
    }
    qc.invalidateQueries({ queryKey: ["carousels"] });
    qc.invalidateQueries({ queryKey: ["project", row.id] });
  }



  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["carousels"],
    queryFn: async (): Promise<CarouselRow[]> => {
      // Own carousels only: admins can read every user's projects, which showed other
      // people's carousels here as empty "0 prompts" drafts (their slides live in their account).
      const { data: auth } = await supabase.auth.getSession();
      const userId = auth.session?.user.id;
      if (!userId) throw new Error("Not signed in yet");
      const { data: projects, error: pErr } = await supabase
        .from("projects")
        .select("id,title,style,platform,tone")
        .eq("user_id", userId)
        .eq("content_type", "carousel")
        .order("created_at", { ascending: false });
      if (pErr) throw pErr;
      const outputs = await listOutputs();
      const outMap = new Map(outputs.map((o) => [o.project_id, o]));
      const rows: CarouselRow[] = [];
      for (const p of projects ?? []) {
        const out = outMap.get(p.id);
        const rd = out?.render_diagnostics as { slide_diagnostics?: SlideDiagMap } | undefined;
        const stored = out?.carousel_images ?? null;
        let display: (string | null)[] | null = null;
        if (stored) {
          display = await Promise.all(stored.map(async (v) => {
            if (!v) return null;
            if (isBlobKey(v)) return await getObjectURL(v);
            return v;
          }));
        }
        rows.push({
          id: p.id, title: p.title, style: p.style, platform: p.platform, tone: p.tone,
          image_prompts: out?.image_prompts ?? [],
          carousel_images: stored,
          display_images: display,
          carousel_slides: out?.carousel_slides ?? null,
          base_images: out?.carousel_base_images ?? null,
          base_display: out?.carousel_base_images
            ? await Promise.all(out.carousel_base_images.map(async (v) => (!v ? null : isBlobKey(v) ? await getObjectURL(v) : v)))
            : null,
          slide_overlays: (out?.slide_overlays ?? {}) as Record<number, SlideOverlaySet>,
          slide_diagnostics: (rd?.slide_diagnostics ?? {}) as SlideDiagMap,
          saved_ratio: (out?.aspect_ratio ?? null) as LayoutSettings["ratio"] | null,
          saved_slide_count: out?.slide_count ?? null,
          caption: out?.captions ?? "",
          hashtags: (out?.hashtags ?? []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" "),
        });
      }
      return rows;
    },
  });



  // Freshly created carousel: generate its slides automatically, once.
  const { autogen } = Route.useSearch();
  const navigate = useNavigate();
  const autoStartedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autogen || !data || generatingId || autoStartedRef.current === autogen) return;
    const row = data.find((r) => r.id === autogen);
    if (!row) return;
    autoStartedRef.current = autogen;
    void navigate({ to: "/carousels", search: {}, replace: true });
    if (!(row.carousel_images ?? []).some(Boolean)) void generateSlides(row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autogen, data]);

  function getLayout(row: CarouselRow): LayoutSettings {
    return layout[row.id] ?? {
      ratio: row.saved_ratio ?? "4:5",
      slideCount: row.saved_slide_count ?? row.image_prompts.length,
      spacing: 8,
    };
  }
  function updateLayout(rowId: string, patch: Partial<LayoutSettings>) {
    setLayout((prev) => ({ ...prev, [rowId]: { ...(prev[rowId] ?? { ratio: "1:1", slideCount: 5, spacing: 8 }), ...patch } }));
  }

  async function generateOneSlide(
    projectId: string, idx: number,
    prompt: Prompt, styleLabel: string, ratio: LayoutSettings["ratio"],
    slide?: CarouselSlide | null,
  ): Promise<{ image: string | null; base?: string | null; overlays?: SlideOverlaySet | null; diag: SlideDiag }> {
    const { fetchGeneratedImage } = await import("@/lib/image-stream");
    const maxAttempts = 3;
    let last: SlideDiag | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const start = Date.now();
      // Background only — image models misspell (and garble Indic) text, so the copy is overlaid by the app.
      const { image, error, status } = await fetchGeneratedImage({
        prompt: textFreeSlidePrompt(prompt.prompt), style: styleLabel, ratio, quality: "medium",
      });
      if (image) {
        const base = await putDataURL(`carousel:${projectId}:${idx}:base`, image);
        let composed = image;
        let overlaySet: SlideOverlaySet | null = null;
        if (slide?.headline) {
          try {
            const overlays = autoSlideOverlays(ratio, {
              headline: slide.headline, subhead: slide.body, bullets: slide.bullets ?? [], cta: slide.bottom_highlight,
            });
            composed = await renderSlideWithOverlays(image, overlays);
            overlaySet = { overlays };
          } catch (e) {
            console.warn("slide text overlay failed", e);
          }
        }
        const key = await putDataURL(`carousel:${projectId}:${idx}`, composed);
        return {
          image: key,
          base,
          overlays: overlaySet,
          diag: {
            at: new Date().toISOString(), ok: true, durationMs: Date.now() - start,
            httpStatus: status || 200, attempts: attempt,
            prompt: prompt.prompt, style: styleLabel, ratio,
          },
        };
      }
      last = {
        at: new Date().toISOString(),
        ok: false,
        durationMs: Date.now() - start,
        httpStatus: status || undefined,
        error: `${error ?? `HTTP ${status}`}${attempt < maxAttempts ? ` (attempt ${attempt}/${maxAttempts})` : ""}`,
        attempts: attempt,
        prompt: prompt.prompt,
        style: styleLabel,
        ratio,
      };
      if (!shouldRetrySlide(last) || attempt === maxAttempts) break;
      await sleep(900 * attempt);
    }
    return { image: null, diag: last ?? { at: new Date().toISOString(), ok: false, durationMs: 0, error: "Image generation failed", attempts: maxAttempts, prompt: prompt.prompt, style: styleLabel, ratio } };
  }

  async function persistSlides(
    row: CarouselRow, images: (string | null)[], slideDiag: SlideDiagMap,
    bases?: (string | null)[], overlays?: Record<number, SlideOverlaySet>,
  ) {
    await saveOutput(row.id, {
      carousel_images: images,
      render_diagnostics: { slide_diagnostics: slideDiag },
      ...(bases ? { carousel_base_images: bases } : {}),
      ...(overlays ? { slide_overlays: overlays } : {}),
    });
  }

  async function generateSlides(row: CarouselRow) {
    if (row.image_prompts.length === 0) return toast.error("No image prompts on this carousel.");
    const styleLabel = STYLES.find((s) => s.id === (row.style ?? ""))?.label ?? row.style ?? "cinematic";

    const cfg = getLayout(row);
    const slice = row.image_prompts.slice(0, Math.max(1, Math.min(cfg.slideCount, row.image_prompts.length)));
    setGeneratingId(row.id);
    setProgress({ done: 0, total: slice.length });
    try {
      const results: (string | null)[] = new Array(slice.length).fill(null);
      const bases: (string | null)[] = new Array(slice.length).fill(null);
      const overlays: Record<number, SlideOverlaySet> = {};
      const diag: SlideDiagMap = {};
      let done = 0;
      for (let i = 0; i < slice.length; i++) {
        const r = await generateOneSlide(row.id, i, slice[i], styleLabel, cfg.ratio, row.carousel_slides?.[i]);
        results[i] = r.image;
        bases[i] = r.base ?? null;
        if (r.overlays) overlays[i] = r.overlays;
        diag[String(i)] = r.diag;
        done += 1;
        setProgress({ done, total: slice.length });
        await persistSlides(row, results, diag, bases, overlays);
        qc.invalidateQueries({ queryKey: ["carousels"] });
      }
      await persistSlides(row, results, diag, bases, overlays);
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



  async function regenerateFailed(row: CarouselRow) {
    const slides = row.carousel_images ?? [];
    const failedIdxs: number[] = [];
    row.image_prompts.forEach((_, i) => {
      const src = slides[i];
      const diag = row.slide_diagnostics[String(i)];
      if (!src || (diag && !diag.ok)) failedIdxs.push(i);
    });
    if (failedIdxs.length === 0) return toast.info("No failed or missing slides to regenerate");
    const styleLabel = STYLES.find((s) => s.id === (row.style ?? ""))?.label ?? row.style ?? "cinematic";
    const cfg = getLayout(row);
    setGeneratingId(row.id);
    setProgress({ done: 0, total: failedIdxs.length });
    try {
      const nextImages = [...(slides.length ? slides : new Array(row.image_prompts.length).fill(null))];
      const nextDiag: SlideDiagMap = { ...row.slide_diagnostics };
      const nextBases = [...(row.base_images ?? new Array(nextImages.length).fill(null))];
      const nextOverlays: Record<number, SlideOverlaySet> = { ...row.slide_overlays };
      let done = 0;
      for (const i of failedIdxs) {
        const prompt = row.image_prompts[i];
        const r = await generateOneSlide(row.id, i, prompt, styleLabel, cfg.ratio, row.carousel_slides?.[i]);
        nextImages[i] = r.image ?? nextImages[i] ?? null;
        if (r.image) {
          nextBases[i] = r.base ?? null;
          if (r.overlays) nextOverlays[i] = r.overlays; else delete nextOverlays[i];
        }
        nextDiag[String(i)] = r.diag;
        done += 1;
        setProgress({ done, total: failedIdxs.length });
        await persistSlides(row, nextImages, nextDiag, nextBases, nextOverlays);
        qc.invalidateQueries({ queryKey: ["carousels"] });
      }
      await persistSlides(row, nextImages, nextDiag, nextBases, nextOverlays);
      const okCount = failedIdxs.filter((i) => nextImages[i]).length;
      toast[okCount === failedIdxs.length ? "success" : "warning"](`${okCount}/${failedIdxs.length} slides regenerated`);
      qc.invalidateQueries({ queryKey: ["carousels"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Regenerate failed");
    } finally {
      setGeneratingId(null);
      setProgress(null);
    }
  }

  async function resolveSlideURLs(row: CarouselRow): Promise<string[]> {
    const refs = (row.carousel_images ?? []).filter(Boolean) as string[];
    return Promise.all(refs.map(async (r) => (isBlobKey(r) ? ((await getObjectURL(r)) ?? "") : r)));
  }
  async function resolveSlideDataURLs(row: CarouselRow): Promise<string[]> {
    const refs = (row.carousel_images ?? []).filter(Boolean) as string[];
    const out: string[] = [];
    for (const r of refs) {
      if (isBlobKey(r)) {
        const d = await getDataURL(r);
        if (d) out.push(d);
      } else {
        out.push(r);
      }
    }
    return out;
  }

  async function exportReel(row: CarouselRow) {
    const slides = await resolveSlideURLs(row);
    if (slides.length === 0) return toast.error("Generate slides first");
    if (!("MediaRecorder" in window)) return toast.error("MediaRecorder not supported in this browser");
    const cfg = getLayout(row);
    setExportingId(row.id);
    try {
      const dims = cfg.ratio === "9:16" ? { w: 720, h: 1280 }
        : cfg.ratio === "16:9" ? { w: 1280, h: 720 }
        : cfg.ratio === "4:5" ? { w: 864, h: 1080 }
        : { w: 1080, h: 1080 };
      const canvas = document.createElement("canvas");
      canvas.width = dims.w; canvas.height = dims.h;
      const ctx = canvas.getContext("2d")!;
      const imgs = await Promise.all(slides.map((src) => new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("Image load failed")); im.src = src;
      })));
      const stream = canvas.captureStream(30);
      const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const stopped = new Promise<Blob>((res) => { rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || "video/webm" })); });
      rec.start();

      const perSlideMs = 2200;
      const totalMs = perSlideMs * imgs.length;
      const start = performance.now();
      await new Promise<void>((resolve) => {
        function frame(t: number) {
          const elapsed = t - start;
          if (elapsed >= totalMs) { resolve(); return; }
          const idx = Math.min(imgs.length - 1, Math.floor(elapsed / perSlideMs));
          const local = (elapsed - idx * perSlideMs) / perSlideMs;
          const zoom = 1 + local * 0.15;
          const im = imgs[idx];
          const scale = Math.max(canvas.width / im.width, canvas.height / im.height) * zoom;
          const dw = im.width * scale, dh = im.height * scale;
          const dx = (canvas.width - dw) / 2, dy = (canvas.height - dh) / 2;
          ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(im, dx, dy, dw, dh);
          // fade between slides
          const fadeIn = Math.min(1, local / 0.15);
          const fadeOut = Math.min(1, (1 - local) / 0.15);
          const alpha = 1 - Math.min(fadeIn, fadeOut);
          if (alpha > 0) {
            ctx.fillStyle = `rgba(0,0,0,${alpha})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
      rec.stop();
      const blob = await stopped;
      triggerDownload(blob, `${slugify(row.title)}-reel.webm`);
      toast.success("Reel exported");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reel export failed");
    } finally {
      setExportingId(null);
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
      const r = await generateOneSlide(row.id, idx, prompt, styleLabel, cfg.ratio, row.carousel_slides?.[idx]);
      const nextImages = [...(row.carousel_images ?? new Array(row.image_prompts.length).fill(null))];
      nextImages[idx] = r.image ?? nextImages[idx] ?? null;
      const nextDiag: SlideDiagMap = { ...row.slide_diagnostics, [String(idx)]: r.diag };
      const nextBases = [...(row.base_images ?? new Array(nextImages.length).fill(null))];
      const nextOverlays: Record<number, SlideOverlaySet> = { ...row.slide_overlays };
      if (r.image) {
        nextBases[idx] = r.base ?? null;
        if (r.overlays) nextOverlays[idx] = r.overlays; else delete nextOverlays[idx];
      }
      await persistSlides(row, nextImages, nextDiag, nextBases, nextOverlays);
      if (r.image) toast.success(`Slide ${idx + 1} re-generated`);
      else toast.error(`Slide ${idx + 1} failed: ${r.diag.error ?? "unknown"}`);
      qc.invalidateQueries({ queryKey: ["carousels"] });
    } finally {
      setSlideRetryId(null);
    }
  }

  /** Replace one slide's background with the user's own photo (library or free stock) — 0 credits. */
  async function applyOwnBackground(row: CarouselRow, idx: number, item: PickedMedia) {
    const cfg = getLayout(row);
    const blob = await fetchPickedBlob(item);
    const src = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("Couldn't read the image"));
      r.readAsDataURL(blob);
    });
    const image = await photoToSlideBackground(src, cfg.ratio);
    const stamp = Date.now();
    const base = await putDataURL(`carousel:${row.id}:${idx}:base:v${stamp}`, image);
    const slide = row.carousel_slides?.[idx];
    let composed = image;
    let overlaySet: SlideOverlaySet | null = null;
    if (slide?.headline) {
      const overlays = autoSlideOverlays(cfg.ratio, {
        headline: slide.headline, subhead: slide.body, bullets: slide.bullets ?? [], cta: slide.bottom_highlight,
      });
      composed = await renderSlideWithOverlays(image, overlays);
      overlaySet = { overlays };
    }
    const key = await putDataURL(`carousel:${row.id}:${idx}:v${stamp}`, composed);
    const count = Math.max(row.image_prompts.length, row.carousel_images?.length ?? 0, idx + 1);
    const nextImages = [...(row.carousel_images ?? [])];
    while (nextImages.length < count) nextImages.push(null);
    const oldImage = nextImages[idx];
    nextImages[idx] = key;
    const nextBases = [...(row.base_images ?? [])];
    while (nextBases.length < count) nextBases.push(null);
    const oldBase = nextBases[idx];
    nextBases[idx] = base;
    const nextOverlays: Record<number, SlideOverlaySet> = { ...row.slide_overlays };
    if (overlaySet) nextOverlays[idx] = overlaySet; else delete nextOverlays[idx];
    const nextDiag: SlideDiagMap = {
      ...row.slide_diagnostics,
      [String(idx)]: { at: new Date().toISOString(), ok: true, durationMs: 0, attempts: 0, prompt: `Own photo: ${item.title}`, ratio: cfg.ratio },
    };
    await persistSlides(row, nextImages, nextDiag, nextBases, nextOverlays);
    for (const old of [oldImage, oldBase]) {
      if (old && isBlobKey(old) && old !== key && old !== base) {
        try { await deleteBlob(old); } catch { /* ignore */ }
      }
    }
    qc.invalidateQueries({ queryKey: ["carousels"] });
    qc.invalidateQueries({ queryKey: ["project", row.id] });
    toast.success(`Slide ${idx + 1} now uses your photo — no credits used`);
  }

  async function exportZip(row: CarouselRow) {
    const slides = await resolveSlideDataURLs(row);
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
    const slides = await resolveSlideDataURLs(row);
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
    setDeletingId(row.id);
    try {
      await deleteProject({
        id: row.id,
        title: row.title,
        onCommit: async () => {
          await deleteOutput(row.id);
          await deleteBlobsByPrefix(`carousel:${row.id}:`);
        },
      });
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
        <Link to="/create/carousel" className="rounded-lg gradient-primary text-white px-4 py-2.5 text-sm font-medium flex items-center gap-2">
          <Plus className="w-4 h-4" /> New carousel
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-rose-200">Couldn't load your carousels</div>
            <div className="mt-1 text-xs text-rose-300/90 break-words">
              {error instanceof Error ? error.message : String(error)}
            </div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="rounded-lg glass border border-rose-500/40 hover:bg-rose-500/20 text-rose-100 px-3 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            {isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="glass rounded-xl h-80 animate-pulse" />)}
        </div>
      ) : data && data.length > 0 ? (

        <div className="grid md:grid-cols-2 gap-4">
          {data.map((row) => {
            const generating = generatingId === row.id;
            const slides = row.display_images ?? [];
            const expectedCount = Math.max(row.image_prompts.length, slides.length);
            const missingCount = Array.from({ length: expectedCount }).filter((_, i) => {
              const src = row.carousel_images?.[i];
              const diag = row.slide_diagnostics[String(i)];
              return !src || (diag && !diag.ok);
            }).length;
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
                      {generating ? (
                        <span className="bg-primary/15 text-primary px-2 py-0.5 rounded flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> Generating{progress ? ` ${progress.done}/${progress.total}` : "…"}
                        </span>
                      ) : missingCount > 0 && (
                        <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> {missingCount} missing/failed
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

                {row.carousel_slides && row.carousel_slides.length > 0 && (
                  <details className="mx-4 mb-4 rounded-lg border border-border bg-black/30">
                    <summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground hover:text-white flex items-center justify-between">
                      <span>Per-slide script ({row.carousel_slides.length} slides)</span>
                      <span className="text-[10px]">Click to expand</span>
                    </summary>
                    <div className="px-3 pb-3 space-y-3 max-h-72 overflow-y-auto">
                      {row.carousel_slides.map((sl) => (
                        <div key={sl.n} className="rounded border border-border/60 bg-black/40 p-2.5 text-xs">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="gradient-primary text-white px-1.5 py-0.5 rounded text-[10px]">Slide {sl.n}</span>
                            <span className="text-muted-foreground uppercase tracking-wider text-[10px]">{sl.role}</span>
                            {sl.label && (
                              <span className="border border-[color:var(--neon-purple)]/50 text-[color:var(--neon-purple)] px-1.5 py-0.5 rounded text-[10px]">
                                {sl.label}
                              </span>
                            )}
                          </div>
                          <div className="font-semibold text-white">
                            {sl.emoji ? `${sl.emoji} ` : ""}{sl.headline}
                          </div>
                          {sl.body && (
                            <div className="mt-1 text-muted-foreground whitespace-pre-wrap">{sl.body}</div>
                          )}
                          {sl.bullets && sl.bullets.length > 0 && (
                            <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
                              {sl.bullets.map((b, i) => (
                                <li key={i} className="pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-[color:var(--neon-purple)]">
                                  {b}
                                </li>
                              ))}
                            </ul>
                          )}
                          {sl.bottom_highlight && (
                            <div className="mt-2 rounded border border-[color:var(--neon-blue)]/40 bg-[color:var(--neon-blue)]/5 px-2 py-1 text-[11px]">
                              <span className="uppercase tracking-wider text-[9px] text-[color:var(--neon-blue)] mr-1">Key takeaway</span>
                              <span className="text-white">{sl.bottom_highlight}</span>
                            </div>
                          )}
                          <div className="mt-2 text-[10px] text-muted-foreground italic">🎨 {sl.visual}</div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}


                {slides.length > 0 ? (
                  <div className="px-4 pb-4 space-y-3">
                    {row.carousel_slides && row.carousel_slides.length > 0 && (() => {
                      const collapsed = collapsedSlides[row.id] ?? false;
                      return (
                      <div className="rounded-lg border border-border bg-black/20">
                        <button
                          type="button"
                          onClick={() => setCollapsedSlides((p) => ({ ...p, [row.id]: !collapsed }))}
                          className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-white"
                        >
                          <span className="font-medium">Slide preview ({row.carousel_slides.length} slide{row.carousel_slides.length === 1 ? "" : "s"})</span>
                          <span className="flex items-center gap-1 text-[10px]">
                            {collapsed ? "Expand" : "Collapse"}
                            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${collapsed ? "" : "rotate-90"}`} />
                          </span>
                        </button>
                        {!collapsed && (
                          <div className="px-2 pb-2 space-y-2.5">
                            {row.carousel_slides.slice(0, Math.max(slides.length, row.carousel_slides.length)).map((sl, i) => {
                              const src = slides[i];
                              const diag = row.slide_diagnostics[String(i)];
                              // While a run is in progress, a slide without an image yet is pending, not failed.
                              const pending = generating && (!src || (diag && !diag.ok));
                              const failed = !pending && (!src || (diag && !diag.ok));
                              const isRetrying = slideRetryId === `${row.id}:${i}`;
                              return (
                                <div key={sl.n} className={`rounded-xl overflow-hidden border ${failed ? "border-rose-500/40" : "border-border"} bg-black/40`}>
                                  <div className="grid grid-cols-[112px_1fr] gap-3">
                                    <div className={`${ASPECT_CLASS[cfg.ratio]} relative bg-black/60`}>
                                      {src ? (
                                        <button onClick={() => setViewer({ images: slides, idx: i, title: row.title })} className="absolute inset-0">
                                          <img src={src} alt={`Slide ${sl.n}`} className="absolute inset-0 w-full h-full object-cover" />
                                        </button>
                                      ) : pending ? (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center text-muted-foreground">
                                          <Loader2 className="w-4 h-4 animate-spin" />
                                          <div className="mt-1 text-[9px]">Generating…</div>
                                        </div>
                                      ) : (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center bg-rose-500/10">
                                          <AlertTriangle className="w-4 h-4 text-rose-400" />
                                          <div className="mt-1 text-[9px] text-rose-300 line-clamp-3">{diag?.error ?? "Not generated"}</div>
                                        </div>
                                      )}
                                      <span className="absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded bg-black/70 text-white font-medium">
                                        {sl.n}
                                      </span>
                                      <button onClick={(e) => { e.stopPropagation(); setBgPickerFor({ rowId: row.id, idx: i }); }}
                                        disabled={generating || isRetrying}
                                        className="absolute bottom-1 left-1 rounded-md bg-black/80 hover:bg-black text-white p-1 disabled:opacity-50"
                                        title="Use my photo (library or free stock)">
                                        <ImagePlus className="w-3 h-3" />
                                      </button>
                                      {failed && (
                                        <button onClick={() => retrySlide(row, i)} disabled={isRetrying}
                                          className="absolute bottom-1 right-1 rounded-md bg-black/80 hover:bg-black text-white p-1"
                                          title={diag?.error ?? "Retry this slide"}>
                                          {isRetrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                        </button>
                                      )}
                                      {src && !failed && (
                                        <button onClick={(e) => { e.stopPropagation(); setEditingSlide({ rowId: row.id, idx: i }); }}
                                          className="absolute bottom-1 right-1 rounded-md bg-black/80 hover:bg-black text-white p-1"
                                          title="Edit text & logo">
                                          <Pencil className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                    <div className="py-2 pr-3 text-xs min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="uppercase tracking-wider text-[9px] text-muted-foreground">{sl.role}</span>
                                        {sl.label && (
                                          <span className="border border-[color:var(--neon-purple)]/50 text-[color:var(--neon-purple)] px-1.5 py-0 rounded text-[9px]">
                                            {sl.label}
                                          </span>
                                        )}
                                      </div>
                                      <div className="font-semibold text-white mt-0.5 leading-tight">
                                        {sl.emoji ? `${sl.emoji} ` : ""}{sl.headline}
                                      </div>
                                      {sl.body && <div className="mt-1 text-muted-foreground line-clamp-2">{sl.body}</div>}
                                      {sl.bullets && sl.bullets.length > 0 && (
                                        <ul className="mt-1 space-y-0.5 text-muted-foreground text-[11px]">
                                          {sl.bullets.slice(0, 4).map((b, j) => (
                                            <li key={j} className="pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-[color:var(--neon-purple)]">{b}</li>
                                          ))}
                                        </ul>
                                      )}
                                      {sl.bottom_highlight && (
                                        <div className="mt-1.5 rounded border border-[color:var(--neon-blue)]/40 bg-[color:var(--neon-blue)]/5 px-2 py-1 text-[10px]">
                                          <span className="uppercase tracking-wider text-[8px] text-[color:var(--neon-blue)] mr-1">Key takeaway</span>
                                          <span className="text-white">{sl.bottom_highlight}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      );
                    })()}

                    <div
                      className="flex overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1"
                      style={{ gap: `${cfg.spacing}px` }}
                    >
                      {slides.map((src, i) => {
                        const diag = row.slide_diagnostics[String(i)];
                        const pending = generating && (!src || (diag && !diag.ok));
                        const failed = !pending && (!src || (diag && !diag.ok));
                        const isRetrying = slideRetryId === `${row.id}:${i}`;
                        return (
                          <div key={i} className={`shrink-0 w-40 snap-start ${ASPECT_CLASS[cfg.ratio]} relative rounded-lg overflow-hidden border ${failed ? "border-rose-500/60" : "border-border"}`}>
                            {src ? (
                              <button onClick={() => setViewer({ images: slides, idx: i, title: row.title })} className="absolute inset-0" aria-label={`Open slide ${i + 1}`}>
                                <img src={src} alt={`Slide ${i + 1}`} className="absolute inset-0 w-full h-full object-cover" />
                                {/* Slide copy over the image, as it will read on the post (skipped once edited in the slide editor). */}
                                {row.carousel_slides?.[i] && !(row.slide_overlays[i]?.overlays?.length) && (
                                  <span className="absolute inset-0 flex flex-col justify-between p-2 text-left pointer-events-none">
                                    <span className="mt-5 text-[11px] leading-tight font-extrabold text-white [text-shadow:0_1px_4px_rgba(0,0,0,.9)] line-clamp-3">
                                      {row.carousel_slides[i].headline}
                                    </span>
                                    {row.carousel_slides[i].bottom_highlight && (
                                      <span className="text-[9px] leading-tight text-white bg-black/55 rounded px-1.5 py-1 line-clamp-2">
                                        {row.carousel_slides[i].bottom_highlight}
                                      </span>
                                    )}
                                  </span>
                                )}
                              </button>
                            ) : pending ? (
                              <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center text-muted-foreground">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <div className="mt-1 text-[9px]">Generating…</div>
                              </div>
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
                            <button
                              onClick={(e) => { e.stopPropagation(); setBgPickerFor({ rowId: row.id, idx: i }); }}
                              disabled={generating || isRetrying}
                              className="absolute bottom-1.5 left-1.5 rounded-md bg-black/80 hover:bg-black text-white p-1 disabled:opacity-50"
                              title="Use my photo (library or free stock)"
                            >
                              <ImagePlus className="w-3 h-3" />
                            </button>
                            {failed ? (
                              <button
                                onClick={() => retrySlide(row, i)}
                                disabled={isRetrying}
                                className="absolute bottom-1.5 right-1.5 rounded-md bg-black/80 hover:bg-black text-white p-1"
                                title={diag?.error ?? "Retry this slide"}
                              >
                                {isRetrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              </button>
                            ) : src ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingSlide({ rowId: row.id, idx: i }); }}
                                className="absolute bottom-1.5 right-1.5 rounded-md bg-black/80 hover:bg-black text-white p-1"
                                title="Edit text & logo"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            ) : null}
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
                      <button
                        onClick={() => exportReel(row)}
                        disabled={exportingId === row.id}
                        className="rounded-lg glass border border-border px-3 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-50"
                        title="Turn slides into a Ken Burns reel (WebM)"
                      >
                        {exportingId === row.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Film className="w-3 h-3" />}
                        Export as Reel
                      </button>
                      <PublishButton
                        className="rounded-lg gradient-primary text-white px-3 py-1.5 text-xs font-medium flex items-center gap-1.5"
                        content={{
                          projectId: row.id,
                          title: row.title,
                          caption: row.caption,
                          hashtags: row.hashtags,
                          defaultPlatform: row.platform?.toLowerCase().includes("linkedin") ? "linkedin" : "instagram",
                          mediaHint: { images: slides.filter(Boolean).length },
                          loadMedia: async () => (await resolveSlideDataURLs(row)).map((url, i) => ({ url, kind: "image" as const, name: `slide-${i + 1}.png` })),
                        }}
                      />
                      {!generating && missingCount > 0 && (
                        <button
                          onClick={() => regenerateFailed(row)}
                          disabled={generating}
                          className="rounded-lg glass border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 px-3 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-50"
                          title="Only regenerates slides whose image is missing or failed"
                        >
                          <RefreshCw className="w-3 h-3" /> Regenerate slides &amp; images ({missingCount})
                        </button>
                      )}
                    </div>

                    {isAdmin && (
                    <details className="rounded-lg border border-border bg-black/30">
                      <summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground hover:text-white flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><AlertTriangle className="w-3 h-3" /> Slide diagnostics</span>
                        <span className="text-[10px]">{Object.keys(row.slide_diagnostics).length} entries</span>
                      </summary>
                      <div className="px-3 pb-3 space-y-2 max-h-64 overflow-y-auto">
                        {row.image_prompts.slice(0, expectedCount).map((p, i) => {
                          const d = row.slide_diagnostics[String(i)];
                          const hasImg = Boolean(row.carousel_images?.[i]);
                          const state = hasImg && (!d || d.ok) ? "ok" : d && !d.ok ? "failed" : !hasImg ? "missing" : "unknown";
                          const color = state === "ok" ? "text-emerald-300 border-emerald-500/30"
                            : state === "failed" ? "text-rose-300 border-rose-500/40"
                            : "text-amber-300 border-amber-500/40";
                          return (
                            <div key={i} className={`rounded border ${color} bg-black/40 p-2 text-[11px] space-y-1`}>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold">Slide {i + 1}</span>
                                <span className="uppercase tracking-wider text-[9px]">{state}</span>
                                {d?.attempts != null && <span className="text-muted-foreground">retries: {d.attempts}</span>}
                                {d?.httpStatus != null && <span className="text-muted-foreground">HTTP {d.httpStatus}</span>}
                                {d?.durationMs != null && <span className="text-muted-foreground">{d.durationMs}ms</span>}
                                {d?.at && <span className="text-muted-foreground">{new Date(d.at).toLocaleTimeString()}</span>}
                              </div>
                              {d?.error && <div className="text-rose-300">{d.error}</div>}
                              <div className="text-muted-foreground">
                                <span className="uppercase tracking-wider text-[9px] mr-1">image_prompt</span>
                                <span className="text-white/80 break-words">{d?.prompt ?? p.prompt}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                    )}
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
          <Link to="/create/carousel" className="mt-5 inline-flex rounded-lg gradient-primary px-5 py-2.5 text-sm text-white font-medium">
            <Plus className="w-4 h-4 mr-2" /> New carousel
          </Link>
        </div>
      )}

      {viewer && viewer.images[viewer.idx] && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setViewer(null)}
        >
          <button aria-label="Close"
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

      <MediaPicker
        open={bgPickerFor !== null}
        onOpenChange={(o) => { if (!o) setBgPickerFor(null); }}
        accept={["image"]}
        title={bgPickerFor ? `Slide ${bgPickerFor.idx + 1} — use my photo` : "Use my photo"}
        onPicked={async (item) => {
          const target = bgPickerFor;
          const row = target ? data?.find((r) => r.id === target.rowId) : undefined;
          if (!target || !row) return;
          await applyOwnBackground(row, target.idx, item);
        }}
      />
      {editingSlide && (() => {
        const row = data?.find((r) => r.id === editingSlide.rowId);
        // Edit on the text-free background when we have it, so text isn't stacked on burned-in copy.
        const src = row?.base_display?.[editingSlide.idx] ?? row?.display_images?.[editingSlide.idx];
        if (!row || !src) return null;
        const cfg = getLayout(row);
        const slideNum = row.carousel_slides?.[editingSlide.idx]?.n ?? editingSlide.idx + 1;
        const slide = row.carousel_slides?.[editingSlide.idx];
        const copy = slide ? {
          headline: slide.headline,
          subhead: slide.body,
          bullets: slide.bullets ?? [],
          cta: slide.bottom_highlight,
        } : null;
        return (
          <SlideEditor
            src={src}
            ratio={cfg.ratio}
            title={row.title}
            slideNumber={slideNum}
            initial={row.slide_overlays[editingSlide.idx] ?? null}
            copy={copy}
            onClose={() => setEditingSlide(null)}
            onSave={async (dataUrl, overlays) => {
              await saveEditedSlide(row, editingSlide.idx, dataUrl, overlays);
            }}
          />
        );
      })()}
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
