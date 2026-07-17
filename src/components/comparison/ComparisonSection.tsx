import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldCheck, Info, ChevronDown } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  COMPARISON_CAPABILITIES, COMPARISON_CATEGORIES, COMPARISON_TOOLS,
  LAST_REVIEWED, getStatus, statusesRoughlyEqual,
  type ComparisonCategory,
} from "@/data/toolComparisonData";
import { ComparisonStatusBadge, statusLabel } from "./ComparisonStatusBadge";
import { cn } from "@/lib/utils";
import { SUPPORT_EMAIL } from "@/lib/constants";

type CatFilter = ComparisonCategory | "all";

export function ComparisonSection() {
  const [category, setCategory] = useState<CatFilter>("all");
  const [diffOnly, setDiffOnly] = useState(false);
  const [mobileCompetitor, setMobileCompetitor] = useState<string>("chatgpt");

  const competitors = COMPARISON_TOOLS.filter((t) => !t.isPrimary);
  const primary = COMPARISON_TOOLS.find((t) => t.isPrimary)!;

  const capabilities = useMemo(() => {
    const rows = COMPARISON_CAPABILITIES
      .filter((c) => c.active)
      .filter((c) => category === "all" || c.category === category)
      .sort((a, b) => a.displayOrder - b.displayOrder);
    if (!diffOnly) return rows;
    return rows.filter((c) => {
      const p = getStatus(primary.id, c.id)?.status;
      const comp = getStatus(mobileCompetitor, c.id)?.status;
      if (!p || !comp) return true;
      return !statusesRoughlyEqual(p, comp);
    });
  }, [category, diffOnly, mobileCompetitor, primary.id]);

  return (
    <section id="comparison" className="py-24 px-6 scroll-mt-20">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-[11px] uppercase tracking-widest text-muted-foreground mb-4">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Honest tool comparison
          </div>
          <h2 className="text-4xl md:text-5xl font-bold">
            How <span className="gradient-text">CreatorFlow AI</span> Compares
          </h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            CreatorFlow AI brings content planning, writing, visuals and creator workflows into
            one workspace. See how it compares with popular general-purpose, design and video tools.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">Last reviewed: {LAST_REVIEWED}</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter capabilities by category">
            {COMPARISON_CATEGORIES.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={category === c.id}
                onClick={() => setCategory(c.id as CatFilter)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-medium transition",
                  category === c.id
                    ? "bg-white/10 border-white/30 text-foreground"
                    : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={diffOnly}
              onChange={(e) => setDiffOnly(e.target.checked)}
              className="accent-[color:var(--neon-pink)]"
            />
            Show differences only
            <span className="hidden lg:inline text-muted-foreground/70">
              (vs {competitors.find((c) => c.id === mobileCompetitor)?.name})
            </span>
          </label>
        </div>

        {/* Desktop table */}
        <div className="hidden lg:block glass rounded-2xl overflow-hidden border border-white/10">
          <TooltipProvider delayDuration={150}>
            <table className="w-full text-sm">
              <caption className="sr-only">CreatorFlow AI capability comparison with ChatGPT, Canva, InVideo and CapCut</caption>
              <thead>
                <tr className="text-left">
                  <th scope="col" className="w-[28%] px-5 py-4 font-semibold text-xs uppercase tracking-wider text-muted-foreground border-b border-white/10">
                    Capability
                  </th>
                  {COMPARISON_TOOLS.map((tool) => (
                    <th
                      key={tool.id}
                      scope="col"
                      className={cn(
                        "px-4 py-4 font-semibold border-b border-white/10 align-bottom",
                        tool.isPrimary && "bg-gradient-to-b from-[color:var(--neon-pink)]/10 to-transparent",
                      )}
                    >
                      <div className="flex flex-col items-start gap-1">
                        {tool.isPrimary && (
                          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full gradient-primary text-white">
                            Creator workspace
                          </span>
                        )}
                        <span className="text-sm font-semibold">{tool.name}</span>
                        {tool.description && (
                          <span className="text-[11px] font-normal text-muted-foreground">{tool.description}</span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {capabilities.map((cap, idx) => (
                  <tr
                    key={cap.id}
                    className={cn(
                      "border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors",
                      idx % 2 === 1 && "bg-white/[0.015]",
                    )}
                  >
                    <th scope="row" className="px-5 py-4 text-left align-top font-medium">
                      <div className="flex items-start gap-2">
                        <span>{cap.name}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label={`More info about ${cap.name}`}
                              className="text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-white/20 rounded"
                            >
                              <Info className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs text-xs">
                            {cap.shortDescription}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </th>
                    {COMPARISON_TOOLS.map((tool) => {
                      const st = getStatus(tool.id, cap.id);
                      if (!st) {
                        return <td key={tool.id} className="px-4 py-4 align-top text-xs text-muted-foreground">—</td>;
                      }
                      return (
                        <td
                          key={tool.id}
                          className={cn("px-4 py-4 align-top", tool.isPrimary && "bg-[color:var(--neon-pink)]/[0.03]")}
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="text-left focus:outline-none focus:ring-2 focus:ring-white/20 rounded-full"
                                aria-label={`${tool.name} — ${statusLabel(st.status)}: ${st.explanation}`}
                              >
                                <ComparisonStatusBadge status={st.status} />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs space-y-1">
                              <div className="font-semibold">{tool.name} · {statusLabel(st.status)}</div>
                              <div className="text-muted-foreground">{st.explanation}</div>
                              <div className="text-[10px] text-muted-foreground/80 pt-1 border-t border-white/10">
                                {st.sourceLabel ? `Source: ${st.sourceLabel}` : "Reviewed manually"} · Verified {tool.lastVerifiedAt}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {capabilities.length === 0 && (
                  <tr>
                    <td colSpan={COMPARISON_TOOLS.length + 1} className="px-5 py-8 text-center text-sm text-muted-foreground">
                      No differences to show for this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TooltipProvider>
        </div>

        {/* Mobile / tablet view */}
        <div className="lg:hidden space-y-4">
          <div className="glass rounded-2xl p-4 border border-white/10">
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Choose a tool to compare
            </label>
            <div className="relative">
              <select
                value={mobileCompetitor}
                onChange={(e) => setMobileCompetitor(e.target.value)}
                aria-label="Select competitor to compare"
                className="w-full appearance-none rounded-lg bg-black/40 border border-white/15 pl-3 pr-9 py-2.5 text-sm outline-none focus:border-white/30"
              >
                {competitors.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
            </div>
            <div className="flex items-center justify-between mt-3 gap-2">
              <button
                onClick={() => {
                  const i = competitors.findIndex((c) => c.id === mobileCompetitor);
                  setMobileCompetitor(competitors[(i - 1 + competitors.length) % competitors.length].id);
                }}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
              >
                ← Previous
              </button>
              <button
                onClick={() => {
                  const i = competitors.findIndex((c) => c.id === mobileCompetitor);
                  setMobileCompetitor(competitors[(i + 1) % competitors.length].id);
                }}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
              >
                Next →
              </button>
            </div>
          </div>

          <div className="glass rounded-2xl overflow-hidden border border-white/10">
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-3 py-3 border-b border-white/10 text-[10px] uppercase tracking-wider text-muted-foreground">
              <div>Capability</div>
              <div>CreatorFlow AI</div>
              <div>{competitors.find((c) => c.id === mobileCompetitor)?.name}</div>
            </div>
            {capabilities.map((cap, idx) => {
              const p = getStatus(primary.id, cap.id);
              const c = getStatus(mobileCompetitor, cap.id);
              return (
                <div
                  key={cap.id}
                  className={cn(
                    "grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-3 py-3 items-center border-b border-white/5 last:border-0",
                    idx % 2 === 1 && "bg-white/[0.02]",
                  )}
                >
                  <div className="min-w-0 text-xs font-medium leading-snug">{cap.name}</div>
                  <div>{p && <ComparisonStatusBadge status={p.status} compact />}</div>
                  <div>{c && <ComparisonStatusBadge status={c.status} compact />}</div>
                </div>
              );
            })}
            {capabilities.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No differences to show for this filter.
              </div>
            )}
          </div>
        </div>

        {/* Methodology */}
        <div className="mt-8 max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="glass rounded-2xl px-4">
            <AccordionItem value="how" className="border-0">
              <AccordionTrigger className="text-sm">How we verify this comparison</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground space-y-3">
                <p>
                  We review publicly available product pages and documentation from each provider.
                  Product capabilities can vary by plan, region and release. CreatorFlow AI statuses
                  are based on the functionality currently available inside the platform.
                </p>
                <p className="text-xs">
                  Comparison last reviewed in {LAST_REVIEWED}. Features may change over time.
                  Product names and logos are trademarks of their respective owners; their inclusion
                  does not imply partnership or endorsement.
                </p>
                <p className="text-xs">
                  <a
                    href={`mailto:${SUPPORT_EMAIL}?subject=Incorrect%20comparison%20on%20CreatorFlow%20AI`}
                    className="underline hover:text-foreground"
                  >
                    Report an incorrect comparison
                  </a>
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* CTA */}
        <div className="mt-10 glass rounded-3xl p-8 md:p-10 text-center border border-white/10">
          <h3 className="text-2xl md:text-3xl font-bold">Build Your Content in One Connected Workspace</h3>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            CreatorFlow AI is designed for creators who want structured workflows for writing,
            visuals, videos, SEO and publishing without jumping between disconnected processes.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <Link
              to="/auth"
              className="rounded-xl gradient-primary px-6 py-3 text-sm font-semibold text-white shadow-lg"
            >
              Start Creating Free
            </Link>
            <a
              href="#features"
              className="rounded-xl glass px-6 py-3 text-sm font-semibold hover:bg-white/5"
            >
              Explore CreatorFlow Features
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
