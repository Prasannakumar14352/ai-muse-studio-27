import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { parseStructuredJsonResponse } from "@/lib/video-json";
import { buildFallbackScenesFromScript, buildFallbackVideoScript } from "@/lib/video-fallback";

export type AiVideoScene = {
  n: number;
  time_range: string;       // "0-3 sec"
  role: string;             // "Hook" | "Beat" | "CTA"
  voiceover: string;        // spoken line
  on_screen_text: string;   // short caption baked onto the video (may be "")
  visual: string;           // 1-line description
  image_prompt: string;     // rich prompt for image gen
  duration: string;         // e.g. "3s"
};

export type AiVideoScript = {
  title: string;
  reel_title: string;
  length_sec: number;
  style_note: string;
  scenes: AiVideoScene[];
  caption: string;
  hashtags: string[];
  debug_json?: AiJsonDebug;
};

export type AiJsonDebug = {
  raw_responses: string[];
  parse_errors: string[];
  attempts: number;
  used_repair: boolean;
  used_fallback?: boolean;
};

const Input = z.object({
  topic: z.string().min(1),
  tone: z.string(),
  platform: z.string(),
  styleLabel: z.string(),
  contentType: z.string(),       // "short_reel" | "long_video" | ...
  audience: z.string().optional().default(""),
  /** Target length in seconds — used to size long_video output (30-600). */
  targetLengthSec: z.number().int().min(15).max(1800).optional(),
});

