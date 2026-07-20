import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateCarousel } from "@/lib/generators";
import { generateAiCarousel } from "@/lib/carousel-ai.functions";
import { PLATFORMS, TONES, STYLES, NICHES, GENERATION_COST } from "@/lib/constants";
import { getAccessInfo, canGenerate } from "@/lib/access";
import { saveOutput } from "@/lib/local-store";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Wand2, ArrowRight, Layers } from "lucide-react";
import { consumeResearchPrefill, type ResearchPrefill } from "@/lib/research-prefill";
import { HandoffBanner } from "@/components/handoff-banner";
import { useAutogen } from "@/lib/use-autogen";

export const Route = createFileRoute("/_authenticated/create_/carousel")({
  head: () => ({
    meta: [
      { title: "New carousel — CreatorFlow AI" },
      { name: "description", content: "Dedicated carousel builder: cover, point slides, and CTA with AI-generated text and visuals." },
      { property: "og:title", content: "New carousel — CreatorFlow AI" },
      { property: "og:description", content: "Cover, point slides, and CTA — each with text + AI visual, ready to post." },
    ],
  }),
  component: CreateCarouselPage,
});

const RATIOS = ["1:1", "4:5", "9:16", "16:9"] as const;

function CreateCarouselPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [handoff, setHandoff] = useState<ResearchPrefill | null>(() => consumeResearchPrefill("carousel"));
  const [form, setForm] = useState({
    topic: handoff?.topic ?? "",
    audience: handoff?.audience ?? "",
    platform: (handoff?.platform === "linkedin" || handoff?.platform === "instagram") ? handoff.platform : "instagram",
    tone: "Educational",
    style: "minimal",
    aspect_ratio: ((handoff?.aspectRatio === "1:1" || handoff?.aspectRatio === "4:5" || handoff?.aspectRatio === "9:16" || handoff?.aspectRatio === "16:9") ? handoff.aspectRatio : "4:5") as (typeof RATIOS)[number],
    slide_count: handoff?.slideCount ?? 7,
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  useAutogen(handoff, () => {
    if (form.topic.trim()) {
      toast.message("Generation started", { description: "Auto-generating from Viral Research…" });
      void generate();
    }
  });

  const structure = (() => {
    const points = Math.max(1, form.slide_count - 2);
    return `Slide 1 · Cover — Slides 2–${form.slide_count - 1} · ${points} truth/point slide${points === 1 ? "" : "s"} — Slide ${form.slide_count} · CTA`;
  })();

  async function generate() {
    if (!form.topic.trim()) return toast.error("Add a topic first");
    setLoading(true);
    try {
      const access = await getAccessInfo();
      if (!access) throw new Error("Not signed in");
      if (!canGenerate(access, GENERATION_COST)) {
        toast.error("Not enough credits. Upgrade or add credits.", {
          action: { label: "See plans", onClick: () => navigate({ to: "/pricing" }) },
        });
        setLoading(false);
        return;
      }

      const styleLabel = STYLES.find((s) => s.id === form.style)?.label ?? form.style;

      let aiCarousel: Awaited<ReturnType<typeof generateAiCarousel>> | null = null;
      try {
        aiCarousel = await generateAiCarousel({
          data: {
            topic: form.topic, tone: form.tone, platform: form.platform,
            styleLabel, slideCount: form.slide_count, aspectRatio: form.aspect_ratio,
          },
        });
      } catch (e) {
        console.warn("AI carousel generation failed, using template:", e);
        toast.warning("AI generator unavailable — using template.");
      }

      const fallback = generateCarousel({
        topic: form.topic, tone: form.tone, platform: form.platform, style: form.style,
        slideCount: form.slide_count, aspectRatio: form.aspect_ratio,
      });

      const title = aiCarousel?.title ?? fallback.title;

      const { data: project, error: pErr } = await supabase.from("projects").insert({
        user_id: access.userId,
        title,
        content_type: "carousel",
        topic: form.topic,
        audience: form.audience,
        platform: form.platform,
        tone: form.tone,
        style: form.style,
        voice: "energetic_creator",
        music: "Cinematic",
        status: "generated",
      }).select().single();
      if (pErr) throw pErr;

      if (aiCarousel) {
        const slides = aiCarousel.slides;
        const script = slides.map((s) =>
          `Slide ${s.n} — ${s.role} [${s.label}]\n${s.emoji ? s.emoji + " " : ""}${s.headline}\n\n${s.body}\n${(s.bullets ?? []).map((b) => `• ${b}`).join("\n")}\n\nKey takeaway: ${s.bottom_highlight}\nVisual: ${s.visual}`
        ).join("\n\n---\n\n");
        const captions = `${title}\n\n${slides[0]?.headline ?? ""}\n${slides[0]?.body ?? ""}\n\nSave this — share with someone who needs it.`;
        await saveOutput(project.id, {
          title,
          hook: slides[0]?.headline ?? "",
          script,
          captions,
          hashtags: fallback.hashtags,
          scenes: [],
          image_prompts: slides.map((s) => ({ n: s.n, prompt: s.image_prompt, style: styleLabel })),
          thumbnail_ideas: [],
          carousel_slides: slides.map((s) => ({
            n: s.n, role: s.role, headline: s.headline, body: s.body, visual: s.visual,
            label: s.label, emoji: s.emoji, bullets: s.bullets, bottom_highlight: s.bottom_highlight,
          })),
          aspect_ratio: form.aspect_ratio,
          slide_count: form.slide_count,
        });
      } else {
        await saveOutput(project.id, {
          title: fallback.title,
          hook: "",
          script: fallback.script,
          captions: fallback.captions,
          hashtags: fallback.hashtags,
          scenes: [],
          image_prompts: fallback.image_prompts,
          thumbnail_ideas: [],
          carousel_slides: fallback.slides,
          aspect_ratio: form.aspect_ratio,
          slide_count: form.slide_count,
        });
      }

      // Credit deduction is handled server-side inside generateAiCarousel
      // (see chargeMiddleware in src/lib/credits-guard.server.ts).


      qc.invalidateQueries({ queryKey: ["access"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["carousels"] });
      toast.success(access.isAdmin ? "Carousel generated (admin — no credits)" : "Carousel generated!");
      navigate({ to: "/carousels" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <HandoffBanner prefill={handoff} onDismiss={() => setHandoff(null)} />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-[color:var(--neon-purple)] flex items-center gap-1.5">
            <Layers className="w-3 h-3" /> Carousel builder
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mt-1">
            New <span className="gradient-text">carousel</span> project
          </h1>
          <p className="text-muted-foreground mt-1">
            Structured slides (Cover → Points → CTA), each with AI-written text and a matching visual.
          </p>
        </div>
        <Link to="/create" className="text-xs text-muted-foreground hover:text-white glass border border-border rounded-lg px-3 py-2">
          Video / other →
        </Link>
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <Section title="1. Pick a niche (optional)">
            <div className="flex flex-wrap gap-2">
              {NICHES.map((n) => (
                <button key={n.id} type="button"
                  onClick={() => set("topic", n.topics[Math.floor(Math.random() * n.topics.length)])}
                  className="glass border border-border hover:border-[color:var(--neon-purple)] rounded-full px-3 py-1.5 text-xs flex items-center gap-1.5 transition">
                  <span>{n.emoji}</span> {n.label}
                </button>
              ))}
            </div>
          </Section>

          <Section title="2. What's the carousel about?">
            <input value={form.topic} onChange={(e) => set("topic", e.target.value)}
              placeholder="e.g. 3 things nobody tells you about why every creator needs a personal AI stack"
              className="w-full bg-input/50 border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-[color:var(--neon-purple)]" />
            <input value={form.audience} onChange={(e) => set("audience", e.target.value)}
              placeholder="Target audience (optional) — e.g. solo creators, indie founders"
              className="mt-3 w-full bg-input/50 border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-[color:var(--neon-purple)]" />
          </Section>

          <Section title="3. Platform">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {PLATFORMS.map((p) => (
                <button key={p.id} onClick={() => set("platform", p.id)}
                  className={`text-left rounded-xl border p-3 flex items-center gap-2 ${form.platform === p.id ? "border-[color:var(--neon-purple)] bg-[color:var(--neon-purple)]/10 shadow-[var(--shadow-glow)]" : "border-border hover:border-white/20 bg-white/[0.02]"}`}>
                  <p.icon className="w-4 h-4" /> <span className="text-sm">{p.label}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section title="4. Tone">
            <div className="flex flex-wrap gap-2">
              {TONES.map((t) => (
                <button key={t} onClick={() => set("tone", t)}
                  className={`px-4 py-2 rounded-full text-sm border transition ${form.tone === t ? "gradient-primary text-white border-transparent shadow-lg" : "glass border-border hover:border-white/20"}`}>{t}</button>
              ))}
            </div>
          </Section>

          <div className="flex justify-end pt-2">
            <button onClick={() => setStep(2)}
              className="rounded-lg gradient-primary text-white px-6 py-3 text-sm font-medium flex items-center gap-2 shadow-lg">
              Next: Visual & layout <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <Section title="5. Visual style (drives every slide image)">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {STYLES.map((s) => (
                <button key={s.id} onClick={() => set("style", s.id)}
                  className={`relative aspect-[4/5] rounded-xl overflow-hidden p-3 flex items-end text-left transition group ${form.style === s.id ? "ring-2 ring-white shadow-[var(--shadow-glow)]" : "opacity-85 hover:opacity-100"}`}>
                  <img src={s.image} alt={s.label} loading="lazy" className="absolute inset-0 w-full h-full object-cover transition group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <span className="relative text-white font-semibold text-sm drop-shadow">{s.label}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section title="6. Layout">
            <div className="space-y-5">
              <div>
                <div className="text-xs text-muted-foreground mb-2">Aspect ratio</div>
                <div className="flex flex-wrap gap-2">
                  {RATIOS.map((r) => (
                    <button key={r} onClick={() => set("aspect_ratio", r)}
                      className={`px-4 py-2 rounded-full text-sm border ${form.aspect_ratio === r ? "gradient-primary text-white border-transparent shadow-lg" : "glass border-border hover:border-white/20"}`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2">Slides ({form.slide_count})</div>
                <input type="range" min={3} max={10} value={form.slide_count}
                  onChange={(e) => set("slide_count", parseInt(e.target.value))}
                  className="w-full max-w-md" />
                <div className="mt-2 text-[11px] text-muted-foreground">{structure}</div>
              </div>
            </div>
          </Section>

          <Section title="7. Preview structure">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Array.from({ length: form.slide_count }).map((_, i) => {
                const role = i === 0 ? "Cover" : i === form.slide_count - 1 ? "CTA" : `Truth #${i}`;
                return (
                  <div key={i} className="rounded-lg border border-border bg-black/40 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Slide {i + 1}</div>
                    <div className="mt-1 text-sm font-semibold">{role}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">Headline + bullets + visual</div>
                  </div>
                );
              })}
            </div>
          </Section>

          <div className="flex justify-between items-center pt-4">
            <button onClick={() => setStep(1)} className="text-sm text-muted-foreground hover:text-foreground">← Back</button>
            <button onClick={generate} disabled={loading}
              className="rounded-xl gradient-primary text-white px-8 py-3.5 font-semibold shadow-[var(--shadow-glow)] disabled:opacity-60 flex items-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              Generate carousel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="font-semibold mb-4">{title}</h3>
      {children}
    </div>
  );
}
