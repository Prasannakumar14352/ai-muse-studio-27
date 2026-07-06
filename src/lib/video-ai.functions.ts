import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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
(Apple-style commercials, cinematic, punchy). Return STRICT JSON — no prose,
no markdown fences.`;

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

Return JSON EXACTLY:
{
  "title": "...",
  "reel_title": "...",
  "length_sec": 34,
  "style_note": "...",
  "scenes": [ { ...fields above... } ],
  "caption": "...",
  "hashtags": ["#..."]
}`;

    let upstream: Response;
    try {
      upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
        }),
      });
    } catch (e) {
      throw new Error(`AI gateway unreachable: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!upstream.ok) {
      const t = await upstream.text().catch(() => "");
      throw new Error(`AI gateway ${upstream.status}: ${t || upstream.statusText}`);
    }

    const j = (await upstream.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = j.choices?.[0]?.message?.content ?? "";
    if (!raw) throw new Error("AI returned empty content");

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("AI response was not valid JSON");
      parsed = JSON.parse(m[0]);
    }

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
    const out = Schema.parse(parsed);
    out.scenes = out.scenes.map((s, i) => ({ ...s, n: i + 1 }));
    return out;
  });
