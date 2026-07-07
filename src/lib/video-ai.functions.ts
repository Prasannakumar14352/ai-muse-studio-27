import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { parseStructuredJsonResponse } from "@/lib/video-json";

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
        rawResponses.push(raw);
        parseErrors.push(`Attempt ${attempt}: ${e instanceof Error ? e.message : String(e)}`);
        if (attempt === 3 && raw) console.error(raw);
      }
    }

    let finalOut: z.infer<typeof Schema> & { debug_json?: AiJsonDebug };
    if (out) {
      finalOut = out;
    } else {
      finalOut = buildFallbackVideoScript(data.topic, sceneCount, lenSec, ratio, data.styleLabel);
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

function buildFallbackVideoScript(topic: string, sceneCount: number, lenSec: number, ratio: string, styleLabel: string): AiVideoScript {
  const duration = Math.max(2, Math.round(lenSec / Math.max(1, sceneCount)));
  const beats = [
    `What if ${topic} changed everything?`,
    `The first shift is already happening quietly.`,
    `Most people will miss the pattern until it is obvious.`,
    `The winners will adapt before the old rules disappear.`,
    `Follow the signal, not the noise.`,
  ];

  const scenes = Array.from({ length: sceneCount }, (_, i): AiVideoScene => {
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

function buildFallbackScenesFromScript(script: string, sceneCount: number, lenSec: number, ratio: string, styleLabel: string): AiVideoScene[] {
  const sentences = script
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const duration = Math.max(2, Math.round(lenSec / Math.max(1, sceneCount)));

  return Array.from({ length: sceneCount }, (_, i): AiVideoScene => {
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
