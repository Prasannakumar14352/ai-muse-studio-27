import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { generateStrategyFn, type StrategyPlan } from "@/lib/strategy.functions";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

const GOALS = ["Sales", "Education", "Entertainment", "Personal Brand"];
const PLATFORMS = ["YouTube", "Instagram", "TikTok", "LinkedIn", "X", "Facebook"];
const TONES = ["Professional", "Casual", "Playful", "Bold", "Educational", "Emotional"];
const FREQ = ["Daily", "3x/week", "Weekly", "Bi-weekly"];

export function StrategyWizard({ onCreated }: { onCreated?: (plan: StrategyPlan, id: string) => void }) {
  const [form, setForm] = useState({
    promoting: "", product: "", audience: "", goal: "Sales",
    primaryPlatform: "YouTube", secondaryPlatforms: [] as string[],
    tone: "Professional", frequency: "Weekly",
  });
  const gen = useServerFn(generateStrategyFn);
  const m = useMutation({
    mutationFn: () => gen({ data: form }),
    onSuccess: (r) => { toast.success("Strategy generated"); onCreated?.(r.plan, r.id); },
    onError: (e: Error) => toast.error(e.message),
  });

  const upd = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const togglePlat = (p: string) =>
    setForm((f) => ({ ...f, secondaryPlatforms: f.secondaryPlatforms.includes(p)
      ? f.secondaryPlatforms.filter((x) => x !== p) : [...f.secondaryPlatforms, p] }));

  return (
    <div className="glass rounded-2xl p-6 space-y-4 border border-white/10">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold">Build your content strategy</h2>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="What are you promoting?">
          <input className="input-base" value={form.promoting} onChange={(e) => upd("promoting", e.target.value)}
            placeholder="e.g. SaaS launch, coaching, community" />
        </Field>
        <Field label="Product or Brand">
          <input className="input-base" value={form.product} onChange={(e) => upd("product", e.target.value)} />
        </Field>
        <Field label="Target audience">
          <input className="input-base" value={form.audience} onChange={(e) => upd("audience", e.target.value)}
            placeholder="e.g. solo founders 25–40" />
        </Field>
        <Field label="Goal">
          <select className="input-base" value={form.goal} onChange={(e) => upd("goal", e.target.value)}>
            {GOALS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Primary platform">
          <select className="input-base" value={form.primaryPlatform} onChange={(e) => upd("primaryPlatform", e.target.value)}>
            {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Tone">
          <select className="input-base" value={form.tone} onChange={(e) => upd("tone", e.target.value)}>
            {TONES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Frequency">
          <select className="input-base" value={form.frequency} onChange={(e) => upd("frequency", e.target.value)}>
            {FREQ.map((f) => <option key={f}>{f}</option>)}
          </select>
        </Field>
        <Field label="Secondary platforms">
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.filter((p) => p !== form.primaryPlatform).map((p) => {
              const on = form.secondaryPlatforms.includes(p);
              return (
                <button key={p} type="button" onClick={() => togglePlat(p)}
                  className={`px-3 py-1 rounded-full text-xs border ${on ? "bg-primary text-primary-foreground border-primary" : "border-white/15 hover:border-white/30"}`}>
                  {p}
                </button>
              );
            })}
          </div>
        </Field>
      </div>
      <div className="flex justify-end">
        <button
          disabled={m.isPending || !form.promoting || !form.product || !form.audience}
          onClick={() => m.mutate()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary/70 text-primary-foreground font-medium disabled:opacity-50">
          {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate strategy
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 block">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}
