// Character library: reusable character presets that scenes can lock onto for consistency.
import { Users, Plus, Trash2, Upload, Lock } from "lucide-react";
import { useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { nextCharacterId, type Character, type VideoBlueprint, type BlueprintScene } from "@/lib/video-blueprint";

export type CharacterLibraryProps = {
  blueprint: VideoBlueprint;
  onUpdateLibrary: (chars: Character[]) => void;
  onAssignToScene: (sceneId: string, character: Character) => void;
};

export function CharacterLibrary({ blueprint, onUpdateLibrary, onAssignToScene }: CharacterLibraryProps) {
  const chars = blueprint.characterLibrary ?? [];

  function addChar() {
    const c: Character = {
      id: nextCharacterId(), name: `Character ${chars.length + 1}`,
      description: "", lockAppearance: true,
    };
    onUpdateLibrary([...chars, c]);
  }
  function patch(id: string, p: Partial<Character>) {
    onUpdateLibrary(chars.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }
  function remove(id: string) {
    onUpdateLibrary(chars.filter((c) => c.id !== id));
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium"><Users className="h-4 w-4" /> Character library</div>
        <Button size="sm" onClick={addChar}><Plus className="h-4 w-4 mr-1" /> Add character</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Locked characters keep the same appearance across every scene that references them.
      </p>

      {chars.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6">No characters yet.</div>
      ) : (
        <div className="space-y-3">
          {chars.map((c) => (
            <CharacterRow
              key={c.id} c={c}
              onChange={(p) => patch(c.id, p)}
              onRemove={() => remove(c.id)}
              scenes={blueprint.scenes}
              onAssign={(scene) => onAssignToScene(scene.id, c)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function CharacterRow({
  c, onChange, onRemove, scenes, onAssign,
}: {
  c: Character;
  onChange: (p: Partial<Character>) => void;
  onRemove: () => void;
  scenes: BlueprintScene[];
  onAssign: (s: BlueprintScene) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange({ referenceUrl: String(reader.result) });
    reader.readAsDataURL(file);
  }

  return (
    <div className="rounded-lg border border-border/50 p-3 grid grid-cols-1 md:grid-cols-[120px_1fr] gap-3">
      <div className="flex flex-col items-center gap-2">
        <div className="h-28 w-28 rounded-md border border-border/50 bg-muted/30 overflow-hidden flex items-center justify-center">
          {c.referenceUrl ? (
            <img src={c.referenceUrl} alt={c.name} className="h-full w-full object-cover" />
          ) : (
            <Users className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload className="h-3 w-3 mr-1" /> Reference
        </Button>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Input value={c.name} onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Character name" className="flex-1" />
          <Label className="flex items-center gap-1 text-xs">
            <Switch checked={c.lockAppearance} onCheckedChange={(v) => onChange({ lockAppearance: v })} />
            <Lock className="h-3 w-3" /> Lock
          </Label>
          <Button variant="ghost" size="icon" onClick={onRemove}>
            <Trash2 className="h-4 w-4 text-red-400" />
          </Button>
        </div>
        <Textarea
          rows={2}
          value={c.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Appearance details: age, ethnicity, hair, outfit, distinguishing features…"
        />
        <div className="flex flex-wrap gap-1">
          <span className="text-[10px] text-muted-foreground mr-1 self-center">Assign to scene:</span>
          {scenes.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onAssign(s)}
              className="text-[10px] rounded border border-border/50 px-2 py-0.5 hover:border-primary/50"
              title={`Assign ${c.name} to scene ${s.n}`}
            >
              <Badge variant="outline" className="text-[10px]">#{s.n}</Badge>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
