import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { STYLES } from "@/lib/constants";
import { Loader2, Wand2, Download, Save, Image as ImageIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/images")({ component: ImagesPage });

const RATIOS = ["1:1", "9:16", "16:9", "4:5"];

function ImagesPage() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("cinematic");
  const [ratio, setRatio] = useState("1:1");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Array<{ id: string; prompt: string; style: string; ratio: string; grad: string }>>([]);

  async function generate() {
    if (!prompt.trim()) return toast.error("Enter a prompt");
    setLoading(true);
    await new Promise((r) => setTimeout(r, 900));
    const chosen = STYLES.find((s) => s.id === style)!;
    setResults((prev) => [
      ...Array.from({ length: 4 }).map((_, i) => ({
        id: crypto.randomUUID(), prompt, style, ratio, grad: chosen.grad,
      })),
      ...prev,
    ]);
    setLoading(false);
    toast.success("Generated 4 concepts");
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
          <button onClick={generate} disabled={loading}
            className="rounded-lg gradient-primary text-white px-6 py-2.5 text-sm font-medium flex items-center gap-2 shadow-[var(--shadow-glow)]">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Generate
          </button>
        </div>
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
              <div className={`${aspectClass[r.ratio]} bg-gradient-to-br ${r.grad} relative flex items-end p-3`}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_60%)]" />
                <span className="relative text-white text-xs glass px-2 py-1 rounded">{r.style} · {r.ratio}</span>
              </div>
              <div className="p-3">
                <div className="text-xs text-muted-foreground line-clamp-2">{r.prompt}</div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => save(r)} className="flex-1 rounded-lg glass hover:bg-white/5 py-1.5 text-xs flex items-center justify-center gap-1"><Save className="w-3 h-3" /> Save</button>
                  <button onClick={() => toast.info("Connect image API to enable download")}
                    className="flex-1 rounded-lg gradient-primary text-white py-1.5 text-xs flex items-center justify-center gap-1"><Download className="w-3 h-3" /> Download</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
