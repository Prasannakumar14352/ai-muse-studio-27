import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { STYLES } from "@/lib/constants";
import { pushImageGenLog, listImageGenLogs } from "@/lib/local-store";
import { ProjectsSection } from "@/components/projects-section";
import { deductUsage, useAccess, canGenerate } from "@/lib/access";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Wand2, Download, Image as ImageIcon, RefreshCw, Bug, Copy, Trash2, FileDown, Maximize2, X, ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/images")({ component: ImagesPage });


const RATIOS = ["1:1", "9:16", "16:9", "4:5"];
const LS_STATE = "creatorvault:images:v2";

type ResultItem = { id: string; prompt: string; style: string; ratio: string; image: string };

type DebugInfo = {
  requestedAt: string;
  durationMs: number;
  request: { prompt: string; style: string; ratio: string; endpoint: string };
  response?: {
    model?: string;
    size?: string;
    quality?: string;
    n?: number;
    fullPrompt?: string;
    originalPrompt?: string;
    stylePrefix?: string | null;
  };
  errors: string[];
  successCount: number;
  failureCount: number;
};

function ImagesPage() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("cinematic");
  const [ratio, setRatio] = useState("1:1");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [lastRun, setLastRun] = useState<{ prompt: string; style: string; ratio: string } | null>(null);
  const [debug, setDebug] = useState<DebugInfo | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);
  const qc = useQueryClient();
  const { data: access } = useAccess();

  // Keyboard nav for fullscreen viewer.
  useEffect(() => {
    if (viewerIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setViewerIdx(null);
      if (e.key === "ArrowRight") setViewerIdx((i) => (i === null ? i : Math.min(results.length - 1, i + 1)));
      if (e.key === "ArrowLeft") setViewerIdx((i) => (i === null ? i : Math.max(0, i - 1)));
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [viewerIdx, results.length]);

  // Restore last session from localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_STATE);
      if (raw) {
        const s = JSON.parse(raw) as {
          prompt?: string; style?: string; ratio?: string;
          results?: ResultItem[]; lastRun?: typeof lastRun; debug?: DebugInfo | null;
        };
        if (s.prompt) setPrompt(s.prompt);
        if (s.style) setStyle(s.style);
        if (s.ratio) setRatio(s.ratio);
        if (s.results) setResults(s.results);
        if (s.lastRun) setLastRun(s.lastRun);
        if (s.debug) setDebug(s.debug);
      }
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  // Persist on change (skip first render before hydration).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_STATE, JSON.stringify({ prompt, style, ratio, results, lastRun, debug }));
    } catch { /* quota exceeded — ignore */ }
  }, [prompt, style, ratio, results, lastRun, debug, hydrated]);

  async function runGeneration(p: string, s: string, r: string) {
    // Preflight credit check — need up to 4 credits (1 per concept).
    if (access && !canGenerate(access, 4)) {
      toast.error("Not enough credits to generate 4 images. Top up in Pricing.");
      return;
    }
    setLoading(true);
    const styleLabel = STYLES.find((x) => x.id === s)?.label ?? s;
    const startedAt = Date.now();
    const errors: string[] = [];
    let lastMeta: DebugInfo["response"] | undefined;
    try {
      const { fetchGeneratedImage } = await import("@/lib/image-stream");
      const settled = await Promise.allSettled(
        Array.from({ length: 4 }).map(async () => {
          const { image, error, status } = await fetchGeneratedImage({
            prompt: p, style: styleLabel, ratio: r,
          });
          if (!image) throw new Error(error || `HTTP ${status}`);
          return { image };
        })
      );

      const ok: { image: string }[] = [];
      settled.forEach((x) => {
        if (x.status === "fulfilled") ok.push(x.value);
        else errors.push(x.reason instanceof Error ? x.reason.message : String(x.reason));
      });

      if (ok.length) {
        setResults((prev) => [
          ...ok.map((res) => ({ id: crypto.randomUUID(), prompt: p, style: s, ratio: r, image: res.image })),
          ...prev,
        ].slice(0, 40)); // cap to avoid localStorage bloat
        setLastRun({ prompt: p, style: s, ratio: r });
        // Deduct 1 credit per successful image (admin bypass handled inside).
        for (let i = 0; i < ok.length; i++) {
          await deductUsage({ amount: 1, description: `AI image generated (${styleLabel})` }).catch(() => {});
        }
        // Save as a project row so it shows up in "Your image projects".
        if (access?.userId) {
          const title = p.trim().slice(0, 80) || `AI image (${styleLabel})`;
          const { error: pErr } = await supabase.from("projects").insert({
            user_id: access.userId,
            title,
            content_type: "ai_image",
            topic: p,
            style: s,
            status: "generated",
            thumbnail_url: ok[0].image,
          });
          if (pErr) console.warn("[images] project insert failed", pErr);
          qc.invalidateQueries({ queryKey: ["projects-section"] });
          qc.invalidateQueries({ queryKey: ["recent-projects"] });
          qc.invalidateQueries({ queryKey: ["module-counts"] });
        }
        qc.invalidateQueries({ queryKey: ["access"] });
        toast.success(`Generated ${ok.length} of 4 concepts`);
      } else {
        toast.error(errors[0] || "Generation failed");
      }

      const info: DebugInfo = {
        requestedAt: new Date(startedAt).toISOString(),
        durationMs: Date.now() - startedAt,
        request: { prompt: p, style: styleLabel, ratio: r, endpoint: "/api/generate-image" },
        response: lastMeta,
        errors,
        successCount: ok.length,
        failureCount: errors.length,
      };
      setDebug(info);

      // Save log locally (per-user browser storage).
      await pushImageGenLog({
        prompt: p,
        style: s,
        ratio: r,
        full_prompt: lastMeta?.fullPrompt ?? `${styleLabel} style. ${p}`,
        request: info.request,
        response: info.response ?? {},
        errors: info.errors,
        success_count: info.successCount,
        failure_count: info.failureCount,
        duration_ms: info.durationMs,
      });

    } finally {
      setLoading(false);
    }
  }

  async function generate() {
    if (!prompt.trim()) return toast.error("Enter a prompt");
    await runGeneration(prompt, style, ratio);
  }

  async function regenerateExact() {
    if (!lastRun) return toast.error("Generate an image first");
    await runGeneration(lastRun.prompt, lastRun.style, lastRun.ratio);
  }

  async function loadHistory() {
    const logs = await listImageGenLogs();
    if (logs.length === 0) return toast.info("No saved debug logs yet");
    downloadJson(`creatorvault-image-debug-history-${Date.now()}.json`, logs);
    toast.success(`Downloaded ${logs.length} logs`);
  }

  function downloadCurrentDebug() {
    if (!debug) return toast.error("No debug data yet");
    downloadJson(`creatorvault-image-debug-${Date.now()}.json`, debug);
  }





  function clearSession() {
    setResults([]); setLastRun(null); setDebug(null);
    localStorage.removeItem(LS_STATE);
    toast.success("Cleared saved session");
  }

  const aspectClass: Record<string, string> = {
    "1:1": "aspect-square", "9:16": "aspect-[9/16]", "16:9": "aspect-video", "4:5": "aspect-[4/5]",
  };

  const styleLabelPreview = STYLES.find((s) => s.id === style)?.label ?? style;
  const previewFullPrompt = prompt ? `${styleLabelPreview} style. ${prompt}` : "";

  return (
    <div className="space-y-6 max-w-6xl">
      
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">AI <span className="gradient-text">Image</span> Generator</h1>
          <p className="text-muted-foreground mt-1">Describe the shot. Pick a style. Generate.</p>
        </div>
        {(results.length > 0 || lastRun) && (
          <button onClick={clearSession} className="text-xs text-muted-foreground hover:text-rose-400 flex items-center gap-1">
            <Trash2 className="w-3 h-3" /> Clear saved session
          </button>
        )}
      </div>

      <div className="glass rounded-2xl p-6 space-y-4">
        <textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder="A lone astronaut watching Earth rise from a lunar cliff, ultra detailed..."
          className="w-full bg-input/50 border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-[color:var(--neon-purple)]" />

        <div>
          <div className="text-sm text-muted-foreground mb-2">Style</div>
          <div className="flex flex-wrap gap-2">
            {STYLES.map((s) => (
              <button key={s.id} onClick={() => setStyle(s.id)}
                className={`px-3 py-1.5 rounded-full text-xs border transition ${style === s.id ? "gradient-primary text-white border-transparent" : "glass border-border hover:border-white/20"}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex gap-2">
            {RATIOS.map((r) => (
              <button key={r} onClick={() => setRatio(r)}
                className={`px-3 py-1.5 rounded-lg text-xs border ${ratio === r ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>{r}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={regenerateExact} disabled={loading || !lastRun}
              title={lastRun ? "Rerun with the exact last prompt & settings" : "Generate once first"}
              className="rounded-lg glass border border-border px-4 py-2.5 text-sm font-medium flex items-center gap-2 disabled:opacity-40">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Regenerate exact
            </button>
            <button onClick={generate} disabled={loading}
              className="rounded-lg gradient-primary text-white px-6 py-2.5 text-sm font-medium flex items-center gap-2 shadow-[var(--shadow-glow)]">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Generate
            </button>
          </div>
        </div>

        {prompt && (
          <div className="rounded-lg border border-border bg-black/30 p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Exact prompt sent to /api/generate-image
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(previewFullPrompt); toast.success("Prompt copied"); }}
                className="text-xs text-muted-foreground hover:text-white flex items-center gap-1"
              >
                <Copy className="w-3 h-3" /> Copy
              </button>
            </div>
            <code className="block text-xs font-mono text-white/90 whitespace-pre-wrap break-words">
              {previewFullPrompt}
            </code>
          </div>
        )}
      </div>

      {/* Debug panel */}
      <div className="glass rounded-2xl">
        <button onClick={() => setShowDebug((v) => !v)} className="w-full flex items-center justify-between px-6 py-3 text-sm">
          <span className="flex items-center gap-2">
            <Bug className="w-4 h-4" /> Debug panel
            {debug && (
              <span className="text-xs text-muted-foreground">
                · {debug.successCount}/{debug.successCount + debug.failureCount} ok · {debug.durationMs}ms
              </span>
            )}
          </span>
          <span className="text-xs text-muted-foreground">{showDebug ? "Hide" : "Show"}</span>
        </button>
        {showDebug && (
          <div className="px-6 pb-6 space-y-3 text-xs">
            <div className="flex flex-wrap gap-2">
              <button onClick={downloadCurrentDebug} disabled={!debug}
                className="rounded-lg gradient-primary text-white px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40">
                <FileDown className="w-3 h-3" /> Download debug JSON
              </button>
              <button onClick={loadHistory}
                className="rounded-lg glass border border-border px-3 py-1.5 flex items-center gap-1.5">
                <Download className="w-3 h-3" /> Download saved history (last 20)
              </button>
            </div>
            {!debug ? (
              <div className="text-muted-foreground">No generations yet.</div>
            ) : (
              <>
                <Section title="Request">
                  <pre className="bg-black/40 rounded p-3 overflow-auto">{JSON.stringify(debug.request, null, 2)}</pre>
                </Section>
                <Section title="Response metadata (model & params)">
                  <pre className="bg-black/40 rounded p-3 overflow-auto">
                    {JSON.stringify(debug.response ?? { note: "No metadata returned" }, null, 2)}
                  </pre>
                </Section>
                <Section title={`Errors (${debug.errors.length})`}>
                  {debug.errors.length === 0 ? (
                    <div className="text-emerald-400">None</div>
                  ) : (
                    <ul className="space-y-1">
                      {debug.errors.map((e, i) => (
                        <li key={i} className="text-rose-400 font-mono break-all">{e}</li>
                      ))}
                    </ul>
                  )}
                </Section>
                <div className="text-muted-foreground">
                  Started {debug.requestedAt} · Took {debug.durationMs}ms · Logged to your account
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {results.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <ImageIcon className="w-10 h-10 mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Your generated images will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {results.map((r, i) => (
            <div key={r.id} className="glass rounded-xl overflow-hidden group">
              <button
                onClick={() => setViewerIdx(i)}
                className={`${aspectClass[r.ratio]} relative overflow-hidden flex items-end p-3 w-full text-left cursor-zoom-in`}
                aria-label="View full screen"
              >
                <img src={r.image} alt={r.prompt} loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <span className="relative text-white text-xs glass px-2 py-1 rounded">{r.style} · {r.ratio}</span>
                <span className="absolute top-2 right-2 rounded-md bg-black/60 backdrop-blur p-1.5 opacity-0 group-hover:opacity-100 transition">
                  <Maximize2 className="w-3.5 h-3.5 text-white" />
                </span>
              </button>
              <div className="p-3">
                <div className="text-xs text-muted-foreground line-clamp-2">{r.prompt}</div>
                <div className="mt-3 flex gap-1.5">
                  <a href={r.image} download={`creatorvault-${r.id}.png`}
                    className="flex-1 rounded-lg gradient-primary text-white py-1.5 text-xs flex items-center justify-center gap-1"><Download className="w-3 h-3" /> Download</a>
                  <button
                    onClick={() => setResults((prev) => prev.filter((x) => x.id !== r.id))}
                    className="rounded-lg glass hover:bg-rose-500/20 text-rose-300 py-1.5 px-2 text-xs flex items-center justify-center"
                    title="Delete image"
                  ><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewerIdx !== null && results[viewerIdx] && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setViewerIdx(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setViewerIdx(null); }}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          {viewerIdx > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setViewerIdx((i) => (i === null ? i : i - 1)); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              aria-label="Previous"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          {viewerIdx < results.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setViewerIdx((i) => (i === null ? i : i + 1)); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              aria-label="Next"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
          <div className="max-w-[92vw] max-h-[92vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <img
              src={results[viewerIdx].image}
              alt={results[viewerIdx].prompt}
              className="max-w-[92vw] max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />
            <div className="text-xs text-white/70 text-center max-w-2xl">
              <div className="mb-1">{results[viewerIdx].style} · {results[viewerIdx].ratio} · {viewerIdx + 1}/{results.length}</div>
              <div className="line-clamp-2">{results[viewerIdx].prompt}</div>
            </div>
            <a
              href={results[viewerIdx].image}
              download={`creatorvault-${results[viewerIdx].id}.png`}
              onClick={(e) => e.stopPropagation()}
              className="rounded-lg gradient-primary text-white px-4 py-2 text-xs font-medium flex items-center gap-2"
            >
              <Download className="w-3 h-3" /> Download
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{title}</div>
      {children}
    </div>
  );
}

function downloadJson(name: string, obj: unknown) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
