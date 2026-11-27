import { useState } from "react";
import type { QualityFinding } from "@/lib/video-quality";

export function VideoQualityReview({ findings }: { findings: QualityFinding[] }) {
  const [filter, setFilter] = useState("all");
  const visible = findings.filter(
    (finding) =>
      filter === "all" ||
      (filter === "review"
        ? ["not checked", "requires human review", "provider unavailable"].includes(finding.result)
        : finding.result === filter),
  );
  return (
    <details className="rounded-xl border border-border p-4" open>
      <summary className="cursor-pointer font-medium">
        Quality review · {findings.filter((finding) => finding.blocksApproval).length} blocking
      </summary>
      <label className="mt-3 flex items-center gap-2 text-sm">
        Findings
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="rounded border bg-background p-2"
        >
          <option value="all">All</option>
          <option value="passed">Passed</option>
          <option value="warning">Warnings</option>
          <option value="failed">Failed</option>
          <option value="review">Requires review / unchecked</option>
        </select>
      </label>
      <ul className="mt-3 max-h-72 space-y-2 overflow-auto text-sm">
        {visible.map((finding) => (
          <li key={finding.id} className="rounded border border-border p-2">
            <strong className="capitalize">
              {finding.stage} · {finding.result}
            </strong>
            {finding.assetId && (
              <span className="ml-2 text-muted-foreground">Asset {finding.assetId}</span>
            )}
            <div>{finding.evidence}</div>
            <div className="text-muted-foreground">{finding.repair}</div>
          </li>
        ))}
      </ul>
      {!visible.length && <p className="mt-2 text-sm">No findings match this filter.</p>}
    </details>
  );
}