export const generateAiVideoScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => Input.parse(v))
  .handler(async ({ data }): Promise<AiVideoScript> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const isLong = data.contentType === "long_video";
    const defaultLen = isLong ? 75 : 35;
    const lenSec = Math.max(15, Math.min(1800, data.targetLengthSec ?? defaultLen));
    const targetLen = `${lenSec} seconds`;
    // Roughly one scene per ~8 seconds for long form, ~5 for shorts. Allow up
    // to 120 scenes so a 15+ minute long video isn't silently truncated to
    // ~4 minutes worth of scenes.
    const sceneCount = Math.max(3, Math.min(120, Math.round(lenSec / (isLong ? 8 : 5))));
    const ratio = data.contentType === "long_video" ? "16:9" : "9:16";

    const sys = `You are a senior short-form video creative director. You write
premium, high-retention social video scripts in the style of top viral creators
(Apple-style commercials, cinematic, punchy). Return ONLY valid JSON. No
markdown. No explanations. No code fences. Escape quotation marks inside all
generated strings so the response parses with JSON.parse.`;

    const user = `Write a ${targetLen} ${data.platform} video for the topic below.

TOPIC: ${data.topic}
TONE: ${data.tone}
AUDIENCE: ${data.audience || "general creators"}
VISUAL STYLE: ${data.styleLabel}
FORMAT: ${data.contentType} (${ratio})

Structure it as ${sceneCount} scenes. Scene 1 is a hard hook (0-3 sec). Last
scene is a CTA. In between, deliver 3-5 punchy beats that pay off the hook.

For EACH scene, produce:
- n: scene number (1..${sceneCount})
- time_range: e.g. "0-3 sec"
- role: "Hook" | "Beat 1"..."Beat N" | "CTA"
- voiceover: the exact spoken line (1 sentence, conversational, max 20 words).
  This is the ONLY text that will appear as subtitles on the video, so write it
  cleanly with no stage directions, no brackets, no emojis.
- on_screen_text: a very short caption (0-6 words) burned onto the frame at
  key moments, or empty string if the scene should be visual-only.
  Use it sparingly — only when it adds punch (numbers, one-word reveals,
  the payoff line). No hashtags, no emojis.
- visual: 1-line description of what's on screen.
- image_prompt: a rich, self-contained prompt for an AI image model. It MUST
  include: "${data.styleLabel} style, ${ratio}, photorealistic, cinematic,
  premium commercial look, 8k, shallow depth of field". Describe the subject,
  setting, lighting, and framing in detail. NO text overlays baked into the
  image itself — text is added by the renderer.
- duration: e.g. "3s" (integer seconds, 2-8s).

Also produce:
- title: internal project title
- reel_title: the public reel/video title shown on the platform
- length_sec: total seconds (sum of scene durations)
- style_note: one-line style summary
- caption: platform caption with a hook line + payoff (2-4 sentences)
- hashtags: 8-15 relevant hashtags, each starting with #

Return ONLY this JSON object shape with no prose:
{
  "title": "string",
  "reel_title": "string",
  "length_sec": 34,
  "style_note": "string",
  "scenes": [
    {
      "n": 1,
      "time_range": "0-3 sec",
      "role": "Hook",
      "voiceover": "string",
      "on_screen_text": "string",
      "visual": "string",
      "image_prompt": "string",
      "duration": "3s"
    }
  ],
  "caption": "string",
  "hashtags": ["#example"]
}`;

    const Schema = z.object({
      title: z.string(),
      reel_title: z.string().optional().default(""),
      length_sec: z.number().optional().default(0),
      style_note: z.string().optional().default(""),
      scenes: z.array(z.object({
        n: z.number(),
        time_range: z.string().optional().default(""),
        role: z.string(),
        voiceover: z.string(),
        on_screen_text: z.string().optional().default(""),
        visual: z.string(),
        image_prompt: z.string(),
        duration: z.string().optional().default("3s"),
      })),
      caption: z.string().optional().default(""),
      hashtags: z.array(z.string()).optional().default([]),
    });

    const rawResponses: string[] = [];
    const parseErrors: string[] = [];
    let usedRepair = false;
    let out: (z.infer<typeof Schema> & { debug_json?: AiJsonDebug }) | null = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      let raw = "";
      let receivedAiResponse = false;
      try {
        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: sys },
              { role: "user", content: user },
            ],
            response_format: { type: "json_object" },
            max_tokens: Math.min(32000, 2000 + sceneCount * 400),
          }),
        });

        if (!upstream.ok) {
          const t = await upstream.text().catch(() => "");
          throw new Error(`AI gateway ${upstream.status}: ${t || upstream.statusText}`);
        }

        const j = (await upstream.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        raw = j.choices?.[0]?.message?.content ?? "";
        receivedAiResponse = true;
        const parsed = parseStructuredJsonResponse(raw);
        const checked = Schema.safeParse(parsed.value);
        if (!checked.success) {
          console.error(raw);
          rawResponses.push(raw);
          parseErrors.push(`Attempt ${attempt}: ${checked.error.message}`);
          continue;
        }
        if (parsed.repaired) {
          usedRepair = true;
          rawResponses.push(raw);
          parseErrors.push(`Attempt ${attempt}: ${parsed.note ?? "AI JSON response was repaired before parsing"}`);
        }
        out = checked.data;
        break;
      } catch (e) {
        if (!receivedAiResponse) throw e;
        rawResponses.push(raw);
        parseErrors.push(`Attempt ${attempt}: ${e instanceof Error ? e.message : String(e)}`);
        if (attempt === 3 && raw) console.error(raw);
      }
    }

    let finalOut: z.infer<typeof Schema> & { debug_json?: AiJsonDebug };
    if (out) {
      finalOut = out;
    } else {
      finalOut = buildFallbackVideoScript(data.topic, sceneCount, lenSec, ratio, data.styleLabel) as z.infer<typeof Schema> & { debug_json?: AiJsonDebug };
      parseErrors.push("Used fallback script after 3 invalid JSON attempts");
    }

    finalOut.scenes = finalOut.scenes.map((s, i) => ({ ...s, n: i + 1 }));

    // Enforce the requested target length. AI models frequently return fewer
    // or shorter scenes than asked; scale each scene's base duration so the
    // total sum matches the user-selected length. The renderer uses
    // max(base, voiceover+0.25s) per scene, so stretching base durations
    // reliably extends the final video.
    if (data.targetLengthSec && finalOut.scenes.length > 0) {
      const parseSec = (d: string) => {
        const m = /([\d.]+)/.exec(d);
        const n = m ? parseFloat(m[1]) : 3;
        return Number.isFinite(n) && n > 0 ? n : 3;
      };
      const current = finalOut.scenes.reduce((a, s) => a + parseSec(s.duration), 0);
      if (current > 0) {
        const factor = lenSec / current;
        finalOut.scenes = finalOut.scenes.map((s) => {
          const scaled = Math.max(2, Math.round(parseSec(s.duration) * factor));
          return { ...s, duration: `${scaled}s` };
        });
      }
      finalOut.length_sec = finalOut.scenes.reduce((a, s) => a + parseSec(s.duration), 0);
    }

    if (rawResponses.length > 0 || parseErrors.length > 0) {
      finalOut.debug_json = {
        raw_responses: rawResponses.filter(Boolean),
        parse_errors: parseErrors,
        attempts: Math.min(3, Math.max(1, parseErrors.length)),
        used_repair: usedRepair,
        used_fallback: parseErrors.some((e) => e.includes("Used fallback")),
      };
    }

    return finalOut;
  });

