import type { StrategyPlan } from "@/lib/strategy.functions";
import {
  Briefcase, Calendar, Filter, Gift, Lightbulb, Megaphone, Rocket,
  Target, TrendingUp, Users,
} from "lucide-react";

export function StrategyPlanView({ plan }: { plan: StrategyPlan }) {
  return (
    <div className="space-y-6">
      <Section icon={<Target className="w-4 h-4 text-primary" />} title="Overview">
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{plan.overview}</p>
      </Section>

      {plan.businessStrategy && (
        <Section icon={<Briefcase className="w-4 h-4 text-primary" />} title="Business Strategy">
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <KV label="Positioning" value={plan.businessStrategy.positioning} />
            <KV label="Value Proposition" value={plan.businessStrategy.valueProposition} />
            <List label="Differentiators" items={plan.businessStrategy.differentiators} />
            <List label="Growth Levers" items={plan.businessStrategy.growthLevers} />
          </div>
        </Section>
      )}

      {plan.customerPersona && (
        <Section icon={<Users className="w-4 h-4 text-primary" />} title="Customer Persona">
          <div className="rounded-xl border border-white/10 p-4 bg-card/40 space-y-3">
            <div className="text-lg font-semibold">{plan.customerPersona.name}</div>
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <KV label="Demographics" value={plan.customerPersona.demographics} />
              <KV label="Psychographics" value={plan.customerPersona.psychographics} />
              <List label="Pains" items={plan.customerPersona.pains} />
              <List label="Desires" items={plan.customerPersona.desires} />
              <List label="Objections" items={plan.customerPersona.objections} />
              <List label="Triggers" items={plan.customerPersona.triggers} />
            </div>
          </div>
        </Section>
      )}

      <Section icon={<Lightbulb className="w-4 h-4 text-primary" />} title="Content Pillars">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {plan.contentPillars?.map((p) => (
            <div key={p.name} className="rounded-xl border border-white/10 p-4 bg-card/40">
              <div className="flex items-center justify-between mb-1">
                <div className="font-medium">{p.name}</div>
                {typeof p.percentage === "number" && (
                  <span className="text-xs text-primary">{p.percentage}%</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">{p.description}</div>
              {p.sampleTopics?.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs">
                  {p.sampleTopics.map((t, i) => (
                    <li key={i} className="text-muted-foreground">• {t}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Section>

      {plan.marketingFunnel && (
        <Section icon={<Filter className="w-4 h-4 text-primary" />} title="Marketing Funnel">
          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-3">
            {(["awareness", "interest", "consideration", "conversion", "retention"] as const).map((stage) => {
              const s = plan.marketingFunnel[stage];
              if (!s) return null;
              return (
                <div key={stage} className="rounded-xl border border-white/10 p-4 bg-card/40">
                  <div className="text-xs uppercase tracking-wider text-primary mb-1">{stage}</div>
                  <div className="text-xs font-medium">{s.goal}</div>
                  {s.contentTypes?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {s.contentTypes.map((c, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full border border-white/10">{c}</span>
                      ))}
                    </div>
                  )}
                  {s.example && <div className="text-xs text-muted-foreground mt-2 italic">e.g. {s.example}</div>}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {plan.campaigns?.length > 0 && (
        <Section icon={<Megaphone className="w-4 h-4 text-primary" />} title="Campaign Strategy">
          <div className="grid md:grid-cols-3 gap-3">
            {plan.campaigns.map((c) => (
              <div key={c.name} className="rounded-xl border border-white/10 p-4 bg-card/40 space-y-1.5">
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.goal}</div>
                {c.duration && <div className="text-xs"><span className="text-muted-foreground">Duration:</span> {c.duration}</div>}
                {c.hookAngle && <div className="text-xs text-primary">Hook: {c.hookAngle}</div>}
                {c.assets?.length > 0 && <div className="text-xs">Assets: {c.assets.join(", ")}</div>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {plan.offer && (
        <Section icon={<Gift className="w-4 h-4 text-primary" />} title="Offer">
          <div className="rounded-xl border border-white/10 p-4 bg-card/40 space-y-3">
            <div className="text-lg font-semibold gradient-primary bg-clip-text text-transparent">{plan.offer.headline}</div>
            <p className="text-sm">{plan.offer.coreOffer}</p>
            <div className="grid md:grid-cols-3 gap-3 text-xs">
              <KV label="Urgency" value={plan.offer.urgency} />
              <KV label="Guarantee" value={plan.offer.guarantee} />
              <KV label="Price Anchor" value={plan.offer.priceAnchor} />
            </div>
            {plan.offer.bonuses?.length > 0 && <List label="Bonuses" items={plan.offer.bonuses} />}
          </div>
        </Section>
      )}

      {plan.ctas?.length > 0 && (
        <Section icon={<Rocket className="w-4 h-4 text-primary" />} title="CTAs by funnel stage">
          <div className="grid md:grid-cols-2 gap-2">
            {plan.ctas.map((c, i) => (
              <div key={i} className="rounded-lg border border-white/10 p-3 text-sm flex gap-3">
                <span className="text-[10px] uppercase tracking-wider text-primary shrink-0 mt-0.5">{c.stage}</span>
                <span>{c.text}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {plan.thirtyDayPlan?.length > 0 && (
        <Section icon={<Calendar className="w-4 h-4 text-primary" />} title="30-Day Content Plan">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground border-b border-white/10">
                <tr>
                  <th className="text-left py-2 px-2">Day</th>
                  <th className="text-left py-2 px-2">Platform</th>
                  <th className="text-left py-2 px-2">Format</th>
                  <th className="text-left py-2 px-2">Pillar</th>
                  <th className="text-left py-2 px-2">Stage</th>
                  <th className="text-left py-2 px-2">Topic</th>
                  <th className="text-left py-2 px-2">Hook</th>
                  <th className="text-left py-2 px-2">CTA</th>
                </tr>
              </thead>
              <tbody>
                {plan.thirtyDayPlan.map((d) => (
                  <tr key={d.day} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-2 px-2 font-medium">{d.day}</td>
                    <td className="py-2 px-2">{d.platform}</td>
                    <td className="py-2 px-2">{d.format}</td>
                    <td className="py-2 px-2 text-muted-foreground">{d.pillar}</td>
                    <td className="py-2 px-2 text-primary">{d.funnelStage}</td>
                    <td className="py-2 px-2">{d.topic}</td>
                    <td className="py-2 px-2 text-muted-foreground italic">{d.hook}</td>
                    <td className="py-2 px-2">{d.cta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {plan.viralAngles?.length > 0 && (
        <Section icon={<TrendingUp className="w-4 h-4 text-primary" />} title="Viral Angles">
          <ul className="space-y-1.5 text-sm">
            {plan.viralAngles.map((a, i) => (
              <li key={i} className="flex gap-2"><span className="text-primary">→</span>{a}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="glass rounded-2xl p-6 border border-white/10">
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">{icon}{title}</h3>
      {children}
    </section>
  );
}

function KV({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function List({ label, items }: { label: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <ul className="space-y-0.5">
        {items.map((it, i) => <li key={i} className="flex gap-2"><span className="text-primary">•</span>{it}</li>)}
      </ul>
    </div>
  );
}
