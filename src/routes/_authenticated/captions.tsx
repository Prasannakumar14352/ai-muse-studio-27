import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { generateCaptions, generateHashtags } from "@/lib/generators";
import { PLATFORMS, TONES } from "@/lib/constants";
import { Copy, Wand2 } from "lucide-react";
import { ProjectsSection } from "@/components/projects-section";

export const Route = createFileRoute("/_authenticated/captions")({ component: CaptionsPage });

function CaptionsPage() {
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [tone, setTone] = useState("Viral");
  const [captions, setCaptions] = useState<string[]>([]);
  const [hashtags, setHashtags] = useState<string[]>([]);

  function generate() {
    if (!topic.trim()) return toast.error("Enter a topic");
    setCaptions(generateCaptions(topic, platform, tone));
    setHashtags(generateHashtags(topic, platform));
    toast.success("Generated!");
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  }

  const hooks = [
    "POV: you just found the shortcut nobody talks about.",
    "Read this twice — it's about to change your feed.",
    "Stop what you're doing. This changes everything.",
  ];
  const ctas = [
    "Save this for later — trust me.",
    "Tag someone who needs to see this.",
    "Follow for one banger a day.",
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold">Caption & <span className="gradient-text">Hashtag</span> Generator</h1>
        <p className="text-muted-foreground mt-1">Platform-optimized captions and trending hashtag packs.</p>
      </div>

      <div className="glass rounded-2xl p-6 space-y-4">
        <input value={topic} onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic — e.g. Morning routines that actually work"
          className="w-full bg-input/50 border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-[color:var(--neon-purple)]" />

        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <button key={p.id} onClick={() => setPlatform(p.id)}
              className={`px-4 py-2 rounded-full text-sm border ${platform === p.id ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>{p.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {TONES.map((t) => (
            <button key={t} onClick={() => setTone(t)}
              className={`px-3 py-1.5 rounded-full text-xs border ${tone === t ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>{t}</button>
          ))}
        </div>

        <button onClick={generate}
          className="rounded-lg gradient-primary text-white px-6 py-2.5 text-sm font-medium flex items-center gap-2 shadow-[var(--shadow-glow)]">
          <Wand2 className="w-4 h-4" /> Generate
        </button>
      </div>

      {captions.length > 0 && (
        <div className="space-y-4">
          <div className="glass rounded-2xl p-6">
            <h2 className="font-semibold mb-3">3 Caption Options</h2>
            <div className="space-y-3">
              {captions.map((c, i) => (
                <div key={i} className="border border-border/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Option {i + 1}</span>
                    <button onClick={() => copy(c)} className="text-xs flex items-center gap-1 hover:text-foreground text-muted-foreground"><Copy className="w-3 h-3" /> Copy</button>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{c}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="glass rounded-2xl p-6">
              <h2 className="font-semibold mb-3">Hooks</h2>
              <ul className="space-y-2 text-sm">
                {hooks.map((h, i) => <li key={i} className="flex gap-2"><span className="text-[color:var(--neon-pink)]">→</span>{h}</li>)}
              </ul>
            </div>
            <div className="glass rounded-2xl p-6">
              <h2 className="font-semibold mb-3">CTAs</h2>
              <ul className="space-y-2 text-sm">
                {ctas.map((c, i) => <li key={i} className="flex gap-2"><span className="text-[color:var(--neon-purple)]">★</span>{c}</li>)}
              </ul>
            </div>
          </div>

          <div className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">30 Hashtags</h2>
              <button onClick={() => copy(hashtags.join(" "))} className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground"><Copy className="w-3 h-3" /> Copy all</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {hashtags.map((h) => <span key={h} className="text-xs glass px-2 py-1 rounded-full">{h}</span>)}
            </div>
          </div>
        </div>
      )}
      <ProjectsSection
        contentTypes={["caption_only", "seo_pack"]}
        title="Your caption & SEO projects"
        cacheKey="captions"
        showTypeFilter
        showStatusFilter
      />
    </div>
  );
}
