import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { STYLES } from "@/lib/constants";
import { Loader2, Wand2, Download, Save, Image as ImageIcon, RefreshCw, Bug, Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/images")({ component: ImagesPage });

const RATIOS = ["1:1", "9:16", "16:9", "4:5"];

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
  const [results, setResults] = useState<Array<{ id: string; prompt: string; style: string; ratio: string; image: string }>>([]);
  const [lastRun, setLastRun] = useState<{ prompt: string; style: string; ratio: string } | null>(null);
  const [debug, setDebug] = useState<DebugInfo | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  async function runGeneration(p: string, s: string, r: string) {
    setLoading(true);
    const styleLabel = STYLES.find((x) => x.id === s)?.label ?? s;
    const startedAt = Date.now();
    const errors: string[] = [];
    let lastMeta: DebugInfo["response"] | undefined;
    try {
      const settled = await Promise.allSettled(
        Array.from({ length: 4 }).map(() =>
          fetch("/api/generate-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: p, style: styleLabel, ratio: r }),
          }).then(async (res) => {
            const json = (await res.json().catch(() => ({}))) as {
              image?: string;
              error?: string;
              debug?: DebugInfo["response"];
            };
            if (!res.ok || !json.image) throw new Error(json.error || `HTTP ${res.status}`);
            if (json.debug) lastMeta = json.debug;
            return json as { image: string; debug?: DebugInfo["response"] };
          })
        )
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
        ]);
        setLastRun({ prompt: p, style: s, ratio: r });
        toast.success(`Generated ${ok.length} of 4 concepts`);
      } else {
        toast.error(errors[0] || "Generation failed");
      }

      setDebug({
        requestedAt: new Date(startedAt).toISOString(),
        durationMs: Date.now() - startedAt,
        request: { prompt: p, style: styleLabel, ratio: r, endpoint: "/api/generate-image" },
        response: lastMeta,
        errors,
        successCount: ok.length,
        failureCount: errors.length,
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

  async function save(item: { prompt: string; style: string; ratio: string }) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("assets").insert({
      user_id: u.user.id, asset_type: "image", prompt: item.prompt, style: item.style, aspect_ratio: item.ratio,
    });
    if (error) toast.error(error.message);
    else toast.success("Saved to library");
  }

  const aspectClass: Record<string, string> = {
    "1:1": "aspect-square", "9:16": "aspect-[9/16]", "16:9": "aspect-video", "4:5": "aspect-[4/5]",
  };

  const styleLabelPreview = STYLES.find((s) => s.id === style)?.label ?? style;
  const previewFullPrompt = prompt ? `${styleLabelPreview} style. ${prompt}` : "";

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold">AI <span className="gradient-text">Image</span> Generator</h1>
        <p className="text-muted-foreground mt-1">Describe the shot. Pick a style. Generate.</p>
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

        {/* Exact prompt preview — what actually gets sent to /api/generate-image */}
        {prompt && (
          <div className="rounded-lg border border-border bg-black/30 p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Exact prompt sent to /api/generate-image
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(previewFullPrompt);
                  toast.success("Prompt copied");
                }}
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
        <button
          onClick={() => setShowDebug((v) => !v)}
          className="w-full flex items-center justify-between px-6 py-3 text-sm"
        >
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
                  Started {debug.requestedAt} · Took {debug.durationMs}ms
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
          {results.map((r) => (
            <div key={r.id} className="glass rounded-xl overflow-hidden group">
              <div className={`${aspectClass[r.ratio]} relative overflow-hidden flex items-end p-3`}>
                <img src={r.image} alt={r.prompt} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <span className="relative text-white text-xs glass px-2 py-1 rounded">{r.style} · {r.ratio}</span>
              </div>
              <div className="p-3">
                <div className="text-xs text-muted-foreground line-clamp-2">{r.prompt}</div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => save(r)} className="flex-1 rounded-lg glass hover:bg-white/5 py-1.5 text-xs flex items-center justify-center gap-1"><Save className="w-3 h-3" /> Save</button>
                  <a href={r.image} download={`creatorvault-${r.id}.png`}
                    className="flex-1 rounded-lg gradient-primary text-white py-1.5 text-xs flex items-center justify-center gap-1"><Download className="w-3 h-3" /> Download</a>
                </div>
              </div>
            </div>
          ))}
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
