// Music picker + control (volume, fade, loop) for the global blueprint.
import { Music2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { MUSIC_LIBRARY, type MusicTrack } from "@/lib/video-blueprint";

export type MusicPickerProps = {
  value: MusicTrack | null | undefined;
  musicDirection: string;
  onChange: (v: MusicTrack | null) => void;
  onDirectionChange: (d: string) => void;
};

export function MusicPicker({ value, musicDirection, onChange, onDirectionChange }: MusicPickerProps) {
  function select(id: string) {
    const t = MUSIC_LIBRARY.find((m) => m.id === id);
    if (!t) return;
    onChange({
      id: t.id, label: t.label, mood: t.mood, bpm: t.bpm,
      volume: value?.volume ?? 0.6,
      fadeInSec: value?.fadeInSec ?? 1,
      fadeOutSec: value?.fadeOutSec ?? 1.5,
      loop: value?.loop ?? true,
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 font-medium">
          <Music2 className="h-4 w-4" /> Music direction presets
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Music direction (used by AI when generating)</Label>
          <Input className="mt-1" value={musicDirection}
            onChange={(e) => onDirectionChange(e.target.value)}
            placeholder="e.g. cinematic build, tense drums, uplifting resolve at 0:45" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
          {MUSIC_LIBRARY.map((t) => {
            const active = value?.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => select(t.id)}
                className={`rounded-lg border p-3 text-left transition-all ${
                  active
                    ? "border-primary/60 bg-gradient-to-br from-primary/25 to-primary/10 ring-2 ring-primary/40"
                    : "border-border/50 bg-card/40 hover:border-primary/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t.label}</span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">{t.mood}</Badge>
                  <span>{t.bpm} BPM</span>
                </div>
              </button>
            );
          })}
        </div>

        {value && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-border/50 pt-3">
            <div>
              <Label className="text-xs text-muted-foreground">Volume {Math.round(value.volume * 100)}%</Label>
              <input type="range" min={0} max={1} step={0.05} value={value.volume}
                onChange={(e) => onChange({ ...value, volume: Number(e.target.value) })}
                className="mt-2 w-full accent-primary" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Fade in</Label>
              <Input type="number" step={0.1} value={value.fadeInSec}
                onChange={(e) => onChange({ ...value, fadeInSec: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Fade out</Label>
              <Input type="number" step={0.1} value={value.fadeOutSec}
                onChange={(e) => onChange({ ...value, fadeOutSec: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Loop</Label>
              <div className="mt-2"><Switch checked={value.loop} onCheckedChange={(v) => onChange({ ...value, loop: v })} /></div>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => onChange(null)} disabled={!value}>
            Clear music
          </Button>
        </div>
      </Card>
    </div>
  );
}
