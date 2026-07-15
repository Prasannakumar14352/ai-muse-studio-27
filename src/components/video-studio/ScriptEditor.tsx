// Full script viewer — reads all voiceover lines end-to-end and lets users bulk-edit
// the entire script, then splits it back to scenes (line-per-scene).
import { FileText, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { BlueprintScene, VideoBlueprint } from "@/lib/video-blueprint";

export type ScriptEditorProps = {
  blueprint: VideoBlueprint;
  onUpdateScene: (id: string, patch: Partial<BlueprintScene>) => void;
  onBulkReplace: (linesByOrder: string[]) => void;
};

export function ScriptEditor({ blueprint, onUpdateScene, onBulkReplace }: ScriptEditorProps) {
  const joined = useMemo(
    () => blueprint.scenes.map((s) => `#${s.n} ${s.role}\n${s.voiceover}`).join("\n\n"),
    [blueprint.scenes],
  );
  const [draft, setDraft] = useState<string>(joined);
  const [mode, setMode] = useState<"per-scene" | "bulk">("per-scene");

  function applyBulk() {
    // Split on scene markers "#N " lines
    const blocks = draft.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    const lines = blocks.map((b) => b.replace(/^#\d+[^\n]*\n?/, "").trim());
    onBulkReplace(lines);
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4" /> Script</div>
          <div className="flex items-center gap-1 text-xs">
            <Button size="sm" variant={mode === "per-scene" ? "default" : "outline"} onClick={() => setMode("per-scene")}>
              Per scene
            </Button>
            <Button size="sm" variant={mode === "bulk" ? "default" : "outline"} onClick={() => { setMode("bulk"); setDraft(joined); }}>
              Bulk edit
            </Button>
          </div>
        </div>

        {mode === "per-scene" ? (
          <div className="space-y-2">
            {blueprint.scenes.map((s) => (
              <div key={s.id} className="rounded-md border border-border/40 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline">#{s.n}</Badge>
                  <span className="text-xs text-muted-foreground">{s.role} · {s.durationSec.toFixed(1)}s</span>
                </div>
                <Textarea
                  rows={2}
                  value={s.voiceover}
                  onChange={(e) => onUpdateScene(s.id, { voiceover: e.target.value })}
                  placeholder="Voiceover for this scene"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea rows={14} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div className="flex justify-end">
              <Button onClick={applyBulk}><Wand2 className="h-3 w-3 mr-1" /> Apply to scenes</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