// ---------------------------------------------------------------------------
// Regenerate scenes + image prompts from a user-edited script.
// ---------------------------------------------------------------------------

const FromScriptInput = z.object({
  script: z.string().min(1),
  topic: z.string().optional().default(""),
  tone: z.string().optional().default("Viral"),
  platform: z.string().optional().default("instagram"),
  styleLabel: z.string().optional().default("Cinematic"),
  contentType: z.string().optional().default("short_reel"),
  targetLengthSec: z.number().int().min(15).max(1800).optional(),
});

export type ScenesFromScript = {
  scenes: AiVideoScene[];
  image_prompts: Array<{ n: number; prompt: string; style: string }>;
  debug_json?: AiJsonDebug;
};

export const generateScenesFromScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => FromScriptInput.parse(v))
  .handler(async ({ data }): Promise<ScenesFromScript> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const isLong = data.contentType === "long_video";
    const defaultLen = isLong ? 75 : 35;
    const lenSec = Math.max(15, Math.min(1800, data.targetLengthSec ?? defaultLen));
    const sceneCount = Math.max(3, Math.min(120, Math.round(lenSec / (isLong ? 8 : 5))));
    const ratio = isLong ? "16:9" : "9:16";

    const sys = `You are a senior short-form video creative director. Given a
finished script, break it into a scene-by-scene shot list with rich AI image
prompts. Return ONLY valid JSON. No markdown. No explanations. No code fences.
Escape quotation marks inside all generated strings so the response parses with
JSON.parse.`;

    const user = `Break the following ${data.platform} script into ${sceneCount} scenes.
The scenes MUST cover the entire script in order — do not drop or invent content.

TOPIC: ${data.topic}
TONE: ${data.tone}
VISUAL STYLE: ${data.styleLabel}
FORMAT: ${data.contentType} (${ratio})

SCRIPT:
"""
${data.script}
"""

For EACH scene produce:
- n: 1..${sceneCount}
- time_range: e.g. "0-3 sec"
- role: "Hook" | "Beat 1"..."Beat N" | "CTA"
- voiceover: exact spoken line pulled/paraphrased from the script (1 sentence, max 20 words, no stage directions)
- on_screen_text: 0-6 word caption or "" (no hashtags, no emojis)
- visual: 1-line description of what's on screen
- image_prompt: rich prompt for an AI image model. MUST include:
  "${data.styleLabel} style, ${ratio}, photorealistic, cinematic, premium commercial look, 8k, shallow depth of field".
  Describe subject, setting, lighting, framing. NO text overlays in the image.
- duration: "Ns" integer seconds 2-8

Return ONLY this JSON object shape with no prose:
{ "scenes": [ { "n": 1, "time_range": "0-3 sec", "role": "Hook", "voiceover": "string", "on_screen_text": "string", "visual": "string", "image_prompt": "string", "duration": "3s" } ] }`;

    const Schema = z.object({
      scenes: z.array(z.object({
        n: z.number().optional().default(0),
        time_range: z.string().optional().default(""),
        role: z.string().optional().default("Beat"),
        voiceover: z.string(),
        on_screen_text: z.string().optional().default(""),
        visual: z.string(),
        image_prompt: z.string(),
        duration: z.string().optional().default("3s"),
      })),
    });

    const rawResponses: string[] = [];
    const parseErrors: string[] = [];
    let usedRepair = false;
    let out: z.infer<typeof Schema> | null = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      let raw = "";
      let receivedAiResponse = false;
      try {
        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: sys },
              { role: "user", content: user },
            ],
            response_format: { type: "json_object" },
            max_tokens: Math.min(32000, 2000 + sceneCount * 400),
          }),
        });
        if (!upstream.ok) {
          const t = await upstream.text().catch(() => "");
          throw new Error(`AI gateway ${upstream.status}: ${t || upstream.statusText}`);
        }
        const j = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
        raw = j.choices?.[0]?.message?.content ?? "";
        receivedAiResponse = true;
        const parsed = parseStructuredJsonResponse(raw);
        const checked = Schema.safeParse(parsed.value);
        if (!checked.success) {
          console.error(raw);
          rawResponses.push(raw);
          parseErrors.push(`Attempt ${attempt}: ${checked.error.message}`);
          continue;
        }
        if (parsed.repaired) {
          usedRepair = true;
          rawResponses.push(raw);
          parseErrors.push(`Attempt ${attempt}: ${parsed.note ?? "AI JSON response was repaired before parsing"}`);
        }
        out = checked.data;
        break;
      } catch (e) {
        if (!receivedAiResponse) throw e;
        rawResponses.push(raw);
        parseErrors.push(`Attempt ${attempt}: ${e instanceof Error ? e.message : String(e)}`);
        if (attempt === 3 && raw) console.error(raw);
      }
    }

    const finalOut = out ?? { scenes: buildFallbackScenesFromScript(data.script, sceneCount, lenSec, ratio, data.styleLabel) };
    if (!out) {
      parseErrors.push("Used fallback scenes after 3 invalid JSON attempts");
    }

    const scenes = finalOut.scenes.map((s, i) => ({ ...s, n: i + 1 }));

    const image_prompts = scenes.map((s) => ({
      n: s.n,
      prompt: s.image_prompt,
      style: data.styleLabel,
    }));

    return {
      scenes,
      image_prompts,
      debug_json: rawResponses.length > 0 || parseErrors.length > 0 ? {
        raw_responses: rawResponses.filter(Boolean),
        parse_errors: parseErrors,
        attempts: Math.min(3, Math.max(1, parseErrors.length)),
        used_repair: usedRepair,
        used_fallback: parseErrors.some((e) => e.includes("Used fallback")),
      } : undefined,
    };
  });

