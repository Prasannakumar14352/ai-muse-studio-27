import type { StrategyPlan } from "@/lib/strategy.functions";
import { Calendar, Lightbulb, Rocket, Target } from "lucide-react";

export function StrategyPlanView({ plan }: { plan: StrategyPlan }) {
  return (
    <div className="space-y-6">
      <section className="glass rounded-2xl p-6 border border-white/10">
        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><Target className="w-4 h-4 text-primary" /> Overview</h3>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{plan.overview}</p>
      </section>

      <section className="glass rounded-2xl p-6 border border-white/10">
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2"><Lightbulb className="w-4 h-4 text-primary" /> Content pillars</h3>
        <div className="grid md:grid-cols-3 gap-3">
          {plan.contentPillars?.map((p) => (
            <div key={p.name} className="rounded-xl border border-white/10 p-4 bg-card/40">
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-muted-foreground mt-1">{p.description}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="glass rounded-2xl p-6 border border-white/10">
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Monthly calendar</h3>
        <div className="space-y-4">
          {plan.monthlyCalendar?.map((w) => (
            <div key={w.week} className="rounded-xl border border-white/10 p-4 bg-card/40">
              <div className="text-sm font-medium mb-2">Week {w.week} — {w.theme}</div>
              <div className="grid md:grid-cols-2 gap-2">
                {w.posts?.map((p, i) => (
                  <div key={i} className="text-xs p-2 rounded-lg border border-white/5 bg-background/40">
                    <div className="font-medium">{p.day} · {p.platform} · {p.format}</div>
                    <div className="text-muted-foreground">{p.topic}</div>
                    <div className="text-primary mt-1">Hook: {p.hook}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="glass rounded-2xl p-6 border border-white/10">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2"><Rocket className="w-4 h-4 text-primary" /> Viral angles</h3>
          <ul className="space-y-2 text-sm">
            {plan.viralAngles?.map((a, i) => <li key={i} className="flex gap-2"><span className="text-primary">→</span>{a}</li>)}
          </ul>
        </section>
        <section className="glass rounded-2xl p-6 border border-white/10">
          <h3 className="text-lg font-semibold mb-3">Recommended CTAs</h3>
          <ul className="space-y-2 text-sm">
            {plan.ctas?.map((c, i) => <li key={i} className="flex gap-2"><span className="text-primary">•</span>{c}</li>)}
          </ul>
        </section>
      </div>

      {plan.campaigns?.length > 0 && (
        <section className="glass rounded-2xl p-6 border border-white/10">
          <h3 className="text-lg font-semibold mb-3">Campaigns</h3>
          <div className="grid md:grid-cols-3 gap-3">
            {plan.campaigns.map((c) => (
              <div key={c.name} className="rounded-xl border border-white/10 p-4 bg-card/40">
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground mt-1">{c.goal}</div>
                <div className="text-xs mt-2">Assets: {c.assets?.join(", ")}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
