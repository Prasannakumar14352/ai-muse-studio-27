// Public "Coming soon" strip for the landing and features pages. Read-only:
// signed-out visitors can't register interest, so this links to sign-up.
import { Link } from "@tanstack/react-router";
import { Check, Wand2 } from "lucide-react";
import { COMING_SOON_TOOLS } from "@/lib/coming-soon-tools";

export function ComingSoonToolsSection({ id = "coming-soon" }: { id?: string }) {
  return (
    <section id={id} className="py-20 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-semibold rounded-full px-2.5 py-1 bg-violet-500/15 text-violet-200 border border-violet-400/20">
            <Wand2 className="w-3.5 h-3.5" /> Coming soon
          </span>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold">More one-click <span className="gradient-text">AI tools</span> on the way</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Finishing tools we're building next. Sign up free and vote for the ones you want first.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {COMING_SOON_TOOLS.map((t) => (
            <div key={t.id} className="glass rounded-2xl p-5 border border-white/10 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                  <t.icon className="w-5 h-5 text-[color:var(--neon-pink)]" />
                </div>
                <span className="text-[10px] uppercase tracking-widest font-semibold rounded-full px-2 py-0.5 bg-violet-500/15 text-violet-200 border border-violet-400/20">
                  Soon
                </span>
              </div>
              <h3 className="font-semibold">{t.title}</h3>
              <p className="text-xs text-muted-foreground">{t.text}</p>
              <ul className="mt-1 text-xs text-muted-foreground space-y-1">
                {t.points.map((p) => (
                  <li key={p} className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-violet-300" /> {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link to="/auth" className="inline-flex rounded-xl glass px-6 py-3 text-sm font-semibold hover:bg-white/5">
            Sign up free to get notified
          </Link>
        </div>
      </div>
    </section>
  );
}
