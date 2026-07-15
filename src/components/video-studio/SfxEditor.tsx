// SFX editor: pick from library, place cues at a scene offset, adjust volume.
import { Plus, Trash2, Volume2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CreatorFlowSelect } from "@/components/ui/creator-flow-select";
import {
  SFX_LIBRARY, nextSfxId,
  type BlueprintScene, type SceneSfx, type VideoBlueprint,
} from "@/lib/video-blueprint";

export type SfxEditorProps = {
  blueprint: VideoBlueprint;
  onUpdateScene: (id: string, patch: Partial<BlueprintScene>) => void;
};

export function SfxEditor({ blueprint, onUpdateScene }: SfxEditorProps) {
  function addSfx(scene: BlueprintScene, libId: string) {
    const lib = SFX_LIBRARY.find((s) => s.id === libId);
    if (!lib) return;
    const fx: SceneSfx = {
      id: nextSfxId(), label: lib.label, atSec: 0, volume: 0.7,
    };
    onUpdateScene(scene.id, { sfx: [...(scene.sfx ?? []), fx] });
  }
  function updateSfx(scene: BlueprintScene, id: string, patch: Partial<SceneSfx>) {
    onUpdateScene(scene.id, {
      sfx: (scene.sfx ?? []).map((fx) => (fx.id === id ? { ...fx, ...patch } : fx)),
    });
  }
  function removeSfx(scene: BlueprintScene, id: string) {
    onUpdateScene(scene.id, { sfx: (scene.sfx ?? []).filter((fx) => fx.id !== id) });
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2 font-medium">
        <Volume2 className="h-4 w-4" /> Sound effects
      </div>
      <p className="text-xs text-muted-foreground">
        Add whooshes, impacts, or UI cues per scene. Cues render as markers on the timeline.
      </p>
      <div className="space-y-3">
        {blueprint.scenes.map((s) => (
          <div key={s.id} className="rounded-lg border border-border/40 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline">#{s.n}</Badge>
                <span className="text-muted-foreground truncate max-w-md">{s.role}: {s.visual}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-56">
                  <CreatorFlowSelect
                    value=""
                    onValueChange={(v) => addSfx(s, v)}
                    placeholder="Add SFX…"
                    options={SFX_LIBRARY.map((l) => ({ value: l.id, label: `${l.category} · ${l.label}` }))}
                  />
                </div>
              </div>
            </div>

            {(s.sfx ?? []).length > 0 ? (
              <div className="space-y-1">
                {(s.sfx ?? []).map((fx) => (
                  <div key={fx.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4 text-xs">{fx.label}</div>
                    <div className="col-span-3">
                      <Label className="text-[10px] text-muted-foreground">At (s)</Label>
                      <Input type="number" step={0.1} min={0} max={s.durationSec} value={fx.atSec}
                        onChange={(e) => updateSfx(s, fx.id, { atSec: Number(e.target.value) })} />
                    </div>
                    <div className="col-span-4">
                      <Label className="text-[10px] text-muted-foreground">Volume {Math.round(fx.volume * 100)}%</Label>
                      <input type="range" min={0} max={1} step={0.05} value={fx.volume}
                        onChange={(e) => updateSfx(s, fx.id, { volume: Number(e.target.value) })}
                        className="mt-2 w-full accent-primary" />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button variant="ghost" size="icon" onClick={() => removeSfx(s, fx.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Plus className="h-3 w-3" /> Pick a preset above to add a cue.
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
