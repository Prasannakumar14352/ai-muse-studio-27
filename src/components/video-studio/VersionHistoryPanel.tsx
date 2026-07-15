// Version history panel — lists blueprintVersions with restore/preview.
import { History, RotateCcw, Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { VideoBlueprintMetadata } from "@/lib/video-blueprint";

export type VersionHistoryPanelProps = {
  metadata: VideoBlueprintMetadata;
  onRestore: (version: number) => void;
  onPreview: (version: number) => void;
};

export function VersionHistoryPanel({ metadata, onRestore, onPreview }: VersionHistoryPanelProps) {
  const versions = metadata.blueprintVersions ?? [];
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2 font-medium"><History className="h-4 w-4" /> Version history</div>
      <p className="text-xs text-muted-foreground">
        Every edit is auto-saved as a new version. The 10 most recent are kept.
      </p>
      {versions.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center">No versions yet.</div>
      ) : (
        <div className="space-y-2">
          {versions.map((v) => {
            const isCurrent = v.version === metadata.blueprintVersion;
            return (
              <div key={v.version}
                className={`flex items-center justify-between gap-3 rounded-md border p-3 text-sm ${
                  isCurrent ? "border-primary/60 bg-primary/5" : "border-border/50"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Badge variant={isCurrent ? "default" : "outline"}>v{v.version}</Badge>
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">
                      {new Date(v.savedAt).toLocaleString()} · {v.source}
                    </div>
                    {v.note && <div className="text-xs truncate">{v.note}</div>}
                    <div className="text-[11px] text-muted-foreground">
                      {v.blueprint.scenes.length} scenes ·{" "}
                      {v.blueprint.scenes.reduce((a, s) => a + s.durationSec, 0).toFixed(1)}s
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => onPreview(v.version)}>
                    <Eye className="h-3 w-3 mr-1" /> Preview
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => onRestore(v.version)}
                    disabled={isCurrent}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" /> Restore
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
