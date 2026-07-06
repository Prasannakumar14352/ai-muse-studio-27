import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateProject } from "@/lib/generators";
import { CONTENT_TYPES, PLATFORMS, TONES, STYLES, VOICES, MUSIC, GENERATION_COST } from "@/lib/constants";
import { deductUsage, getAccessInfo, canGenerate } from "@/lib/access";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Wand2, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/create")({ component: CreatePage });

function CreatePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    content_type: "short_reel",
    topic: "",
    audience: "",
    platform: "instagram",
    tone: "Viral",
    style: "cinematic",
    voice: "energetic_creator",
    music: "Cinematic",
  });

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleGenerate() {
    if (!form.topic.trim()) return toast.error("Please enter a topic");
    setLoading(true);
    try {
      const access = await getAccessInfo();
      if (!access) throw new Error("Not signed in");

      if (!canGenerate(access, GENERATION_COST)) {
        toast.error("Not enough credits. Upgrade your plan or add credits.", {
          action: { label: "See plans", onClick: () => navigate({ to: "/pricing" }) },
        });
        setLoading(false);
        return;
      }

      const output = generateProject({
        topic: form.topic, tone: form.tone, platform: form.platform, style: form.style,
      });

      const { data: project, error: pErr } = await supabase.from("projects").insert({
        user_id: access.userId,
        title: output.title,
        content_type: form.content_type,
        topic: form.topic,
        audience: form.audience,
        platform: form.platform,
        tone: form.tone,
        style: form.style,
        voice: form.voice,
        music: form.music,
        status: "generated",
      }).select().single();
      if (pErr) throw pErr;

      const { error: oErr } = await supabase.from("generated_outputs").insert({
        project_id: project.id,
        user_id: access.userId,
        title: output.title,
        hook: output.hook,
        script: output.script,
        captions: output.captions,
        hashtags: output.hashtags,
        scenes: output.scenes,
        image_prompts: output.image_prompts,
        thumbnail_ideas: output.thumbnail_ideas,
      });
      if (oErr) throw oErr;

      // Deduct credits (admin bypass handled server-side + client-side)
      const result = await deductUsage({
        amount: GENERATION_COST,
        projectId: project.id,
        description: `Generated ${form.content_type}: ${output.title}`,
      });
      if (!result.ok && result.error !== "not_authenticated") {
        console.warn("Deduction failed:", result.error);
      }

      qc.invalidateQueries({ queryKey: ["access"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success(access.isAdmin ? "Generated (admin — no credits used)" : "Project generated!");
      navigate({ to: "/projects/$id", params: { id: project.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold">Create a <span className="gradient-text">new project</span></h1>
        <p className="text-muted-foreground mt-1">Step {step} of 3 — configure your generation.</p>
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <Section title="1. What are you creating?">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {CONTENT_TYPES.map((c) => (
                <Card key={c.id} active={form.content_type === c.id} onClick={() => update("content_type", c.id)}>
                  <c.icon className="w-5 h-5 mb-3 text-[color:var(--neon-purple)]" />
                  <div className="font-medium text-sm">{c.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">{c.desc}</div>
                </Card>
              ))}
            </div>
          </Section>

          <Section title="2. What's it about?">
            <input value={form.topic} onChange={(e) => update("topic", e.target.value)}
              placeholder="e.g. Why silent walking is the new meditation"
              className="w-full bg-input/50 border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-[color:var(--neon-purple)]" />
            <input value={form.audience} onChange={(e) => update("audience", e.target.value)}
              placeholder="Target audience (optional) — e.g. Gen Z fitness enthusiasts"
              className="mt-3 w-full bg-input/50 border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-[color:var(--neon-purple)]" />
          </Section>

          <Section title="3. Platform">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {PLATFORMS.map((p) => (
                <Card key={p.id} active={form.platform === p.id} onClick={() => update("platform", p.id)} compact>
                  <p.icon className="w-4 h-4" /> <span className="text-sm">{p.label}</span>
                </Card>
              ))}
            </div>
          </Section>

          <NavRow onNext={() => setStep(2)} nextLabel="Next: Style" />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <Section title="4. Tone">
            <div className="flex flex-wrap gap-2">
              {TONES.map((t) => (
                <button key={t} onClick={() => update("tone", t)}
                  className={`px-4 py-2 rounded-full text-sm border transition ${
                    form.tone === t ? "gradient-primary text-white border-transparent shadow-lg" : "glass border-border hover:border-white/20"
                  }`}>{t}</button>
              ))}
            </div>
          </Section>

          <Section title="5. Visual Style">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {STYLES.map((s) => (
                <button key={s.id} onClick={() => update("style", s.id)}
                  className={`relative aspect-[4/5] rounded-xl overflow-hidden p-3 flex items-end text-left transition group ${
                    form.style === s.id ? "ring-2 ring-white shadow-[var(--shadow-glow)]" : "opacity-85 hover:opacity-100"
                  }`}>
                  <img src={s.image} alt={s.label} loading="lazy" className="absolute inset-0 w-full h-full object-cover transition group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <span className="relative text-white font-semibold text-sm drop-shadow">{s.label}</span>
                </button>
              ))}
            </div>
          </Section>

          <NavRow onBack={() => setStep(1)} onNext={() => setStep(3)} nextLabel="Next: Voice & Music" />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <Section title="6. Voice">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {VOICES.map((v) => (
                <Card key={v.id} active={form.voice === v.id} onClick={() => update("voice", v.id)} compact>
                  <span className="text-sm">{v.label}</span>
                </Card>
              ))}
            </div>
          </Section>

          <Section title="7. Background Music">
            <div className="flex flex-wrap gap-2">
              {MUSIC.map((m) => (
                <button key={m} onClick={() => update("music", m)}
                  className={`px-4 py-2 rounded-full text-sm border transition ${
                    form.music === m ? "gradient-primary text-white border-transparent shadow-lg" : "glass border-border hover:border-white/20"
                  }`}>{m}</button>
              ))}
            </div>
          </Section>

          <div className="flex justify-between items-center pt-4">
            <button onClick={() => setStep(2)} className="text-sm text-muted-foreground hover:text-foreground">← Back</button>
            <button onClick={handleGenerate} disabled={loading}
              className="rounded-xl gradient-primary text-white px-8 py-3.5 font-semibold shadow-[var(--shadow-glow)] disabled:opacity-60 flex items-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              Generate Project
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

function Card({ active, onClick, children, compact }: {
  active: boolean; onClick: () => void; children: React.ReactNode; compact?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`text-left rounded-xl border p-4 transition flex ${compact ? "items-center gap-2" : "flex-col"} ${
        active ? "border-[color:var(--neon-purple)] bg-[color:var(--neon-purple)]/10 shadow-[var(--shadow-glow)]" : "border-border hover:border-white/20 bg-white/[0.02]"
      }`}>{children}</button>
  );
}

function NavRow({ onBack, onNext, nextLabel }: { onBack?: () => void; onNext: () => void; nextLabel: string }) {
  return (
    <div className="flex justify-between items-center pt-4">
      {onBack ? <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">← Back</button> : <span />}
      <button onClick={onNext} className="rounded-lg gradient-primary text-white px-6 py-3 text-sm font-medium flex items-center gap-2 shadow-lg">
        {nextLabel} <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
