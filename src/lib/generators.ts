// Placeholder AI generation utilities.
// These produce realistic-looking output for the MVP.
// Replace internals with real AI API calls later without changing signatures.

export type GeneratedProject = {
  title: string;
  hook: string;
  script: string;
  scenes: Array<{ n: number; visual: string; voiceover: string; duration: string }>;
  image_prompts: Array<{ n: number; prompt: string; style: string }>;
  captions: string;
  hashtags: string[];
  thumbnail_ideas: string[];
  cta: string;
};

const HOOKS = [
  "What if I told you this changes everything?",
  "Nobody is talking about this — but they should be.",
  "In the next 30 seconds, your view on this shifts forever.",
  "Stop scrolling. This is the one thing you need to see today.",
  "3 things you didn't know — the last one is wild.",
];

const CTAS = [
  "Follow for more like this.",
  "Save this — you'll need it later.",
  "Comment 'YES' if you agree.",
  "Share this with someone who needs to hear it.",
  "Link in bio to go deeper.",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateVideoScript(topic: string, tone: string, platform: string): string {
  return `[HOOK]
${pick(HOOKS)}

[INTRO — 5s]
Today we're talking about ${topic}. If you care about winning on ${platform}, you'll want to stick around — this is a ${tone.toLowerCase()} breakdown that most creators miss.

[POINT 1 — Setup the problem]
Most people think ${topic} is straightforward. It isn't. Here's what's really going on beneath the surface, and why the obvious approach is quietly costing you results.

[POINT 2 — Reframe]
The truth is simpler and harder than that. When you look at ${topic} through the lens of ${tone.toLowerCase()} creators, three patterns emerge — and once you see them, you can't unsee them.

[POINT 3 — Actionable insight]
Here's exactly what to do this week: pick one, ship it in 24 hours, measure it in 7 days. That's the entire loop.

[CLOSE]
${pick(CTAS)}`;
}

export function generateScenes(topic: string, style: string): GeneratedProject["scenes"] {
  const base = [
    { visual: `Cinematic overhead shot introducing ${topic}`, vo: "Open with a bold visual statement." },
    { visual: `Close-up of a person reacting to ${topic}`, vo: "Set the emotional stake." },
    { visual: `Macro detail shot in ${style} style`, vo: "Zoom into the specifics." },
    { visual: `Split screen — before vs after`, vo: "Show the contrast." },
    { visual: `Text overlay reveal: '${topic}'`, vo: "Deliver the core idea." },
    { visual: `Slow-motion b-roll of the transformation`, vo: "Land the emotion." },
    { visual: `Data / chart animation`, vo: "Anchor with a proof point." },
    { visual: `Creator direct-to-camera close-up`, vo: "Personal takeaway." },
    { visual: `${style} cinematic wide shot`, vo: "Reset the frame." },
    { visual: `Call-to-action end card with brand mark`, vo: "Drive the action." },
  ];
  return base.map((s, i) => ({
    n: i + 1,
    visual: s.visual,
    voiceover: s.vo,
    duration: `${3 + (i % 4)}s`,
  }));
}

export function generateImagePrompts(topic: string, style: string): GeneratedProject["image_prompts"] {
  return Array.from({ length: 8 }).map((_, i) => ({
    n: i + 1,
    prompt: `${topic}, scene ${i + 1}, ${style} aesthetic, dramatic lighting, ultra detailed, 8k, cinematic composition`,
    style,
  }));
}

export function generateCaptions(topic: string, platform: string, tone: string): string[] {
  return [
    `The ${topic} truth nobody on ${platform} wants to admit 👀\n\nSave this before the algorithm hides it.`,
    `${tone} take on ${topic} — because scrolling past this would be a mistake.\n\n${pick(CTAS)}`,
    `I studied ${topic} for weeks so you don't have to.\n\nHere are the 3 things that actually matter. 🧵`,
  ];
}

export function generateHashtags(topic: string, platform: string): string[] {
  const t = topic.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const base = [
    `#${t}`, `#${t}tips`, `#${t}2026`, `#${platform.toLowerCase()}`,
    "#viral", "#trending", "#creator", "#contentcreator", "#reels", "#shortsvideo",
    "#storytelling", "#growth", "#mindset", "#learn", "#howto", "#tutorial",
    "#explorepage", "#foryou", "#fyp", "#ai", "#aicontent", "#aicreator",
    "#creatoreconomy", "#productivity", "#inspiration", "#dailycontent",
    "#branding", "#digitalcreator", "#socialmedia", "#growthhacking",
  ];
  return base.slice(0, 30);
}

export function generateThumbnailIdeas(topic: string): string[] {
  return [
    `Bold text: "THE TRUTH ABOUT ${topic.toUpperCase()}" + shocked face close-up`,
    `Split-frame: red X vs green ✓ with '${topic}' in center`,
    `Cinematic character portrait, neon lighting, '${topic}?' overlay`,
    `Before/After with arrow, gradient background, curiosity gap`,
  ];
}

export function generateProject(input: {
  topic: string; tone: string; platform: string; style: string;
}): GeneratedProject {
  const { topic, tone, platform, style } = input;
  return {
    title: `${topic}: The ${tone} ${platform} Playbook Nobody Talks About`,
    hook: pick(HOOKS),
    script: generateVideoScript(topic, tone, platform),
    scenes: generateScenes(topic, style),
    image_prompts: generateImagePrompts(topic, style),
    captions: generateCaptions(topic, platform, tone).join("\n\n---\n\n"),
    hashtags: generateHashtags(topic, platform),
    thumbnail_ideas: generateThumbnailIdeas(topic),
    cta: pick(CTAS),
  };
}
