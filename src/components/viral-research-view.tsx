import { useMemo, useState } from "react";
import { detectTopicLanguage } from "@/lib/content-language";
import {
  AlertTriangle, CheckCircle2, ChevronDown, Sparkles, TrendingUp,
  TrendingDown, Activity, Calendar as CalendarIcon, Info,
} from "lucide-react";
import type {
  ResearchFindings, ScoreCard, TrendDirection, ViralAnalysis,
} from "@/lib/research.functions";
import { recommendationLabel } from "@/lib/research.functions";

export function ViralResearchView({ findings }: { findings: ResearchFindings }) {
  const va = findings.viralAnalysis;
  const breakdown = findings.scoreBreakdown ?? [];
  const trend = findings.trendDirection;
  const act = findings.actionable;
  const isLive = findings.evidenceMode === "mixed" || findings.evidenceMode === "live";
  // Older live reports put the link inside the note ("… Open: https://…").
  const similarAll = (findings.similarContent ?? []).map((s) => {
    const m = /\s*Open:\s*(https?:\/\/\S+)\s*$/.exec(s.whyItWorked ?? "");
    return m
      ? { ...s, url: s.url ?? m[1], whyItWorked: s.whyItWorked.slice(0, m.index).replace(/^Real top result — /, "") }
      : s;
  });
  const langs = Array.from(new Set(similarAll.map((s) => s.language ?? detectTopicLanguage(s.title))));
  const [langFilter, setLangFilter] = useState<string>("all");
  const similar = langFilter === "all" ? similarAll : similarAll.filter((s) => (s.language ?? detectTopicLanguage(s.title)) === langFilter);

  return (
    <div className="space-y-6">
      {va && <VerdictCard va={va} evidenceMode={findings.evidenceMode} generatedAt={findings.generatedAt} />}

      {trend && <TrendBanner trend={trend} />}

      {breakdown.length > 0 && (
        <section>
          <SectionHeader title="Score breakdown" subtitle="10 factors — lower is better where marked." />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {breakdown.map((s) => <ScoreTile key={s.key} card={s} />)}
          </div>
        </section>
      )}

      {act && (
        <section className="space-y-4">
          <SectionHeader title="Actionable outputs" subtitle="Ready-to-use angles, titles, hooks, and thumbnails." />
          <div className="grid md:grid-cols-2 gap-4">
            <Panel title="Best content angle" tone="accent"><p className="text-sm">{act.bestAngle}</p></Panel>
            <Panel title="Content gap"><p className="text-sm">{act.contentGap}</p></Panel>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Panel title="10 title options">
              <ol className="text-sm space-y-1 list-decimal pl-4">
                {act.titles?.map((t, i) => <li key={i}>{t}</li>)}
              </ol>
            </Panel>
            <Panel title="5 opening hooks">
              <ul className="text-sm space-y-1">
                {act.hooks?.map((h, i) => <li key={i}>“{h}”</li>)}
              </ul>
            </Panel>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <Panel title="Thumbnail concepts">
              <ul className="text-sm space-y-1">
                {act.thumbnailConcepts?.map((c, i) => <li key={i}>• {c}</li>)}
              </ul>
              <div className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground">Recommended text</div>
              <div className="mt-1 text-lg font-black tracking-tight bg-gradient-to-r from-orange-400 to-pink-500 bg-clip-text text-transparent">
                {act.thumbnailText}
              </div>
            </Panel>
            <Panel title="Format & platform">
              <Row label="Best platform" value={act.bestPlatform} />
              <Row label="Format" value={act.suggestedFormat} />
              <Row label="Duration" value={act.suggestedDuration} />
              <Row label="Urgency" value={urgencyLabel(act.urgency)} />
            </Panel>
            <Panel title="CTA / Keywords / Hashtags">
              <div className="text-sm mb-2"><span className="text-muted-foreground">CTA:</span> {act.cta}</div>
              <ChipList items={act.keywords} />
              <div className="mt-2"><ChipList items={act.hashtags} tone="accent" /></div>
            </Panel>
          </div>
        </section>
      )}

      <Collapsible title={isLive ? "Similar content (live YouTube data)" : "Similar content (AI estimate)"} defaultOpen={findings.evidenceMode === "mixed"}>
        {langs.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label="Filter by language">
            {["all", ...langs].map((l) => (
              <button key={l} type="button" onClick={() => setLangFilter(l)}
                className={`px-2.5 py-1 rounded-full text-[11px] border ${langFilter === l ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>
                {l === "all" ? `All languages (${similarAll.length})` : `${l} (${similarAll.filter((s) => (s.language ?? detectTopicLanguage(s.title)) === l).length})`}
              </button>
            ))}
          </div>
        )}
        {similar.length ? (
          <div className="space-y-2">
            {similar.map((s, i) => (
              <div key={i} className="rounded-xl border border-white/10 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  {s.url
                    ? <a href={s.url} target="_blank" rel="noreferrer" className="font-medium truncate hover:underline">{s.title}</a>
                    : <div className="font-medium truncate">{s.title}</div>}
                  {s.metric && <span className="text-xs text-emerald-400 shrink-0">{s.metric}</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {[s.creator, s.platform, s.language, s.length, s.publishedAt].filter(Boolean).join(" · ")}
                </div>
                <div className="text-xs mt-1 italic text-muted-foreground">{s.whyItWorked}</div>
              </div>
            ))}
            {!isLive && (
              <div className="text-[11px] text-amber-300/80 flex items-center gap-1.5">
                <Info className="w-3 h-3" /> Similar content shown as AI estimates. Live public data is not connected.
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            {similarAll.length ? "No videos in this language." : isLive ? "No similar videos found on YouTube for this topic." : "No similar content available. Live public data is not connected."}
          </div>
        )}
      </Collapsible>

      <Collapsible title="Deep signals (Trends, Reddit, YouTube, Keywords)" defaultOpen={false}>
        <div className="grid md:grid-cols-2 gap-4">
          <Panel title="Google Trends (AI estimate)">
            {findings.googleTrends?.risingQueries?.length ? (
              <ul className="text-sm space-y-1">
                {findings.googleTrends.risingQueries.map((q, i) => (
                  <li key={i} className="flex justify-between gap-2"><span className="truncate">{q.term}</span><span className="text-emerald-400 text-xs shrink-0">{q.growth}</span></li>
                ))}
              </ul>
            ) : <Empty />}
            {findings.googleTrends?.seasonality && (
              <div className="text-[11px] mt-2 text-muted-foreground">{findings.googleTrends.seasonality}</div>
            )}
          </Panel>
          <Panel title="Reddit discussions (AI estimate)">
            {findings.redditDiscussions?.length ? (
              <ul className="text-sm space-y-2">
                {findings.redditDiscussions.map((r, i) => (
                  <li key={i} className="border-b border-white/5 pb-2 last:border-0">
                    <div className="text-xs text-orange-400">{r.subreddit}</div>
                    <div className="text-xs mt-0.5">{r.title}</div>
                    <div className="text-[11px] text-muted-foreground italic">{r.insight}</div>
                  </li>
                ))}
              </ul>
            ) : <Empty />}
          </Panel>
          <Panel title={isLive ? "YouTube search patterns (based on live results)" : "YouTube search patterns (AI estimate)"}>
            {findings.youtubeSearches?.length ? (
              <ul className="text-sm space-y-2">
                {findings.youtubeSearches.map((y, i) => (
                  <li key={i} className="border-b border-white/5 pb-2 last:border-0">
                    <div className="text-xs">"{y.query}" <span className="text-red-400 ml-1">{y.estViews}</span></div>
                    <div className="text-[11px]">Angle: {y.topVideoAngle}</div>
                    <div className="text-[11px] text-primary/80 italic">Gap: {y.contentGap}</div>
                  </li>
                ))}
              </ul>
            ) : <Empty />}
          </Panel>
          <Panel title="Keywords">
            {findings.keywords?.length ? (
              <ul className="text-sm space-y-1">
                {findings.keywords.map((k, i) => (
                  <li key={i} className="flex justify-between gap-2 text-xs">
                    <span className="truncate">{k.term}</span>
                    <span className="text-muted-foreground shrink-0">{[k.volume, k.difficulty].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty />}
          </Panel>
        </div>
      </Collapsible>

      {findings.disclaimers?.length ? (
        <div className="text-[11px] text-muted-foreground border-t border-white/5 pt-3">
          {/* Only the app's own data note; older reports also stored the model's working notes after it. */}
          {findings.disclaimers.slice(0, 1).map((d, i) => <div key={i} className="flex gap-1.5"><Info className="w-3 h-3 mt-0.5 shrink-0" /> {d}</div>)}
        </div>
      ) : null}
    </div>
  );
}

// ---------- Sub-components ----------

function VerdictCard({ va, evidenceMode, generatedAt }: { va: ViralAnalysis; evidenceMode?: string; generatedAt?: string }) {
  const style = recStyle(va.recommendation);
  const s = Math.max(0, Math.min(100, va.score));
  return (
    <div className={`glass rounded-2xl p-6 border ${style.border} relative overflow-hidden`}>
      <div className={`absolute inset-0 opacity-10 bg-gradient-to-br ${style.gradient} pointer-events-none`} />
      <div className="relative flex flex-col md:flex-row md:items-center gap-6">
        <div className="shrink-0">
          <ScoreRing score={s} gradient={style.gradient} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${style.badge}`}>
            {style.icon}
            {recommendationLabel(va.recommendation)}
          </div>
          <h2 className="mt-2 text-2xl font-bold">{va.verdict}</h2>
          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {/* Without live data an estimate can't be "high" confidence — cap it so the two labels agree. */}
            <span>Confidence: <span className="text-foreground/80 capitalize">{evidenceMode === "live" ? va.confidence : (va.confidence === "high" ? "medium" : va.confidence)}</span>{evidenceMode !== "live" && <span className="text-muted-foreground"> (estimate)</span>}</span>
            <span>Evidence: <span className="text-amber-300">{evidenceMode === "live" ? "Live data" : evidenceMode === "mixed" ? "Live YouTube + AI estimate" : "AI strategic estimate"}</span></span>
            {generatedAt && <span>{new Date(generatedAt).toLocaleString()}</span>}
          </div>
        </div>
      </div>
      <div className="relative grid md:grid-cols-3 gap-4 mt-6">
        <ReasonList icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} title="Why" items={va.reasons} />
        <ReasonList icon={<AlertTriangle className="w-4 h-4 text-red-400" />} title="Risks" items={va.risks} />
        <ReasonList icon={<Sparkles className="w-4 h-4 text-primary" />} title="Improvements" items={va.improvements} />
      </div>
    </div>
  );
}

function ScoreRing({ score, gradient }: { score: number; gradient: string }) {
  const r = 42, c = 2 * Math.PI * r;
  const off = c - (score / 100) * c;
  return (
    <div className="relative w-28 h-28">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={r} stroke="rgba(255,255,255,0.1)" strokeWidth="8" fill="none" />
        <circle cx="50" cy="50" r={r} stroke="url(#ringGrad)" strokeWidth="8" fill="none"
                strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={`text-3xl font-black bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}>{score}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">/ 100</div>
      </div>
    </div>
  );
}

function ReasonList({ icon, title, items }: { icon: React.ReactNode; title: string; items?: string[] }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{icon}{title}</div>
      <ul className="mt-2 space-y-1 text-sm">
        {(items ?? []).map((r, i) => <li key={i}>• {r}</li>)}
        {(!items || items.length === 0) && <li className="text-xs text-muted-foreground">—</li>}
      </ul>
    </div>
  );
}

function TrendBanner({ trend }: { trend: { direction: TrendDirection; note: string } }) {
  const map: Record<TrendDirection, { label: string; icon: React.ReactNode; color: string }> = {
    exploding: { label: "Exploding", icon: <TrendingUp className="w-4 h-4" />, color: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" },
    rising:    { label: "Rising",    icon: <TrendingUp className="w-4 h-4" />, color: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" },
    stable:    { label: "Stable",    icon: <Activity className="w-4 h-4" />,   color: "text-blue-300 bg-blue-500/10 border-blue-500/30" },
    seasonal:  { label: "Seasonal",  icon: <CalendarIcon className="w-4 h-4" />, color: "text-amber-300 bg-amber-500/10 border-amber-500/30" },
    declining: { label: "Declining", icon: <TrendingDown className="w-4 h-4" />, color: "text-red-300 bg-red-500/10 border-red-500/30" },
  };
  const t = map[trend.direction] ?? map.stable;
  return (
    <div className={`glass rounded-xl px-4 py-3 border flex items-center gap-3 ${t.color}`}>
      {t.icon}
      <div className="text-sm"><span className="font-semibold">{t.label} trend</span> — <span className="text-muted-foreground">{trend.note}</span></div>
    </div>
  );
}

function ScoreTile({ card }: { card: ScoreCard }) {
  const s = Math.max(0, Math.min(100, card.score));
  const effective = card.lowerIsBetter ? 100 - s : s;
  const tone =
    effective >= 75 ? "from-emerald-400 to-emerald-600" :
    effective >= 50 ? "from-orange-400 to-pink-500" :
    effective >= 30 ? "from-amber-400 to-orange-500" :
                      "from-red-400 to-red-600";
  return (
    <div className="glass rounded-xl border border-white/10 p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {card.label}
          {card.lowerIsBetter && <span className="ml-1 text-[9px] text-amber-300 normal-case">(lower is better)</span>}
        </div>
        <div className="text-lg font-black">{s}</div>
      </div>
      <div className="mt-2 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${tone}`} style={{ width: `${s}%` }} />
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{card.reason}</div>
    </div>
  );
}

function Panel({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "accent" }) {
  return (
    <div className={`glass rounded-xl border p-4 ${tone === "accent" ? "border-orange-500/30" : "border-white/10"}`}>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-2 text-sm py-1 border-b border-white/5 last:border-0">
      <span className="text-muted-foreground">{label}</span><span className="text-right">{value ?? "—"}</span>
    </div>
  );
}

function ChipList({ items, tone }: { items?: string[]; tone?: "accent" }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((k, i) => (
        <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full border ${tone === "accent" ? "border-pink-500/40 text-pink-200" : "border-white/10 text-muted-foreground"}`}>{k}</span>
      ))}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <div className="text-lg font-semibold">{title}</div>
      {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
    </div>
  );
}

function Collapsible({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="glass rounded-2xl border border-white/10">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-5 py-3 text-left">
        <span className="text-sm font-semibold">{title}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

function Empty() { return <div className="text-xs text-muted-foreground">No data</div>; }

function urgencyLabel(u: string) {
  switch (u) {
    case "today": return "Publish today";
    case "24h":   return "Within 24 hours";
    case "this_week": return "This week";
    case "evergreen": return "Evergreen";
    default: return u;
  }
}

function recStyle(r: ViralAnalysis["recommendation"]) {
  switch (r) {
    case "create_now":
      return { border: "border-emerald-500/40", badge: "bg-emerald-500/15 text-emerald-300", icon: <CheckCircle2 className="w-3.5 h-3.5" />, gradient: "from-emerald-400 to-teal-500" };
    case "high_potential":
      return { border: "border-orange-500/40", badge: "bg-orange-500/15 text-orange-300", icon: <Sparkles className="w-3.5 h-3.5" />, gradient: "from-orange-400 to-pink-500" };
    case "needs_angle":
      return { border: "border-amber-500/40", badge: "bg-amber-500/15 text-amber-300", icon: <Sparkles className="w-3.5 h-3.5" />, gradient: "from-amber-400 to-orange-500" };
    case "risky":
      return { border: "border-red-500/40", badge: "bg-red-500/15 text-red-300", icon: <AlertTriangle className="w-3.5 h-3.5" />, gradient: "from-red-400 to-orange-500" };
    case "avoid":
      return { border: "border-red-600/50", badge: "bg-red-600/20 text-red-300", icon: <AlertTriangle className="w-3.5 h-3.5" />, gradient: "from-red-500 to-red-700" };
  }
}

export function useVerdictHasData(f: ResearchFindings) {
  return useMemo(() => !!f.viralAnalysis, [f]);
}
