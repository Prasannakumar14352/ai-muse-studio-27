import {
  AUDIO_LIMITS,
  audioCredits,
  DEFAULT_AUDIO_SETTINGS,
  type AudioRequest,
  type AudioSettings,
  type GeneratedAudio,
} from "./audio-generation";

export type PlannedAudio = {
  request: AudioRequest;
  sceneIds: string[];
  offset: number;
  gain?: number;
  selectionKey?: string;
  asset?: GeneratedAudio;
  error?: string;
};

export function sceneAudioId(scene: { n: number; audioSceneId?: string }) {
  return scene.audioSceneId ?? String(scene.n);
}

const ENVIRONMENTS = [
  { match: /\b(ocean|sea|waves|coast)\b/i, prompt: "Natural ocean waves and coastal wind" },
  { match: /\b(forest|jungle|woods)\b/i, prompt: "Forest air with soft leaves and distant birds" },
  { match: /\b(temple|shrine)\b/i, prompt: "Quiet spacious ancient temple room tone" },
  { match: /\b(rain|downpour)\b/i, prompt: "Steady natural rain with distant atmospheric texture" },
  { match: /\b(city|traffic|street)\b/i, prompt: "Distant city traffic and street ambience" },
  {
    match: /\b(starship|spacecraft|space station)\b/i,
    prompt: "Low spacecraft ventilation and room tone",
  },
  { match: /\b(village|farm)\b/i, prompt: "Quiet rural village atmosphere" },
  { match: /\b(indoors|room|hall|kitchen)\b/i, prompt: "Quiet indoor room tone" },
];
const ACTIONS = [
  {
    match: /\b(leaps?|jumps?|lands?|impact)\b/i,
    prompt: "Short cinematic impact synchronized with the action",
  },
  { match: /\b(flies|flight|soars|flying)\b/i, prompt: "Brief natural wind rush in open air" },
  {
    match: /\b(divine energy|golden energy|golden aura)\b/i,
    prompt: "Subtle resonant shimmer and soft energy swell",
  },
  {
    match: /\b(footsteps?|walks?|runs?)\b/i,
    prompt: "Brief realistic footsteps matching the scene surface",
  },
  { match: /\b(thunder|lightning)\b/i, prompt: "One natural thunderclap and short tail" },
  { match: /\b(conch)\b/i, prompt: "Single traditional conch call in the distance" },
];

export function planVideoAudio(input: {
  jobId: string;
  title: string;
  style: string;
  duration: number;
  musicDirection: string;
  settings?: AudioSettings;
  scenes: Array<{
    n: number;
    audioSceneId?: string;
    visual: string;
    image_prompt: string;
    audioCues?: Array<{ label: string; atSec: number; volume: number }>;
  }>;
}): PlannedAudio[] {
  const settings = { ...DEFAULT_AUDIO_SETTINGS, ...input.settings };
  const tracks: PlannedAudio[] = [];
  if (settings.backgroundMusicEnabled) {
    const narrative = input.scenes
      .map((scene) => scene.visual)
      .join(" ")
      .slice(0, 320);
    const prompt = [
      "Create an original instrumental soundtrack. Use original melodies, arrangements and instrumentation.",
      input.title.slice(0, 120),
      input.style,
      input.musicDirection.slice(0, 120),
      settings.musicMood !== "Auto" ? settings.musicMood : "",
      settings.musicPrompt.trim().slice(0, 350),
      narrative,
    ]
      .filter(Boolean)
      .join(". ");
    tracks.push({
      request: {
        jobId: input.jobId,
        track: "music",
        slot: 0,
        revision: 0,
        duration: Math.max(3, Math.min(600, input.duration)),
        prompt,
      },
      sceneIds: [],
      offset: 0,
      selectionKey: JSON.stringify([
        input.title,
        input.style,
        input.musicDirection,
        settings.musicMood,
        settings.musicPrompt,
      ]),
    });
  }
  const ambience = new Map<string, PlannedAudio>();
  let effects = 0;
  for (const scene of input.scenes) {
    const id = sceneAudioId(scene);
    const visual = scene.visual || scene.image_prompt;
    if (settings.soundEffectsEnabled) {
      const effect = ACTIONS.find(({ match }) => match.test(visual));
      const cues = scene.audioCues?.length
        ? scene.audioCues
        : effect
          ? [{ label: effect.prompt, atSec: 0.25, volume: 1 }]
          : [];
      for (const cue of cues.slice(0, AUDIO_LIMITS.sfx - effects)) {
        tracks.push({
          request: {
            jobId: input.jobId,
            track: "sfx",
            slot: effects++,
            revision: 0,
            duration: 3,
            prompt: `${cue.label.slice(0, 120)}. Scene setting: ${visual.slice(0, 250)}. No speech or music.`,
          },
          sceneIds: [id],
          offset: Math.max(0, cue.atSec),
          gain: Math.min(1, Math.max(0, cue.volume)),
        });
      }
    }
    const environment =
      settings.ambienceEnabled && ENVIRONMENTS.find(({ match }) => match.test(visual));
    if (!environment) continue;
    const existing = ambience.get(environment.prompt);
    if (existing) {
      existing.sceneIds.push(id);
    } else if (ambience.size < AUDIO_LIMITS.ambience) {
      const track = {
        request: {
          jobId: input.jobId,
          track: "ambience" as const,
          slot: ambience.size,
          revision: 0,
          prompt: `${environment.prompt}. Seamless loop. No speech or music.`,
          duration: 15,
        },
        sceneIds: [id],
        offset: 0,
      };
      ambience.set(environment.prompt, track);
      tracks.push(track);
    }
  }
  return tracks;
}

export function maximumAudioCredits(settings: AudioSettings, duration: number) {
  return (
    (settings.backgroundMusicEnabled
      ? audioCredits("music", Math.max(3, Math.min(600, duration)))
      : 0) +
    (settings.soundEffectsEnabled ? AUDIO_LIMITS.sfx * audioCredits("sfx", 3) : 0) +
    (settings.ambienceEnabled ? AUDIO_LIMITS.ambience * audioCredits("ambience", 15) : 0)
  );
}

export function isAudioTrackEnabled(
  settings: AudioSettings | undefined,
  track: AudioRequest["track"],
) {
  if (track === "music") return Boolean(settings?.backgroundMusicEnabled);
  if (track === "sfx") return Boolean(settings?.soundEffectsEnabled);
  return Boolean(settings?.ambienceEnabled);
}
