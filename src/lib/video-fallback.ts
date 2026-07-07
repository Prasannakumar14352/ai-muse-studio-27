export type FallbackVideoScene = {
  n: number;
  time_range: string;
  role: string;
  voiceover: string;
  on_screen_text: string;
  visual: string;
  image_prompt: string;
  duration: string;
};

export type FallbackVideoScript = {
  title: string;
  reel_title: string;
  length_sec: number;
  style_note: string;
  scenes: FallbackVideoScene[];
  caption: string;
  hashtags: string[];
};

export function buildFallbackVideoScript(
  topic: string,
  sceneCount: number,
  lenSec: number,
  ratio: string,
  styleLabel: string
): FallbackVideoScript {
  const duration = Math.max(2, Math.round(lenSec / Math.max(1, sceneCount)));
  const beats = [
    `What if ${topic} changed everything?`,
    "The first shift is already happening quietly.",
    "Most people will miss the pattern until it is obvious.",
    "The winners will adapt before the old rules disappear.",
    "Follow the signal, not the noise.",
  ];

  const scenes = Array.from({ length: sceneCount }, (_, i): FallbackVideoScene => {
    const voiceover = beats[i % beats.length];
    return {
      n: i + 1,
      time_range: `${i * duration}-${(i + 1) * duration} sec`,
      role: i === 0 ? "Hook" : i === sceneCount - 1 ? "CTA" : `Beat ${i}`,
      voiceover,
      on_screen_text: i === 0 ? "Imagine this" : "",
      visual: `${styleLabel} cinematic scene about ${topic}`,
      image_prompt: `${styleLabel} style, ${ratio}, photorealistic, cinematic, premium commercial look, 8k, shallow depth of field. Visualize: ${voiceover}`,
      duration: `${duration}s`,
    };
  });

  return {
    title: topic,
    reel_title: topic,
    length_sec: scenes.reduce((total, scene) => total + parseSecValue(scene.duration), 0),
    style_note: `${styleLabel} structured fallback script`,
    scenes,
    caption: `${topic}. A fast cinematic breakdown of the key shift, why it matters, and what comes next.`,
    hashtags: ["#AI", "#Video", "#Future", "#Creator", "#Storytelling", "#Innovation", "#Trends", "#Shorts"],
  };
}

export function buildFallbackScenesFromScript(
  script: string,
  sceneCount: number,
  lenSec: number,
  ratio: string,
  styleLabel: string
): FallbackVideoScene[] {
  const sentences = script
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const duration = Math.max(2, Math.round(lenSec / Math.max(1, sceneCount)));

  return Array.from({ length: sceneCount }, (_, i): FallbackVideoScene => {
    const voiceover = sentences[i % Math.max(1, sentences.length)] || script.trim().slice(0, 160) || "Continue the story with a clear, cinematic beat.";
    return {
      n: i + 1,
      time_range: `${i * duration}-${(i + 1) * duration} sec`,
      role: i === 0 ? "Hook" : i === sceneCount - 1 ? "CTA" : `Beat ${i}`,
      voiceover,
      on_screen_text: i === 0 ? "Watch this" : "",
      visual: `${styleLabel} cinematic scene matching the narration beat.`,
      image_prompt: `${styleLabel} style, ${ratio}, photorealistic, cinematic, premium commercial look, 8k, shallow depth of field. Visualize: ${voiceover}`,
      duration: `${duration}s`,
    };
  });
}

function parseSecValue(duration: string): number {
  const m = /([\d.]+)/.exec(duration);
  const n = m ? parseFloat(m[1]) : 3;
  return Number.isFinite(n) && n > 0 ? n : 3;
}