import {
  DEFAULT_AUDIO_SETTINGS,
  type AudioSettings,
  type AudioTrackType,
} from "./audio-generation";

export type MixAsset = {
  track: AudioTrackType;
  sceneIds: string[];
  offset: number;
  gain?: number;
  buffer: AudioBuffer;
};

type Window = { start: number; end: number; sceneId?: string };

export function mixWindows(durations: number[], sceneIds: Array<string | undefined>): Window[] {
  const windows: Window[] = [];
  let time = 0;
  durations.forEach((duration, i) => {
    const sceneId = sceneIds[i];
    const previous = windows.at(-1);
    if (previous && previous.sceneId === sceneId) previous.end = time + duration;
    else windows.push({ start: time, end: time + duration, sceneId });
    time += duration;
  });
  return windows;
}

function mergeWindows(windows: Window[], gap = 0): Window[] {
  const merged: Window[] = [];
  for (const window of windows) {
    const previous = merged.at(-1);
    if (previous && previous.end + gap >= window.start)
      previous.end = Math.max(previous.end, window.end);
    else merged.push({ ...window });
  }
  return merged;
}

export function audioPlacements(
  track: AudioTrackType,
  ids: string[],
  offset: number,
  windows: Window[],
  total: number,
): Window[] {
  if (track === "music") return [{ start: 0, end: total }];
  const selected = windows.filter((window) => window.sceneId && ids.includes(window.sceneId));
  if (track === "ambience") return mergeWindows(selected);
  return selected
    .map((window) => ({ ...window, start: window.start + offset }))
    .filter((window) => window.start < window.end);
}

export function scheduleAudioMix(input: {
  context: BaseAudioContext;
  destination: AudioNode;
  time: number;
  durations: number[];
  sceneIds: Array<string | undefined>;
  narration: Array<AudioBuffer | null>;
  rates: number[];
  cuts: Array<number | null>;
  assets: MixAsset[];
  settings?: AudioSettings;
}) {
  const { context, time } = input;
  const settings = { ...DEFAULT_AUDIO_SETTINGS, ...input.settings };
  const windows = mixWindows(input.durations, input.sceneIds);
  const total = windows.at(-1)?.end ?? 0;
  const master = context.createGain();
  master.gain.value = input.assets.length ? 0.92 : 1;
  master.connect(input.destination);
  const compressor = input.assets.length ? context.createDynamicsCompressor() : null;
  if (compressor) {
    compressor.threshold.value = -7;
    compressor.ratio.value = 12;
    compressor.connect(master);
  }
  const mixBus = compressor ?? master;

  const narration: Window[] = [];
  function source(
    buffer: AudioBuffer,
    start: number,
    end: number,
    volume: number,
    loop = false,
    rate = 1,
    fadeIn = 0,
    fadeOut = 0,
  ) {
    const length = Math.min(end - start, loop ? Infinity : buffer.duration / rate);
    if (length <= 0) return;
    const node = context.createBufferSource();
    const gain = context.createGain();
    node.buffer = buffer;
    node.loop = loop;
    node.playbackRate.value = rate;
    node.connect(gain);
    gain.connect(mixBus);
    const startAt = time + start;
    const endAt = startAt + length;
    const rise = Math.min(fadeIn, length / 2);
    const fall = Math.min(fadeOut, length / 2);
    gain.gain.setValueAtTime(rise ? 0 : volume, startAt);
    if (rise) gain.gain.linearRampToValueAtTime(volume, startAt + rise);
    if (fall) {
      gain.gain.setValueAtTime(volume, endAt - fall);
      gain.gain.linearRampToValueAtTime(0, endAt);
    }
    node.start(startAt);
    node.stop(endAt);
    node.onended = () => {
      node.disconnect();
      gain.disconnect();
    };
    return gain;
  }

  let start = 0;
  input.durations.forEach((duration, i) => {
    const buffer = input.narration[i];
    const rate = input.rates[i] ?? 1;
    const cut = input.cuts[i];
    if (buffer && settings.voiceoverEnabled && settings.narrationVolume > 0) {
      const end = Math.min(total, start + Math.min(buffer.duration / rate, cut ?? Infinity));
      source(buffer, start, end, settings.narrationVolume, false, rate, 0, cut ? 0.18 : 0);
      narration.push({ start, end });
    }
    start += duration;
  });

  const levels = {
    music: settings.musicVolume,
    ambience: settings.ambienceVolume,
    sfx: settings.sfxVolume,
  };
  for (const asset of input.assets) {
    const volume = levels[asset.track] * (asset.gain ?? 1);
    if (volume <= 0) continue;
    for (const placement of audioPlacements(
      asset.track,
      asset.sceneIds,
      asset.offset,
      windows,
      total,
    )) {
      const music = asset.track === "music";
      const ambience = asset.track === "ambience";
      const startAt = ambience ? Math.max(0, placement.start - 0.2) : placement.start;
      const endAt = ambience ? Math.min(total, placement.end + 0.2) : placement.end;
      const gain = source(
        asset.buffer,
        startAt,
        endAt,
        volume,
        (music && settings.loopMusic) || ambience,
        1,
        music ? settings.fadeInSeconds : ambience ? 0.4 : 0.01,
        music ? settings.fadeOutSeconds : ambience ? 0.4 : 0.025,
      );
      if (music && gain && settings.autoDucking) {
        const duck = context.createGain();
        gain.disconnect();
        gain.connect(duck);
        duck.connect(mixBus);
        const attack = 0.12;
        const release = 0.25;
        duck.gain.setValueAtTime(1, time);
        for (const spoken of mergeWindows(narration, attack + release)) {
          duck.gain.setValueAtTime(1, time + Math.max(0, spoken.start - attack));
          duck.gain.linearRampToValueAtTime(0.35, time + Math.max(0.01, spoken.start));
          duck.gain.setValueAtTime(0.35, time + Math.max(spoken.end, spoken.start + 0.01));
          duck.gain.linearRampToValueAtTime(1, time + spoken.end + release);
        }
      }
    }
  }
}