// ---------------------------------------------------------------------------
// SEO Agent — YouTube title / long description / hashtags / tags / pinned
// comment / chapters. Always returns populated fields (uses a fallback so
// nothing in the UI is ever blank).
// ---------------------------------------------------------------------------

const SeoInput = z.object({
  topic: z.string().min(1),
  styleLabel: z.string().optional().default("Cinematic"),
  platform: z.string().optional().default("youtube"),
  contentType: z.string().optional().default("short_reel"),
  scenes: z.array(z.object({
    n: z.number(),
    voiceover: z.string().optional().default(""),
    duration_sec: z.number().optional().default(3),
  })).optional().default([]),
  script_caption: z.string().optional().default(""),
});

export type AiVideoSeo = {
  youtube_title: string;
  youtube_description: string;
  hashtags: string[];
  tags: string[];
  pinned_comment: string;
  chapters: Array<{ time: string; label: string }>;
};

export const generateAiVideoSeo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => SeoInput.parse(v))
  .handler(async ({ data }): Promise<AiVideoSeo> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const sys = `You are a YouTube SEO strategist. Return ONLY valid JSON. No
markdown. No code fences. No prose outside the JSON.`;

    const chapterHint = data.scenes.length >= 3
      ? `Use the ${data.scenes.length} scenes below to derive chapter timestamps in mm:ss starting at 00:00.`
      : "Include 3-6 chapters spanning the video.";

    const cumulative: Array<{ time: string; hint: string }> = [];
    let t = 0;
    for (const s of data.scenes) {
      const mm = Math.floor(t / 60).toString().padStart(2, "0");
      const ss = Math.floor(t % 60).toString().padStart(2, "0");
      cumulative.push({ time: `${mm}:${ss}`, hint: s.voiceover.slice(0, 80) });
      t += Math.max(1, s.duration_sec || 3);
    }

    const user = `Generate YouTube SEO for the video below.

TOPIC: ${data.topic}
STYLE: ${data.styleLabel}
PLATFORM: ${data.platform}
FORMAT: ${data.contentType}
${data.script_caption ? `EXISTING CAPTION: ${data.script_caption}` : ""}

${chapterHint}
Scene timing hints (mm:ss — voiceover snippet):
${cumulative.map((c) => `- ${c.time} — ${c.hint}`).join("\n")}

Requirements:
- youtube_title: <= 70 characters, keyword-rich, high CTR, no clickbait lies.
- youtube_description: 300-600 words. Open with a strong hook line. Include
  the topic keyword naturally 2-4 times. Include a clear CTA to subscribe /
  comment. Include a short "In this video" bullet list. End with a
  hashtag line.
- hashtags: 15-20 relevant hashtags, each starting with #, no spaces.
- tags: 15-25 YouTube search tags (plain phrases, no #).
- pinned_comment: a friendly 1-3 sentence pinned comment that asks a
  question to drive replies.
- chapters: array of { time: "mm:ss", label: "Short title" }. First MUST be
  00:00. 3-8 chapters total.

Return ONLY this JSON shape:
{
  "youtube_title": "string",
  "youtube_description": "string",
  "hashtags": ["#example"],
  "tags": ["example"],
  "pinned_comment": "string",
  "chapters": [{ "time": "00:00", "label": "Intro" }]
}`;

    const Schema = z.object({
      youtube_title: z.string(),
      youtube_description: z.string(),
      hashtags: z.array(z.string()).optional().default([]),
      tags: z.array(z.string()).optional().default([]),
      pinned_comment: z.string().optional().default(""),
      chapters: z.array(z.object({ time: z.string(), label: z.string() })).optional().default([]),
    });

    const fallback = (): AiVideoSeo => ({
      youtube_title: data.topic.slice(0, 70),
      youtube_description:
        `${data.topic}. In this video we break down what it means, why it matters, and where it leads next.\n\n` +
        `We look at ${data.topic.toLowerCase()} through a ${data.styleLabel.toLowerCase()} lens — the signals, the shifts, and the story most people are missing.\n\n` +
        `In this video:\n- The hook: why ${data.topic.toLowerCase()} is happening now\n- The core shift\n- What it means for you\n- Where it goes next\n\n` +
        `👉 Subscribe for more deep dives on the future.\n💬 Drop your thoughts in the comments — we read every one.\n\n` +
        `#${slugTag(data.topic)} #future #ai #technology #shorts`,
      hashtags: buildFallbackHashtags(data.topic),
      tags: buildFallbackTags(data.topic),
      pinned_comment: `What surprised you most about ${data.topic}? Drop your take below — we reply to every comment.`,
      chapters: buildFallbackChapters(cumulative),
    });

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: sys },
              { role: "user", content: user },
            ],
            response_format: { type: "json_object" },
            max_tokens: 4000,
          }),
        });
        if (!upstream.ok) {
          const t2 = await upstream.text().catch(() => "");
          throw new Error(`AI gateway ${upstream.status}: ${t2 || upstream.statusText}`);
        }
        const j = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const raw = j.choices?.[0]?.message?.content ?? "";
        const parsed = parseStructuredJsonResponse(raw);
        const checked = Schema.safeParse(parsed.value);
        if (!checked.success) {
          console.error("[SEO Agent] Invalid JSON", checked.error.message, raw);
          continue;
        }
        const seo = checked.data;
        // Guarantee non-empty fields.
        if (!seo.hashtags.length) seo.hashtags = buildFallbackHashtags(data.topic);
        if (!seo.tags.length) seo.tags = buildFallbackTags(data.topic);
        if (!seo.chapters.length) seo.chapters = buildFallbackChapters(cumulative);
        if (!seo.pinned_comment) seo.pinned_comment = `What surprised you most about ${data.topic}?`;
        return seo as AiVideoSeo;
      } catch (e) {
        console.error("[SEO Agent] attempt failed", e);
      }
    }

    return fallback();
  });

