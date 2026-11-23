import { useEffect, useMemo, useRef, useState } from "react";
import {
  Play, Pause, SkipBack, SkipForward, RotateCcw, Maximize2,
  LayoutDashboard, Compass, Search, Video as VideoIcon, Layers,
  Image as ImageIcon, Wand2, Linkedin, Palette, Send, Sparkles,
  Coins, Folder, Plus, ChevronRight, Type, Mic, Clock,
} from "lucide-react";
import { DEMO_SCENES, type DemoScene } from "@/lib/landing-content";

// A polished interactive UI walkthrough of the current CreatorFlow AI product.
// This is NOT a rendered MP4 — it's a live component sequence built from the
// real app's design tokens, sidebar and module names. It plays scene-by-scene
// with autoplay, next/prev/restart and Escape-to-close in fullscreen mode.

const SCENE_MS = 6000;

const MODULE_ICON: Record<DemoScene["module"], typeof LayoutDashboard> = {
  "Dashboard": LayoutDashboard,
  "Strategy": Compass,
  "Research": Search,
  "Video Studio": VideoIcon,
  "Carousel Studio": Layers,
  "Image Studio": ImageIcon,
  "Thumbnail Studio": Wand2,
  "LinkedIn Posts": Linkedin,
  "Templates & Brand Kit": Palette,
  "Publishing": Send,
  "Result": Sparkles,
};

