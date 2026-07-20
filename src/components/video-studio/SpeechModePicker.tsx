// Speech-mode selector for the video wizard. Foundation piece — surfaces the
// distinction between narration, single/multi character, and no-voice.
// Downstream steps (voice, character, lip-sync) read this value.

import { Mic, Users, User, Volume2, VolumeX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SPEECH_MODES, type SpeechMode } from "@/lib/lipsync/types";

const ICONS: Record<SpeechMode, React.ElementType> = {
  narration_only: Mic,
  single_character: User,
  multi_character: Users,
  narration_plus_character: Volume2,
  no_voice: VolumeX,
};

export type SpeechModePickerProps = {
  value: SpeechMode;
  onChange: (mode: SpeechMode) => void;
  /** Optional soft recommendation (e.g. "story" -> multi_character). */
  recommended?: SpeechMode;
};

export function SpeechModePicker({ value, onChange, recommended }: SpeechModePickerProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Speech mode</h3>
          <p className="text-xs text-muted-foreground">
            Choose how voice is used. Narration is not lip-sync — pick a character mode when a visible character should speak.
          </p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {SPEECH_MODES.map((mode) => {
          const Icon = ICONS[mode.id];
          const selected = value === mode.id;
          const isRec = recommended === mode.id;
          return (
            <Card
              key={mode.id}
              role="button"
              tabIndex={0}
              onClick={() => onChange(mode.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onChange(mode.id)}
              className={cn(
                "p-3 cursor-pointer transition border",
                selected
                  ? "border-primary/70 bg-primary/5 shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]"
                  : "border-border/40 hover:border-border",
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  "rounded-md p-2 shrink-0",
                  selected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                )}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">{mode.label}</div>
                    {isRec && !selected && (
                      <span className="text-[10px] uppercase tracking-wide text-primary/80">Recommended</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{mode.description}</p>
                  <p className="text-[11px] text-muted-foreground/80 mt-1">Best for: {mode.recommendedFor}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
