import { createFileRoute, Link } from "@tanstack/react-router";
import { PLANS } from "@/lib/constants";
import { Check, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pricing")({ component: PricingPage });

function PricingPage() {
  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs text-muted-foreground mb-4">
          <Sparkles className="w-3 h-3 text-[color:var(--neon-pink)]" /> Upgrade any time
        </div>
        <h1 className="text-3xl md:text-5xl font-bold">Choose your <span className="gradient-text">plan</span></h1>
        <p className="text-muted-foreground mt-2">Cancel any time. Prices in INR.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {PLANS.map((p) => (
          <div key={p.id} className={`glass rounded-2xl p-8 relative ${p.featured ? "border-[color:var(--neon-purple)]/60 shadow-[var(--shadow-glow)]" : ""}`}>
            {p.featured && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 gradient-primary text-white text-xs px-3 py-1 rounded-full font-medium">
                Most popular
              </div>
            )}
            <h3 className="text-xl font-semibold">{p.name}</h3>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-bold">{p.price}</span>
              <span className="text-sm text-muted-foreground">{p.period}</span>
            </div>
            <ul className="mt-6 space-y-3">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-[color:var(--neon-purple)] mt-0.5 shrink-0" /> {f}
                </li>
              ))}
            </ul>
            <button className={`mt-8 w-full rounded-lg py-3 text-sm font-medium ${p.featured ? "gradient-primary text-white" : "glass hover:bg-white/5"}`}>
              {p.cta}
            </button>
          </div>
        ))}
      </div>

      <div className="text-center text-sm text-muted-foreground">
        Need custom / team pricing? <Link to="/dashboard" className="text-[color:var(--neon-purple)] hover:underline">Contact us</Link>
      </div>
    </div>
  );
}
