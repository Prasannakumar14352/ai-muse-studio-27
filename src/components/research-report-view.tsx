import type { ResearchFindings } from "@/lib/research.functions";
import { TrendingUp, Search, HelpCircle, Users, GitCompare, Brain, AlertCircle, Zap } from "lucide-react";

export function ResearchReportView({ findings }: { findings: ResearchFindings }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card icon={<TrendingUp className="w-4 h-4" />} title="Trending topics" items={findings.trendingTopics} />
      <Card icon={<Search className="w-4 h-4" />} title="Keywords"
        items={findings.keywords?.map((k) => `${k.term} — ${k.intent}`)} />
      <Card icon={<HelpCircle className="w-4 h-4" />} title="FAQs" items={findings.faqs} />
      <Card icon={<GitCompare className="w-4 h-4" />} title="Competitors"
        items={findings.competitors?.map((c) => `${c.name} — ${c.angle}`)} />
      <Card icon={<Brain className="w-4 h-4" />} title="Content gaps" items={findings.contentGaps} />
      <Card icon={<AlertCircle className="w-4 h-4" />} title="Audience pain points" items={findings.audiencePains} />
      <Card icon={<Users className="w-4 h-4" />} title="Search intent" items={findings.searchIntent ? [findings.searchIntent] : []} />
      <Card icon={<Zap className="w-4 h-4" />} title="Suggested hooks" items={findings.suggestedHooks} accent />
    </div>
  );
}

function Card({ icon, title, items, accent }: { icon: React.ReactNode; title: string; items?: string[]; accent?: boolean }) {
  return (
    <div className="glass rounded-2xl p-5 border border-white/10">
      <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
        <span className="text-primary">{icon}</span>{title}
      </div>
      <ul className="space-y-1.5 text-sm">
        {(items ?? []).map((it, i) => (
          <li key={i} className={`flex gap-2 ${accent ? "text-foreground" : "text-muted-foreground"}`}>
            <span className="text-primary">•</span>{it}
          </li>
        ))}
        {(!items || items.length === 0) && <li className="text-xs text-muted-foreground">No data</li>}
      </ul>
    </div>
  );
}