function slugTag(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "video";
}

function buildFallbackHashtags(topic: string): string[] {
  const base = [
    `#${slugTag(topic)}`, "#future", "#ai", "#technology", "#innovation",
    "#trends", "#viral", "#shorts", "#reels", "#creator",
    "#storytelling", "#documentary", "#science", "#mindset", "#business",
    "#youtube", "#learn", "#insight", "#deepdive", "#next",
  ];
  return Array.from(new Set(base)).slice(0, 18);
}

function buildFallbackTags(topic: string): string[] {
  const base = [
    topic, `${topic} explained`, `${topic} documentary`, `${topic} future`,
    "future technology", "ai", "artificial intelligence", "future world",
    "future predictions", "science", "innovation", "trends", "next big thing",
    "documentary", "cinematic", "storytelling", "viral video", "shorts",
    "future of humanity", "big ideas",
  ];
  return Array.from(new Set(base)).slice(0, 20);
}

function buildFallbackChapters(cumulative: Array<{ time: string; hint: string }>): Array<{ time: string; label: string }> {
  if (cumulative.length === 0) {
    return [
      { time: "00:00", label: "Intro" },
      { time: "00:15", label: "The setup" },
      { time: "00:45", label: "The shift" },
      { time: "01:30", label: "What it means" },
      { time: "02:15", label: "Wrap-up" },
    ];
  }
  const chapters: Array<{ time: string; label: string }> = [];
  const step = Math.max(1, Math.floor(cumulative.length / 5));
  const labels = ["Intro", "The setup", "The shift", "What it means", "The payoff", "Wrap-up"];
  for (let i = 0; i < cumulative.length; i += step) {
    const idx = Math.min(chapters.length, labels.length - 1);
    chapters.push({ time: cumulative[i].time, label: labels[idx] });
    if (chapters.length >= labels.length) break;
  }
  if (chapters[0]) chapters[0].time = "00:00";
  return chapters;
}

