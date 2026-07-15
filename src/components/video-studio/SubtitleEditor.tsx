// Editable subtitle track. Row per scene with time-range + text + global style controls.

import { Type } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CreatorFlowSelect,
} from "@/components/ui/creator-flow-select";
import type { BlueprintScene, SceneSubtitle, SubtitleStyle, VideoBlueprint } from "@/lib/video-blueprint";

export type SubtitleEditorProps = {
  blueprint: VideoBlueprint;
  onUpdateScene: (id: string, patch: Partial<BlueprintScene>) => void;
  onUpdateStyle: (style: SubtitleStyle) => void;
};

const DEFAULT_STYLE: SubtitleStyle = {
  enabled: true, font: "sans", size: "lg", color: "#ffffff",
  background: "blur", position: "bottom", uppercase: false, wordHighlight: true,
};

export function SubtitleEditor({ blueprint, onUpdateScene, onUpdateStyle }: SubtitleEditorProps) {
  const style = blueprint.subtitleStyle ?? DEFAULT_STYLE;

  function patchStyle(p: Partial<SubtitleStyle>) { onUpdateStyle({ ...style, ...p }); }

  function setSubtitle(scene: BlueprintScene, patch: Partial<SceneSubtitle>) {
    const current: SceneSubtitle = scene.subtitle ?? {
      text: scene.voiceover || scene.onScreenText || "",
      startSec: 0, endSec: scene.durationSec,
    };
    onUpdateScene(scene.id, { subtitle: { ...current, ...patch } });
  }

  const previewClass = [
    style.font === "serif" ? "font-serif" : style.font === "mono" ? "font-mono" : "font-sans",
    style.size === "sm" ? "text-sm" : style.size === "md" ? "text-base" : style.size === "lg" ? "text-xl" : "text-2xl",
    style.uppercase ? "uppercase tracking-wide" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="space-y-4">
      {/* Style controls */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium"><Type className="h-4 w-4" /> Subtitle style</div>
          <Label className="flex items-center gap-2 text-xs">
            <Switch checked={style.enabled} onCheckedChange={(v) => patchStyle({ enabled: v })} />
            {style.enabled ? "Enabled" : "Disabled"}
          </Label>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <LabeledField label="Font">
            <CreatorFlowSelect
              value={style.font}
              onValueChange={(v) => patchStyle({ font: v as SubtitleStyle["font"] })}
              options={[
                { value: "sans", label: "Sans" }, { value: "serif", label: "Serif" },
                { value: "mono", label: "Mono" }, { value: "display", label: "Display" },
              ]}
            />
          </LabeledField>
          <LabeledField label="Size">
            <CreatorFlowSelect
              value={style.size}
              onValueChange={(v) => patchStyle({ size: v as SubtitleStyle["size"] })}
              options={[
                { value: "sm", label: "Small" }, { value: "md", label: "Medium" },
                { value: "lg", label: "Large" }, { value: "xl", label: "Extra large" },
              ]}
            />
          </LabeledField>
          <LabeledField label="Position">
            <CreatorFlowSelect
              value={style.position}
              onValueChange={(v) => patchStyle({ position: v as SubtitleStyle["position"] })}
              options={[
                { value: "top", label: "Top" }, { value: "middle", label: "Middle" }, { value: "bottom", label: "Bottom" },
              ]}
            />
          </LabeledField>
          <LabeledField label="Background">
            <CreatorFlowSelect
              value={style.background}
              onValueChange={(v) => patchStyle({ background: v as SubtitleStyle["background"] })}
              options={[
                { value: "none", label: "None" }, { value: "solid", label: "Solid" },
                { value: "gradient", label: "Gradient" }, { value: "blur", label: "Blur" },
              ]}
            />
          </LabeledField>
          <LabeledField label="Color">
            <Input type="color" value={style.color} onChange={(e) => patchStyle({ color: e.target.value })} />
          </LabeledField>
          <LabeledField label="Uppercase">
            <Switch checked={style.uppercase} onCheckedChange={(v) => patchStyle({ uppercase: v })} />
          </LabeledField>
          <LabeledField label="Word highlight">
            <Switch checked={style.wordHighlight} onCheckedChange={(v) => patchStyle({ wordHighlight: v })} />
          </LabeledField>
        </div>
        {/* Preview */}
        <div className="relative h-24 rounded-md bg-gradient-to-br from-slate-800 to-slate-950 border border-border/50 overflow-hidden">
          <div className={`absolute left-0 right-0 px-4 flex justify-center
            ${style.position === "top" ? "top-3" : style.position === "middle" ? "top-1/2 -translate-y-1/2" : "bottom-3"}`}
          >
            <span className={`${previewClass} px-3 py-1 rounded ${
              style.background === "solid" ? "bg-black/70" :
              style.background === "gradient" ? "bg-gradient-to-r from-black/70 via-black/40 to-black/70" :
              style.background === "blur" ? "backdrop-blur bg-black/30" : ""
            }`} style={{ color: style.color }}>
              Preview subtitle text
            </span>
          </div>
        </div>
      </Card>

      {/* Per-scene captions */}
      <Card className="p-4 space-y-3">
        <div className="font-medium">Captions per scene</div>
        <div className="space-y-2">
          {blueprint.scenes.map((s) => {
            const sub = s.subtitle ?? { text: s.voiceover || s.onScreenText || "", startSec: 0, endSec: s.durationSec };
            return (
              <div key={s.id} className="grid grid-cols-12 gap-2 items-start rounded-md border border-border/40 p-3">
                <div className="col-span-12 md:col-span-1 flex items-center gap-2">
                  <Badge variant="outline">#{s.n}</Badge>
                </div>
                <div className="col-span-6 md:col-span-2 grid grid-cols-2 gap-1">
                  <Input type="number" step={0.1} value={sub.startSec}
                    onChange={(e) => setSubtitle(s, { startSec: Number(e.target.value) })} placeholder="start" />
                  <Input type="number" step={0.1} value={sub.endSec}
                    onChange={(e) => setSubtitle(s, { endSec: Number(e.target.value) })} placeholder="end" />
                </div>
                <div className="col-span-12 md:col-span-9">
                  <Textarea rows={2} value={sub.text}
                    onChange={(e) => setSubtitle(s, { text: e.target.value })}
                    placeholder="Subtitle text (defaults to voiceover)"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