export function InteractiveDemo({
  autoPlay = false,
  onRequestFullscreen,
}: { autoPlay?: boolean; onRequestFullscreen?: () => void }) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  const total = DEMO_SCENES.length;
  const scene = DEMO_SCENES[idx];

  useEffect(() => {
    if (!playing) {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    startRef.current = performance.now();
    setProgress(0);
    timerRef.current = setTimeout(() => {
      setIdx((i) => (i + 1) % total);
    }, SCENE_MS);
    const tick = () => {
      const p = Math.min(1, (performance.now() - startRef.current) / SCENE_MS);
      setProgress(p);
      if (p < 1 && playing) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [idx, playing, total]);

  const go = (next: number) => {
    setIdx(((next % total) + total) % total);
    setProgress(0);
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-gradient-to-br from-[#0b0710] via-[#120818] to-[#0b0710] text-white select-none">
      {/* Top progress bars */}
      <div className="flex gap-1 p-2">
        {DEMO_SCENES.map((s, i) => (
          <button
            key={s.id}
            onClick={() => go(i)}
            aria-label={`Jump to scene ${i + 1}`}
            className="h-1 flex-1 rounded-full bg-white/10 overflow-hidden"
          >
            <div
              className="h-full bg-gradient-to-r from-[color:var(--neon-purple)] to-[color:var(--neon-pink)] transition-[width]"
              style={{
                width: i < idx ? "100%" : i === idx ? `${progress * 100}%` : "0%",
                transitionDuration: i === idx ? "80ms" : "0ms",
              }}
            />
          </button>
        ))}
      </div>

      {/* Scene stage */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <SceneStage scene={scene} />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-white/5 bg-black/40 backdrop-blur">
        <div className="flex items-center gap-2 text-xs text-white/70 min-w-0">
          <span className="hidden sm:inline">Scene {idx + 1} / {total}</span>
          <span className="truncate hidden md:inline">· {scene.module}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => go(idx - 1)} aria-label="Previous scene" className="w-9 h-9 rounded-lg hover:bg-white/10 flex items-center justify-center">
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause demo" : "Play demo"}
            className="w-11 h-11 rounded-full gradient-primary text-white flex items-center justify-center shadow-[var(--shadow-glow)]"
          >
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>
          <button onClick={() => go(idx + 1)} aria-label="Next scene" className="w-9 h-9 rounded-lg hover:bg-white/10 flex items-center justify-center">
            <SkipForward className="w-4 h-4" />
          </button>
          <button onClick={() => { setIdx(0); setPlaying(true); }} aria-label="Restart" className="w-9 h-9 rounded-lg hover:bg-white/10 flex items-center justify-center">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {onRequestFullscreen && (
            <button
              onClick={onRequestFullscreen}
              aria-label="Open fullscreen"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 hover:bg-white/10"
            >
              <Maximize2 className="w-3.5 h-3.5" /> Fullscreen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Scene renderer ---------------- */

function SceneStage({ scene }: { scene: DemoScene }) {
  const Icon = MODULE_ICON[scene.module];
  return (
    <div key={scene.id} className="absolute inset-0 flex">
      {/* Sidebar mock — matches app-shell */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col gap-1 p-3 border-r border-white/5 bg-black/30">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="w-7 h-7 rounded-lg gradient-primary flex items-center justify-center shadow-[var(--shadow-glow)]">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="font-semibold text-sm">CreatorFlow <span className="opacity-60">AI</span></div>
        </div>
        {(["Dashboard","Strategy","Research","Video Studio","Carousel Studio","Image Studio","Thumbnail Studio","LinkedIn Posts","Templates & Brand Kit","Publishing"] as DemoScene["module"][]).map((m) => {
          const I = MODULE_ICON[m];
          const active = m === scene.module;
          return (
            <div key={m} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] ${active ? "gradient-primary text-white shadow-[var(--shadow-glow)]" : "text-white/60 hover:bg-white/5"}`}>
              <I className="w-4 h-4" /> <span className="truncate">{m}</span>
            </div>
          );
        })}
      </aside>

      {/* Main canvas */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-white/5">
          <div className="flex items-center gap-2 text-sm">
            <Icon className="w-4 h-4 text-[color:var(--neon-pink)]" />
            <span className="font-medium">{scene.module}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-white/60">
            <div className="flex items-center gap-1.5 glass px-2.5 py-1 rounded-full">
              <Coins className="w-3.5 h-3.5 text-amber-400" /> 480 credits
            </div>
            <div className="w-7 h-7 rounded-full bg-white/10" />
          </div>
        </div>

        {/* Scene body */}
        <div className="flex-1 min-h-0 p-5 md:p-8 overflow-hidden">
          <div className="max-w-5xl mx-auto h-full flex flex-col">
            <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-2">{scene.module}</div>
            <h3 className="text-2xl md:text-4xl font-bold leading-tight">{scene.title}</h3>
            <p className="mt-3 text-white/70 text-sm md:text-base max-w-2xl">{scene.caption}</p>

            <div className="mt-6 flex-1 min-h-0">
              <SceneBody scene={scene} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Per-scene body (mocked real UI) ---------------- */

function SceneBody({ scene }: { scene: DemoScene }) {
  switch (scene.module) {
    case "Dashboard":       return <MockDashboard />;
    case "Strategy":        return <MockStrategy />;
    case "Research":        return <MockResearch />;
    case "Video Studio":    return <MockVideoStudio />;
    case "Carousel Studio": return <MockCarousel />;
    case "Image Studio":    return <MockImages />;
    case "Thumbnail Studio":return <MockThumbnails />;
    case "LinkedIn Posts":  return <MockLinkedIn />;
    case "Templates & Brand Kit": return <MockBrand />;
    case "Publishing":      return <MockPublish />;
    case "Result":          return <MockResult />;
  }
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`glass rounded-xl p-4 ${className}`}>{children}</div>;
}

function MockDashboard() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 h-full content-start">
      <Card><div className="text-xs text-white/60">Credits</div><div className="mt-2 text-2xl font-bold">480</div></Card>
      <Card><div className="text-xs text-white/60">Projects</div><div className="mt-2 text-2xl font-bold">27</div></Card>
      <Card><div className="text-xs text-white/60">Published</div><div className="mt-2 text-2xl font-bold">84</div></Card>
      <Card><div className="text-xs text-white/60">Views (30d)</div><div className="mt-2 text-2xl font-bold">128k</div></Card>
      <Card className="col-span-2 md:col-span-3">
        <div className="text-sm font-semibold mb-3 flex items-center gap-2"><Folder className="w-4 h-4"/> Recent projects</div>
        <div className="space-y-2">
          {["Launch reel — SaaS", "3-slide LinkedIn carousel", "Thumbnail: Best 2026 AI tools"].map((p) => (
            <div key={p} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-white/5">
              <span className="truncate">{p}</span><ChevronRight className="w-4 h-4 opacity-50"/>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <div className="text-sm font-semibold mb-3">Quick actions</div>
        <div className="grid gap-2">
          {[["New video", VideoIcon],["New carousel", Layers],["New image", ImageIcon]].map(([l, I]: any) => (
            <button key={l} className="flex items-center gap-2 text-sm rounded-lg px-3 py-2 gradient-primary text-white"><I className="w-4 h-4"/> {l}</button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function MockStrategy() {
  return (
    <div className="grid md:grid-cols-2 gap-3 h-full">
      <Card>
        <div className="text-sm font-semibold mb-3">Brief</div>
        <div className="space-y-2 text-sm">
          <Field label="Product" value="CreatorFlow AI" />
          <Field label="Audience" value="Solo creators, agencies" />
          <Field label="Goal" value="Grow to 25k followers in 90 days" />
          <Field label="Platform" value="Instagram · YouTube · LinkedIn" />
        </div>
        <button className="mt-4 gradient-primary text-white text-sm rounded-lg px-4 py-2 shadow-[var(--shadow-glow)]">Generate strategy</button>
      </Card>
      <Card>
        <div className="text-sm font-semibold mb-3">Content strategy</div>
        <ul className="text-sm space-y-2 text-white/80">
          <li>· Persona · Pain points · Voice pillars</li>
          <li>· 5 content pillars with example hooks</li>
          <li>· Awareness → Consideration → Conversion funnel</li>
          <li>· 30-day publishing calendar</li>
        </ul>
      </Card>
    </div>
  );
}

function MockResearch() {
  return (
    <div className="grid md:grid-cols-3 gap-3 h-full">
      <Card>
        <div className="text-sm font-semibold mb-2">Trending topics</div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {["AI video","short-form hooks","LinkedIn carousels","thumbnail CTR","viral b-rolls","YouTube Shorts"].map(t => (
            <span key={t} className="px-2 py-1 rounded-full bg-white/5 border border-border">{t}</span>
          ))}
        </div>
      </Card>
      <Card>
        <div className="text-sm font-semibold mb-2">Keyword opportunities</div>
        <div className="text-xs space-y-1.5">
          {[["ai content platform","12k","Low"],["thumbnail generator","28k","Med"],["ai carousel maker","9k","Low"]].map(([k,v,c]) => (
            <div key={k} className="flex justify-between"><span>{k}</span><span className="opacity-60">{v} · {c}</span></div>
          ))}
        </div>
      </Card>
      <Card>
        <div className="text-sm font-semibold mb-2">Competitor gaps</div>
        <ul className="text-xs space-y-1.5 opacity-80">
          <li>· No structured video blueprint</li>
          <li>· Weak on LinkedIn carousels</li>
          <li>· Slow thumbnail iteration</li>
        </ul>
      </Card>
    </div>
  );
}

function MockVideoStudio() {
  return (
    <div className="grid md:grid-cols-[1.2fr_1fr] gap-3 h-full">
      <Card>
        <div className="text-sm font-semibold mb-2 flex items-center gap-2"><Type className="w-4 h-4"/> Script &amp; scenes</div>
        <div className="space-y-2 text-xs">
          {[
            "Hook: 'Stop making thumbnails one at a time.'",
            "Scene 1: split-screen — chaotic Figma vs. CreatorFlow grid",
            "Scene 2: 4 concepts generated in 6 seconds",
            "CTA: 'Try free — creatorflowai.prodxstore.com'",
          ].map((s, i) => (
            <div key={i} className="rounded-lg bg-white/5 px-3 py-2">{s}</div>
          ))}
        </div>
      </Card>
      <div className="flex flex-col gap-3">
        <Card><div className="text-sm font-semibold mb-2 flex items-center gap-2"><Mic className="w-4 h-4"/> Voice</div><div className="text-xs opacity-80">Energetic · Male · EN-US</div></Card>
        <Card><div className="text-sm font-semibold mb-2">Captions</div><div className="text-xs opacity-80">Auto · Bold · Yellow accent</div></Card>
        <button className="gradient-primary text-white text-sm rounded-lg px-4 py-2 shadow-[var(--shadow-glow)] mt-auto">Render short (12 credits)</button>
      </div>
    </div>
  );
}

function MockCarousel() {
  return (
    <div className="grid grid-cols-5 gap-2 h-full">
      {[0,1,2,3,4].map(i => (
        <div key={i} className="rounded-lg bg-gradient-to-br from-white/5 to-white/[0.02] border border-border p-3 flex flex-col">
          <div className="text-[10px] uppercase opacity-60">Slide {i+1}</div>
          <div className="mt-2 text-xs font-semibold leading-tight">{["Hook","Problem","Insight","Proof","CTA"][i]}</div>
          <div className="mt-auto space-y-1">
            <div className="h-1 w-4/5 bg-white/10 rounded"/>
            <div className="h-1 w-3/5 bg-white/10 rounded"/>
          </div>
        </div>
      ))}
    </div>
  );
}

function MockImages() {
  return (
    <div className="grid grid-cols-4 gap-2 h-full">
      {[0,1,2,3,4,5,6,7].map(i => (
        <div key={i} className={`rounded-lg aspect-square border border-border ${
          ["bg-gradient-to-br from-fuchsia-500/40 to-orange-500/40",
           "bg-gradient-to-br from-purple-500/40 to-sky-500/40",
           "bg-gradient-to-br from-orange-500/40 to-rose-500/40",
           "bg-gradient-to-br from-emerald-500/40 to-cyan-500/40"][i % 4]
        }`} />
      ))}
    </div>
  );
}

function MockThumbnails() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 h-full">
      {["Best AI in 2026","This changed everything","I tested 47 tools","Do NOT miss this"].map((t, i) => (
        <div key={t} className={`relative rounded-lg overflow-hidden aspect-video border border-border ${
          ["bg-gradient-to-br from-orange-500 to-rose-600",
           "bg-gradient-to-br from-fuchsia-600 to-indigo-700",
           "bg-gradient-to-br from-amber-400 to-red-600",
           "bg-gradient-to-br from-purple-600 to-pink-500"][i]
        }`}>
          <div className="absolute inset-0 bg-black/20"/>
          <div className="absolute inset-0 p-2 flex items-end">
            <div className="text-white font-extrabold text-sm leading-tight drop-shadow">{t}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MockLinkedIn() {
  return (
    <div className="grid md:grid-cols-[1fr_1fr] gap-3 h-full">
      <Card>
        <div className="text-sm font-semibold mb-2">Post</div>
        <div className="text-xs opacity-80 leading-relaxed">
          I stopped shipping content for a week to test one thing: can AI actually run a creator's full workflow?<br/><br/>
          Here's what CreatorFlow AI built for me in 12 minutes ↓
        </div>
      </Card>
      <div className="grid grid-cols-3 gap-2">
        {[0,1,2,3,4,5].map(i => (
          <div key={i} className="rounded-lg aspect-square bg-gradient-to-br from-orange-500/30 to-pink-500/30 border border-border flex items-center justify-center text-[10px] opacity-70">
            Slide {i+1}
          </div>
        ))}
      </div>
    </div>
  );
}

function MockBrand() {
  return (
    <div className="grid md:grid-cols-3 gap-3 h-full">
      <Card>
        <div className="text-sm font-semibold mb-2">Logo</div>
        <div className="h-16 rounded-lg gradient-primary flex items-center justify-center text-white font-bold">CreatorFlow</div>
      </Card>
      <Card>
        <div className="text-sm font-semibold mb-2">Brand colors</div>
        <div className="flex gap-2">
          {["#ff5b1f","#ff2e6a","#7a3bff","#0e0b16"].map(c => (
            <div key={c} className="w-10 h-10 rounded-lg border border-border" style={{ background: c }}/>
          ))}
        </div>
      </Card>
      <Card>
        <div className="text-sm font-semibold mb-2">Voice</div>
        <div className="text-xs opacity-80">Bold · Confident · Practical</div>
        <div className="mt-3 text-sm font-semibold">Fonts</div>
        <div className="text-xs opacity-80">Space Grotesk · Inter</div>
      </Card>
    </div>
  );
}

function MockPublish() {
  const platforms = [
    ["Instagram","from-pink-500 to-fuchsia-500"],
    ["YouTube","from-red-500 to-rose-500"],
    ["LinkedIn","from-sky-500 to-blue-600"],
    ["Facebook","from-blue-500 to-indigo-600"],
  ] as const;
  return (
    <div className="grid md:grid-cols-2 gap-3 h-full">
      <Card>
        <div className="text-sm font-semibold mb-3">Connected accounts</div>
        <div className="space-y-2">
          {platforms.map(([p, g]) => (
            <div key={p} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
              <div className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full bg-gradient-to-br ${g}`}/> {p}</div>
              <span className="text-xs text-emerald-400">Connected</span>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <div className="text-sm font-semibold mb-3">Schedule</div>
        <div className="grid grid-cols-7 gap-1 text-[10px] text-center">
          {Array.from({ length: 21 }).map((_, i) => (
            <div key={i} className={`aspect-square rounded ${i % 4 === 0 ? "gradient-primary" : "bg-white/5"} flex items-center justify-center`}>
              {(i % 30) + 1}
            </div>
          ))}
        </div>
        <button className="mt-3 gradient-primary text-white text-sm rounded-lg px-4 py-2 w-full">Publish 3 assets</button>
      </Card>
    </div>
  );
}

function MockResult() {
  const chips = ["Video","Carousel","Image","Thumbnail","Caption","LinkedIn"];
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-4">
      <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
        {chips.map(c => (
          <span key={c} className="glass px-3 py-1.5 rounded-full text-sm">{c}</span>
        ))}
      </div>
      <div className="text-3xl md:text-5xl font-extrabold gradient-text">Create. Publish. Grow.</div>
      <div className="text-white/60">with CreatorFlow AI</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2">
      <span className="text-xs uppercase tracking-wider text-white/50">{label}</span>
      <span className="text-white/90 truncate">{value}</span>
    </div>
  );
}
