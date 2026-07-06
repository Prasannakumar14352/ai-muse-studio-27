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

import { getStyle } from "./constants";

export function generateScenes(topic: string, style: string, contentType = "short_reel"): GeneratedProject["scenes"] {
  const s = getStyle(style);
  const isLong = contentType === "long_video";
  const label = s.label;
  const descriptor = s.descriptor;

  const shortBase = [
    { visual: `Opening hook: ${label} portrait of "${topic}" — ${descriptor}`, vo: `Open bold: "${topic}" — this changes everything.` },
    { visual: `Close-up reaction shot rendered in ${label}, subject reacting to ${topic}`, vo: "Set the emotional stake in one sentence." },
    { visual: `Macro detail shot, ${descriptor}, textures of ${topic}`, vo: "Zoom into the specifics people miss." },
    { visual: `${label} split-screen: the wrong way vs the right way for ${topic}`, vo: "Show the contrast — before and after." },
    { visual: `Kinetic typography reveal: "${topic}" in ${label} palette`, vo: "Deliver the core insight in one line." },
    { visual: `${label} b-roll of the transformation moment, cinematic slow motion`, vo: "Land the emotion — let it breathe." },
    { visual: `${label} data reveal / chart animation about ${topic}`, vo: "Anchor with one proof point." },
    { visual: `Creator direct-to-camera close-up, ${label} lighting`, vo: "Personal takeaway — say it like you mean it." },
    { visual: `${label} epic wide shot resetting the frame around ${topic}`, vo: "Reset — one breath before the payoff." },
    { visual: `${label} end card with brand mark and CTA overlay`, vo: pick(CTAS) },
  ];

  const longExtra = [
    { visual: `${label} interview cutaway: expert framed with soft key light`, vo: `Bring in the deeper why of ${topic}.` },
    { visual: `${label} historical montage: how ${topic} evolved`, vo: "Give the context — the story arc that got us here." },
    { visual: `${label} case study lower-third: real numbers about ${topic}`, vo: "Prove it with a story we can measure." },
    { visual: `${label} step-by-step overlay: 3 things to do this week`, vo: "Walk through the exact playbook, one step at a time." },
    { visual: `${label} objection-handling insert: "but what about…"`, vo: "Handle the pushback before it kills your idea." },
    { visual: `${label} montage: before/after transformations for ${topic}`, vo: "Show the payoff at scale." },
    { visual: `${label} cinematic wide: the horizon shot`, vo: "Zoom out — here's the bigger picture." },
    { visual: `${label} end card with subscribe animation and CTA`, vo: pick(CTAS) },
  ];

  const arr = isLong ? [...shortBase, ...longExtra] : shortBase;
  return arr.map((sc, i) => ({
    n: i + 1,
    visual: sc.visual,
    voiceover: sc.vo,
    duration: `${isLong ? 6 + (i % 5) : 3 + (i % 4)}s`,
  }));
}

export function generateImagePrompts(topic: string, style: string, count = 8): GeneratedProject["image_prompts"] {
  const s = getStyle(style);
  return Array.from({ length: count }).map((_, i) => ({
    n: i + 1,
    prompt: `${topic}, shot ${i + 1}, ${s.descriptor}, dramatic composition, ultra detailed, 8k`,
    style: s.label,
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

export function generateThumbnailIdeas(topic: string, style = "cinematic"): string[] {
  const s = getStyle(style);
  return [
    `${s.label} bold text: "THE TRUTH ABOUT ${topic.toUpperCase()}" + shocked face close-up`,
    `${s.label} split-frame: red X vs green ✓ with '${topic}' in center`,
    `${s.label} character portrait, ${s.descriptor}, '${topic}?' overlay`,
    `${s.label} before/After with arrow, curiosity gap headline about ${topic}`,
  ];
}

export function generateProject(input: {
  topic: string; tone: string; platform: string; style: string; contentType?: string;
}): GeneratedProject {
  const { topic, tone, platform, style, contentType = "short_reel" } = input;
  const s = getStyle(style);
  const isLong = contentType === "long_video";
  return {
    title: `${topic}: The ${tone} ${s.label} ${platform} ${isLong ? "Deep-Dive" : "Playbook"}`,
    hook: pick(HOOKS),
    script: generateVideoScript(topic, tone, platform),
    scenes: generateScenes(topic, style, contentType),
    image_prompts: generateImagePrompts(topic, style, isLong ? 16 : 8),
    captions: generateCaptions(topic, platform, tone).join("\n\n---\n\n"),
    hashtags: generateHashtags(topic, platform),
    thumbnail_ideas: generateThumbnailIdeas(topic, style),
    cta: pick(CTAS),
  };
}
