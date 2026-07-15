import type { QualityScores } from "@/lib/quality-score.functions";

export function QualityScorePanel({ scores, recommendations }: { scores: QualityScores; recommendations?: string[] }) {
  const rows: [keyof QualityScores, string][] = [
    ["hook", "Hook"], ["retention", "Retention"], ["seo", "SEO"],
    ["thumbnail", "Thumbnail"], ["script", "Script"], ["cta", "CTA"],
  ];
  return (
    <div className="glass rounded-2xl p-6 border border-white/10 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">AI Quality Score</h3>
        <div className={`text-3xl font-bold ${scores.overall >= 80 ? "text-emerald-400" : scores.overall >= 60 ? "text-amber-400" : "text-red-400"}`}>
          {Math.round(scores.overall)}
        </div>
      </div>
      <div className="space-y-2">
        {rows.map(([k, label]) => {
          const v = Number(scores[k] ?? 0);
          return (
            <div key={k}>
              <div className="flex justify-between text-xs mb-1">
                <span>{label}</span><span className="text-muted-foreground">{Math.round(v)}</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary to-primary/60" style={{ width: `${Math.min(100, v)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {recommendations?.length ? (
        <div className="pt-2 border-t border-white/10">
          <div className="text-xs font-semibold mb-2">Recommendations</div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {recommendations.map((r, i) => <li key={i}>→ {r}</li>)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
