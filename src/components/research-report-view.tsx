import type { ResearchFindings } from "@/lib/research.functions";
import {
  AlertCircle, Brain, GitCompare, HelpCircle, MessageSquare, Search,
  TrendingUp, Users, Youtube, Zap,
} from "lucide-react";

export function ResearchReportView({ findings }: { findings: ResearchFindings }) {
  return (
    <div className="space-y-6">
      {/* Source-specific signals */}
      <div className="grid md:grid-cols-3 gap-4">
        <SourceCard
          icon={<TrendingUp className="w-4 h-4" />}
          title="Google Trends"
          tagline={findings.googleTrends?.seasonality}
        >
          {findings.googleTrends?.risingQueries?.length ? (
            <ul className="space-y-1.5 text-sm">
              {findings.googleTrends.risingQueries.map((q, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="truncate">{q.term}</span>
                  <span className="text-xs text-emerald-400 shrink-0">{q.growth}</span>
                </li>
              ))}
            </ul>
          ) : <Empty />}
          {findings.googleTrends?.relatedTopics?.length ? (
            <div className="mt-3 flex flex-wrap gap-1">
              {findings.googleTrends.relatedTopics.map((t, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">{t}</span>
              ))}
            </div>
          ) : null}
        </SourceCard>

        <SourceCard icon={<MessageSquare className="w-4 h-4" />} title="Reddit Discussions">
          {findings.redditDiscussions?.length ? (
            <ul className="space-y-2 text-sm">
              {findings.redditDiscussions.map((r, i) => (
                <li key={i} className="border-b border-white/5 pb-2 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-orange-400">{r.subreddit}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full uppercase ${sentimentClass(r.sentiment)}`}>{r.sentiment}</span>
                  </div>
                  <div className="text-xs mt-0.5">{r.title}</div>
                  <div className="text-[11px] text-muted-foreground italic mt-0.5">{r.insight}</div>
                </li>
              ))}
            </ul>
          ) : <Empty />}
        </SourceCard>

        <SourceCard icon={<Youtube className="w-4 h-4" />} title="YouTube Search">
          {findings.youtubeSearches?.length ? (
            <ul className="space-y-2 text-sm">
              {findings.youtubeSearches.map((y, i) => (
                <li key={i} className="border-b border-white/5 pb-2 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs truncate">"{y.query}"</span>
                    <span className="text-[10px] text-red-400 shrink-0">{y.estViews}</span>
                  </div>
                  <div className="text-[11px] mt-0.5">Winning angle: {y.topVideoAngle}</div>
                  <div className="text-[11px] text-primary/80 italic mt-0.5">Gap: {y.contentGap}</div>
                </li>
              ))}
            </ul>
          ) : <Empty />}
        </SourceCard>
      </div>

      {/* Core research grid */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card icon={<TrendingUp className="w-4 h-4" />} title="Trending topics" items={findings.trendingTopics} />
        <Card icon={<Search className="w-4 h-4" />} title="Keywords"
          items={findings.keywords?.map((k) => `${k.term} — ${k.intent}${k.volume ? ` · ${k.volume}` : ""}${k.difficulty ? ` · ${k.difficulty}` : ""}`)} />
        <Card icon={<HelpCircle className="w-4 h-4" />} title="FAQs" items={findings.faqs} />
        <Card icon={<GitCompare className="w-4 h-4" />} title="Competitor Analysis"
          items={findings.competitors?.map((c) =>
            `${c.name} — ${c.angle}${c.strength ? ` · Strength: ${c.strength}` : ""}${c.weakness ? ` · Gap: ${c.weakness}` : ""}`
          )} />
        <Card icon={<Brain className="w-4 h-4" />} title="Content gaps" items={findings.contentGaps} />
        <Card icon={<AlertCircle className="w-4 h-4" />} title="Audience pain points" items={findings.audiencePains} />
        <Card icon={<Users className="w-4 h-4" />} title="Search intent" items={findings.searchIntent ? [findings.searchIntent] : []} />
        <Card icon={<Zap className="w-4 h-4" />} title="Suggested hooks" items={findings.suggestedHooks} accent />
      </div>
    </div>
  );
}

function sentimentClass(s: string) {
  switch (s) {
    case "positive": return "bg-emerald-500/15 text-emerald-300";
    case "negative": return "bg-red-500/15 text-red-300";
    case "curious": return "bg-blue-500/15 text-blue-300";
    default: return "bg-white/10 text-muted-foreground";
  }
}

function SourceCard({ icon, title, tagline, children }: { icon: React.ReactNode; title: string; tagline?: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-5 border border-border">
      <div className="flex items-center gap-2 mb-1 text-sm font-semibold">
        <span className="text-primary">{icon}</span>{title}
      </div>
      {tagline && <div className="text-[11px] text-muted-foreground mb-3">{tagline}</div>}
      {!tagline && <div className="mb-3" />}
      {children}
    </div>
  );
}

function Card({ icon, title, items, accent }: { icon: React.ReactNode; title: string; items?: string[]; accent?: boolean }) {
  return (
    <div className="glass rounded-2xl p-5 border border-border">
      <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
        <span className="text-primary">{icon}</span>{title}
      </div>
      <ul className="space-y-1.5 text-sm">
        {(items ?? []).map((it, i) => (
          <li key={i} className={`flex gap-2 ${accent ? "text-foreground" : "text-muted-foreground"}`}>
            <span className="text-primary">•</span>{it}
          </li>
        ))}
        {(!items || items.length === 0) && <Empty />}
      </ul>
    </div>
  );
}

function Empty() {
  return <div className="text-xs text-muted-foreground">No data</div>;
}
