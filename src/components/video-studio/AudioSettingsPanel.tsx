import { AUDIO_MOODS, DEFAULT_AUDIO_SETTINGS, type AudioSettings } from "@/lib/audio-generation";
import { maximumAudioCredits } from "@/lib/audio-plan";

const TOGGLES = [
  ["voiceoverEnabled", "Voiceover"],
  ["backgroundMusicEnabled", "Background music"],
  ["soundEffectsEnabled", "Sound effects"],
  ["ambienceEnabled", "Environmental ambience"],
  ["autoDucking", "Lower music during narration"],
] as const;

const GAINS = [
  ["narrationVolume", "Narration volume"],
  ["musicVolume", "Music volume"],
  ["sfxVolume", "Sound effects volume"],
  ["ambienceVolume", "Ambience volume"],
] as const;

export function AudioSettingsPanel({
  value,
  onChange,
  duration,
  mixOnly = false,
  available,
}: {
  value?: AudioSettings;
  onChange: (value: AudioSettings) => void;
  duration: number;
  mixOnly?: boolean;
  available?: AudioSettings;
}) {
  const settings = { ...DEFAULT_AUDIO_SETTINGS, ...value };
  return (
    <details className="rounded-xl border border-border p-4">
      <summary className="cursor-pointer text-sm font-medium">Audio settings</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {TOGGLES.map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings[key]}
              disabled={mixOnly && key !== "autoDucking" && !available?.[key]}
              onChange={(event) => onChange({ ...settings, [key]: event.target.checked })}
            />
            {label}
          </label>
        ))}
        {settings.backgroundMusicEnabled && !mixOnly && (
          <>
            <label className="grid gap-1 text-sm">
              Music mood
              <select
                className="rounded-md border border-input bg-background px-2 py-1"
                value={settings.musicMood}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    musicMood: event.target.value as AudioSettings["musicMood"],
                  })
                }
              >
                {AUDIO_MOODS.map((mood) => (
                  <option key={mood}>{mood}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              Original music instructions
              <textarea
                className="rounded-md border border-input bg-background px-2 py-1"
                maxLength={350}
                value={settings.musicPrompt}
                onChange={(event) => onChange({ ...settings, musicPrompt: event.target.value })}
              />
            </label>
          </>
        )}
        {GAINS.map(([key, label]) => (
          <label key={key} className="grid gap-1 text-sm">
            {label} ({Math.round(settings[key] * 100)}%)
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={settings[key]}
              onChange={(event) => onChange({ ...settings, [key]: event.target.valueAsNumber })}
            />
          </label>
        ))}
        {(
          [
            ["fadeInSeconds", "Music fade-in"],
            ["fadeOutSeconds", "Music fade-out"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="grid gap-1 text-sm">
            {label} ({settings[key]}s)
            <input
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={settings[key]}
              onChange={(event) => onChange({ ...settings, [key]: event.target.valueAsNumber })}
            />
          </label>
        ))}
      </div>
      {!mixOnly && (
        <p className="mt-3 text-xs text-muted-foreground">
          Additional audio estimate up to {maximumAudioCredits(settings, duration)} credits.
          {duration > 600 &&
            settings.backgroundMusicEnabled &&
            " The soundtrack loops after 10 minutes."}
        </p>
      )}
    </details>
  );
}
