import { createServerFn } from "@tanstack/react-start";
import { languageAndFidelityRules, resolveContentLanguage } from "@/lib/content-language";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chargeMiddleware } from "@/lib/credits-guard.server";
import { z } from "zod";
import { parseStructuredJsonResponse } from "@/lib/video-json";
import { buildFallbackScenesFromScript, buildFallbackVideoScript } from "@/lib/video-fallback";
import { countWords, getDurationTargets, maxWordsForScene, normalizeSceneTiming, speechWordsPerSecond, totalVoiceoverWords } from "@/lib/video-duration";
import { aiChatFetch, aiKey, AI_NOT_CONFIGURED } from "@/lib/ai-provider";


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
  /**
   * Structural blueprint produced by the YouTube Retention Engine that runs
   * BEFORE this agent. When present, the Script Agent MUST follow it exactly:
   * hook line, intro promise, curiosity loops, chapter beats, retention-hook
   * cadence, pattern-interrupt schedule, emotional-climax placement, ending,
   * and CTA. This is what turns a narrated article into a professionally
   * structured YouTube documentary.
   */
  retentionBrief: z.string().optional().default(""),
  /** Output language ("auto" = same as the topic). */
  language: z.string().optional().default("auto"),
});

export const generateAiVideoScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, chargeMiddleware("video_script")])
  .inputValidator((v: unknown) => Input.parse(v))
  .handler(async ({ data }): Promise<AiVideoScript> => {
    const key = aiKey();
    if (!key) throw new Error(AI_NOT_CONFIGURED);

    const isLong = data.contentType === "long_video";
    const defaultLen = isLong ? 75 : 35;
    const lenSec = Math.max(15, Math.min(1800, data.targetLengthSec ?? defaultLen));

    // DURATION IS THE SOURCE OF TRUTH. Derive word count + scene count from it,
    // at the speaking speed of the narration language (Telugu ≈ 1.7 w/s, not 2.5).
    const narrationLang = resolveContentLanguage(data.language, data.topic);
    const wordsPerSec = speechWordsPerSecond(narrationLang);
    const targets = getDurationTargets(lenSec, narrationLang);
    const wMin = targets.words.min;
    const wMax = targets.words.max;
    const wTarget = targets.words.target;
    const sMin = targets.scenes.min;
    const sMax = targets.scenes.max;
    const sceneCount = targets.scenes.target;
    const wpsTarget = targets.wordsPerScene.target;
    const wpsMin = targets.wordsPerScene.min;
    const wpsMax = targets.wordsPerScene.max;
    const targetLen = `${lenSec} seconds`;
    const ratio = isLong ? "16:9" : "9:16";

    const sys = `You are a senior long-form video creative director. You write
premium, high-retention documentary and social scripts in the style of top
viral creators (Apple-style commercials, cinematic, punchy). You NEVER stop
writing early — you deliver the FULL narration word budget you are given.
Return ONLY valid JSON. No markdown. No explanations. No code fences. Escape
quotation marks inside all generated strings so the response parses with
JSON.parse.`;

    const user = `Write a ${targetLen} ${data.platform} video for the topic below.

TOPIC: ${data.topic}
TONE: ${data.tone}
AUDIENCE: ${data.audience || "general creators"}
VISUAL STYLE: ${data.styleLabel}
FORMAT: ${data.contentType} (${ratio})

${languageAndFidelityRules(data.language, data.topic)}

DURATION IS A HARD REQUIREMENT.
- Total video length: ${targetLen} (${lenSec}s).
- Total narration MUST be ${wMin}-${wMax} words (target ~${wTarget}). Do NOT stop early.
- Use ${sMin}-${sMax} scenes (target ~${sceneCount}). Do NOT stop after a handful.
- Spoken ${narrationLang} runs ~${wordsPerSec} words/second, so ${wTarget} words ~= ${Math.round(wTarget / wordsPerSec)}s of narration.
- EVERY scene's voiceover MUST fit that scene's "duration": at most
  floor(duration_seconds × ${(wordsPerSec * 0.95).toFixed(2)}) words — e.g. ${maxWordsForScene(3, narrationLang)} words for a 3s scene,
  ${maxWordsForScene(4, narrationLang)} for 4s, ${maxWordsForScene(5, narrationLang)} for 5s. A line that is too long makes the
  narration overlap the next scene. Split a long thought across two scenes instead.
- If you would otherwise be short, ADD real substance: more evidence, more
  examples, a deeper "why", a counter-point, a case study — never filler.

Scene 1 is a hard hook (0-3 sec). Last scene is a CTA. In between, deliver
a full documentary arc that pays off the hook.

${data.retentionBrief ? `RETENTION ENGINE BLUEPRINT (AUTHORITATIVE — follow it EXACTLY):
${data.retentionBrief}

The blueprint above is the single source of truth for the video's dramatic
structure. Use the EXACT hook line for scene 1. Bake the intro promise into
scenes 2-4 verbatim in spirit. Insert the listed retention-hook phrases at
their scheduled seconds — do not paraphrase them away. Place the emotional
climax at the scheduled scene. End with the given closing thought and CTA
line word-for-word.

` : ""}STRUCTURE (bake these into the scene sequence — they are NOT extra output):
- INTRO (scenes 2-4, roughly 5-15% of total duration): set up the stakes
  and PROMISE the payoff without giving it away. Tell the viewer exactly
  what they will get if they stay.
- CURIOSITY LOOPS: every 20-30 seconds, open a NEW loop with a phrase
  like "but first…", "we'll get to that in a second", "here's the twist
  most people miss…", "and the reason is not what you think". Close each
  loop before the CTA — never leave one dangling.
- RETENTION HOOKS: every 30-60 seconds insert a one-line curiosity
  statement such as "But that's only the beginning…", "Then everything
  changed…", "What happened next shocked everyone…".
- PATTERN INTERRUPTS: roughly every 20-40 seconds, place a pattern-
  interrupt scene — a surprising statistic, a contrarian claim, a sudden
  mini-story, a map/timeline pivot, or a b-roll change. NEVER let two
  consecutive scenes hit the same emotional beat or use the same sentence
  structure. Flag these visually via on_screen_text and visual.
- EMOTIONAL CLIMAX: the strongest, most emotional moment of the video
  MUST land at 80-90% of total duration. Build tension toward it.
- ENDING: summarize the story and leave the viewer with a thought-
  provoking question.
- CTA: a natural, channel-appropriate subscribe prompt — never a generic
  "like and subscribe". Reward viewers who stayed.
- PAYOFFS: every promise the intro or a loop makes MUST be explicitly
  paid off in a later scene.


For EACH scene, produce:
- n: scene number (1..${sceneCount})
- time_range: e.g. "0-3 sec"
- role: "Hook" | "Beat 1"..."Beat N" | "CTA"
- voiceover: the exact spoken line for this scene. Aim for ${wpsMin}-${wpsMax}
  words (target ~${wpsTarget}). Conversational, no stage directions, no
  brackets, no emojis. This is the ONLY text used for subtitles.
- on_screen_text: a very short caption (0-6 words) burned onto the frame at
  key moments, or empty string if the scene should be visual-only.
- visual: 1-line description of what's on screen.
- image_prompt: a rich, self-contained prompt for an AI image model. It MUST
  include: "${data.styleLabel} style, ${ratio}, photorealistic, cinematic,
  premium commercial look, 8k, shallow depth of field". Write it in English
  only and NEVER include words for the image to show — no quoted lines, no
  captions, no signs, no on-screen text (captions are added later).
- duration: e.g. "3s" (integer seconds, 2-5s per scene).

Also produce:
- title, reel_title, style_note, caption (2-4 sentences), hashtags (8-15).
- length_sec: total seconds (MUST be ${Math.round(lenSec * 0.95)}-${lenSec}).

Return ONLY this JSON object shape with no prose:
{
  "title": "string",
  "reel_title": "string",
  "length_sec": ${lenSec},
  "style_note": "string",
  "scenes": [
    { "n": 1, "time_range": "0-3 sec", "role": "Hook", "voiceover": "string",
      "on_screen_text": "string", "visual": "string", "image_prompt": "string",
      "duration": "3s" }
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

    // Token budget scales with target word count so long scripts aren't
    // silently truncated. ~4 tokens per word covers JSON + prompts + overhead.
    const maxTokens = Math.min(60000, 4000 + Math.round(wTarget * 4));

    const rawResponses: string[] = [];
    const parseErrors: string[] = [];
    let usedRepair = false;
    let out: (z.infer<typeof Schema> & { debug_json?: AiJsonDebug }) | null = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      let raw = "";
      let receivedAiResponse = false;
      try {
        const upstream = await aiChatFetch({
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
            max_tokens: maxTokens,
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
    let usedFallback = false;
    if (out) {
      finalOut = out;
    } else {
      finalOut = buildFallbackVideoScript(data.topic, sceneCount, lenSec, ratio, data.styleLabel) as z.infer<typeof Schema> & { debug_json?: AiJsonDebug };
      parseErrors.push("Used fallback script after 3 invalid JSON attempts");
      usedFallback = true;
    }

    finalOut.scenes = finalOut.scenes.map((s, i) => ({ ...s, n: i + 1 }));

    // ---------------------------------------------------------------
    // EXTEND PASS — enforce word budget. If narration is short, ask the
    // AI for additional scenes and append. Up to 2 extend passes.
    // ---------------------------------------------------------------
    if (!usedFallback) {
      for (let ext = 0; ext < 2; ext++) {
        const have = totalVoiceoverWords(finalOut.scenes);
        if (have >= wMin) break;
        const need = Math.max(wMin - have, wpsTarget * 4);
        const addScenes = Math.max(4, Math.ceil(need / Math.max(1, wpsTarget)));
        const startN = finalOut.scenes.length + 1;
        const extendUser = `Continue the script below. It is currently only
${have} words but must total ${wMin}-${wMax} words to fill ${lenSec} seconds
of narration. Add ${addScenes} MORE scenes (numbered ${startN}..${startN + addScenes - 1})
that keep the same topic, tone and visual style, deepen the argument, and
add roughly ${need} more spoken words total. Aim for ${wpsMin}-${wpsMax}
words per scene (~${wpsTarget}). The LAST new scene should be the CTA.

TOPIC: ${data.topic}
TONE: ${data.tone}
VISUAL STYLE: ${data.styleLabel}

EXISTING SCENES (voiceover only, for continuity):
${finalOut.scenes.map((s) => `${s.n}. ${s.voiceover}`).join("\n")}

Return ONLY this JSON shape with no prose:
{ "scenes": [ { "n": ${startN}, "time_range": "", "role": "Beat", "voiceover": "...", "on_screen_text": "", "visual": "...", "image_prompt": "${data.styleLabel} style, ${ratio}, photorealistic, cinematic, premium commercial look, 8k, shallow depth of field. ...", "duration": "3s" } ] }`;
        const ExtSchema = z.object({ scenes: z.array(Schema.shape.scenes.element) });
        try {
          const upstream = await aiChatFetch({
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: sys },
                { role: "user", content: extendUser },
              ],
              response_format: { type: "json_object" },
              max_tokens: Math.min(60000, 2000 + Math.round(need * 6)),
            }),
          });
          if (!upstream.ok) break;
          const j = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const raw = j.choices?.[0]?.message?.content ?? "";
          const parsed = parseStructuredJsonResponse(raw);
          const checked = ExtSchema.safeParse(parsed.value);
          if (!checked.success || checked.data.scenes.length === 0) break;
          finalOut.scenes = [...finalOut.scenes, ...checked.data.scenes].map((s, i) => ({ ...s, n: i + 1 }));
        } catch (e) {
          parseErrors.push(`Extend pass ${ext + 1} failed: ${e instanceof Error ? e.message : String(e)}`);
          break;
        }
      }

      // Last-resort: if still short after AI extend passes, top up with
      // fallback scenes so the word budget is met no matter what.
      const have = totalVoiceoverWords(finalOut.scenes);
      if (have < wMin) {
        const missingWords = wMin - have;
        const extraScenes = Math.max(3, Math.ceil(missingWords / Math.max(1, wpsTarget)));
        const filler = buildFallbackVideoScript(data.topic, extraScenes, Math.ceil(missingWords / wordsPerSec), ratio, data.styleLabel);
        finalOut.scenes = [...finalOut.scenes, ...filler.scenes].map((s, i) => ({ ...s, n: i + 1 }));
        parseErrors.push(`Top-up: appended ${extraScenes} filler scenes to reach word budget`);
      }
    }

    // Scale per-scene base durations so the timeline sum matches the request.
    // Voice duration still wins in the renderer, but this keeps
    // scene.duration consistent with reality.
    if (finalOut.scenes.length > 0) {
      const parseSec = (d: string) => {
        const m = /([\d.]+)/.exec(d);
        const n = m ? parseFloat(m[1]) : 3;
        return Number.isFinite(n) && n > 0 ? n : 3;
      };
      // Rescale to the requested length with a ≥3s floor per scene (merging scenes that
      // can't get one) and rewrite time_range, which the blueprint reads first.
      finalOut.scenes = normalizeSceneTiming(finalOut.scenes, lenSec);
      finalOut.length_sec = finalOut.scenes.reduce((a, s) => a + parseSec(s.duration), 0);

      // SHORTEN PASS — any line longer than its scene can hold gets rewritten
      // to fit (in the same language). Lines that still don't fit are left for
      // the blueprint review, which blocks approval until they're fixed.
      if (!usedFallback) {
        const tooLong = finalOut.scenes
          .map((s) => ({ n: s.n, text: s.voiceover, maxWords: maxWordsForScene(parseSec(s.duration), narrationLang) }))
          .filter((l) => countWords(l.text) > l.maxWords);
        if (tooLong.length) {
          try {
            const { shortenLinesWithAi } = await import("@/lib/voiceover-fit.server");
            const fixed = await shortenLinesWithAi(key, tooLong, narrationLang);
            finalOut.scenes = finalOut.scenes.map((s) => (fixed.has(s.n) ? { ...s, voiceover: fixed.get(s.n)! } : s));
            if (fixed.size < tooLong.length) parseErrors.push(`Shorten pass: ${tooLong.length - fixed.size} line(s) still over their scene's word budget`);
          } catch (e) {
            parseErrors.push(`Shorten pass failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }
    }

    if (rawResponses.length > 0 || parseErrors.length > 0) {
      finalOut.debug_json = {
        raw_responses: rawResponses.filter(Boolean),
        parse_errors: parseErrors,
        attempts: Math.min(3, Math.max(1, parseErrors.length)),
        used_repair: usedRepair,
        used_fallback: usedFallback || parseErrors.some((e) => e.includes("Used fallback")),
      };
    }

    console.info(
      `[ScriptAgent] requested=${lenSec}s words=${totalVoiceoverWords(finalOut.scenes)}/${wMin}-${wMax} scenes=${finalOut.scenes.length}/${sMin}-${sMax}`
    );

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
  .middleware([requireSupabaseAuth, chargeMiddleware("video_scenes_plan")])
  .inputValidator((v: unknown) => FromScriptInput.parse(v))
  .handler(async ({ data }): Promise<ScenesFromScript> => {
    const key = aiKey();
    if (!key) throw new Error(AI_NOT_CONFIGURED);

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
  Describe subject, setting, lighting, framing, in English only. NEVER include words for the image to show (no quoted lines, captions, signs or on-screen text).
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
        const upstream = await aiChatFetch({
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

    // Same ≥3s-per-scene timing as generated scripts.
    const scenes = normalizeSceneTiming(finalOut.scenes.map((s, i) => ({ ...s, n: i + 1 })), lenSec);

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
  .middleware([requireSupabaseAuth, chargeMiddleware("video_seo")])
  .inputValidator((v: unknown) => SeoInput.parse(v))
  .handler(async ({ data }): Promise<AiVideoSeo> => {
    const key = aiKey();
    if (!key) throw new Error(AI_NOT_CONFIGURED);

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
        const upstream = await aiChatFetch({
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


// ============================================================================
// Title Optimizer / Hook / Chapter agents — added per pipeline expansion.
// Each is a small, focused AI call that runs BEFORE (title/hook) or AFTER
// (chapter) the main Script Agent so the pipeline reads:
//   Research → Title → Hook → Intro → Curiosity → Script → Retention → Chapter → Storyboard
// Intro / Curiosity / Retention rewriting is baked into the Script Agent
// prompt (Hybrid mode) instead of separate calls; only the annotation part
// of Retention runs as its own step (see RetentionAgent in video-agents.ts).
// ============================================================================

async function callGateway(key: string, sys: string, user: string, maxTokens = 2000): Promise<unknown | null> {
  try {
    const upstream = await aiChatFetch({
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
      }),
    });
    if (!upstream.ok) return null;
    const j = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = j.choices?.[0]?.message?.content ?? "";
    return parseStructuredJsonResponse(raw).value;
  } catch (e) {
    console.error("[Gateway call]", e);
    return null;
  }
}

// ---------------- Title Optimizer ----------------

const TitleInput = z.object({
  topic: z.string().min(1),
  styleLabel: z.string().optional().default("Cinematic"),
  platform: z.string().optional().default("youtube"),
});

export type VideoTitleVariants = {
  recommended: string;
  variants: Array<{ title: string; angle: string; ctr_score: number }>;
};

export const generateVideoTitleVariants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, chargeMiddleware("video_title_variants")])
  .inputValidator((v: unknown) => TitleInput.parse(v))
  .handler(async ({ data }): Promise<VideoTitleVariants> => {
    const key = aiKey();
    if (!key) throw new Error(AI_NOT_CONFIGURED);

    const sys = `You are a YouTube CTR strategist. You write video titles that
maximize click-through without lying. Return ONLY valid JSON — no prose, no code fences.`;
    const user = `TOPIC: ${data.topic}
PLATFORM: ${data.platform}
STYLE: ${data.styleLabel}

Generate 5 title variants using different proven angles:
1. Curiosity gap ("The thing nobody tells you about X")
2. Contrarian / pattern interrupt ("Why X is wrong")
3. Numbered specificity ("7 signs of X")
4. Stakes / consequence ("What happens when X breaks")
5. Bold declarative statement

Each title MUST:
- Be <= 65 characters (YouTube truncation limit).
- Include the topic keyword.
- Have NO clickbait lies, NO ALL CAPS, NO emoji.
- Score 1-10 on likely CTR (10 = strongest hook).

Pick the single strongest as "recommended".

Return ONLY:
{ "recommended": "string", "variants": [{ "title": "string", "angle": "string", "ctr_score": 8 }] }`;

    const Schema = z.object({
      recommended: z.string(),
      variants: z.array(z.object({ title: z.string(), angle: z.string(), ctr_score: z.number() })),
    });

    const parsed = await callGateway(key, sys, user, 1500);
    const checked = parsed ? Schema.safeParse(parsed) : null;
    if (checked && checked.success && checked.data.variants.length > 0) {
      return checked.data;
    }

    // Fallback — deterministic variants so pipeline never blocks.
    const t = data.topic;
    const variants = [
      { title: `The Truth About ${t}`.slice(0, 65), angle: "Curiosity gap", ctr_score: 7 },
      { title: `Why ${t} Is Not What You Think`.slice(0, 65), angle: "Contrarian", ctr_score: 7 },
      { title: `5 Things Nobody Tells You About ${t}`.slice(0, 65), angle: "Numbered", ctr_score: 8 },
      { title: `What Happens When ${t} Breaks`.slice(0, 65), angle: "Stakes", ctr_score: 6 },
      { title: `${t}: The Story Behind It`.slice(0, 65), angle: "Declarative", ctr_score: 6 },
    ];
    return { recommended: variants[2].title, variants };
  });

// ---------------- Hook Agent ----------------

const HookInput = z.object({
  topic: z.string().min(1),
  styleLabel: z.string().optional().default("Cinematic"),
  platform: z.string().optional().default("youtube"),
  currentHook: z.string().optional().default(""),
});

export type VideoHook = {
  voiceover: string;
  on_screen_text: string;
  visual: string;
  rationale: string;
};

export const generateVideoHook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, chargeMiddleware("video_hook")])
  .inputValidator((v: unknown) => HookInput.parse(v))
  .handler(async ({ data }): Promise<VideoHook> => {
    const key = aiKey();
    if (!key) throw new Error(AI_NOT_CONFIGURED);

    const sys = `You are a YouTube retention expert. You write 3-second video
hooks (opening lines) that stop the scroll. Return ONLY valid JSON.`;
    const user = `TOPIC: ${data.topic}
STYLE: ${data.styleLabel}
PLATFORM: ${data.platform}
${data.currentHook ? `CURRENT HOOK: ${data.currentHook}` : ""}

Write ONE opening hook (the first 3 seconds of the video) that:
- Uses ONE of: shocking statement, unexpected question, bold contrarian claim, or vivid mini-story.
- Is 8-14 spoken words (must fit in ~3 seconds at ~2.5 words/second).
- Does NOT include the word "welcome", "hey guys", "in this video", "today we".
- Immediately promises a payoff without giving it away.

Also provide:
- on_screen_text: 0-4 words burned onto the frame (bold reveal, big number, punch line, or "").
- visual: 1-line description of the opening shot.
- rationale: 1 sentence explaining why this hook works.

Return ONLY:
{ "voiceover": "string", "on_screen_text": "string", "visual": "string", "rationale": "string" }`;

    const Schema = z.object({
      voiceover: z.string(),
      on_screen_text: z.string().optional().default(""),
      visual: z.string().optional().default(""),
      rationale: z.string().optional().default(""),
    });

    const parsed = await callGateway(key, sys, user, 800);
    const checked = parsed ? Schema.safeParse(parsed) : null;
    if (checked && checked.success && checked.data.voiceover.trim().length > 0) {
      return checked.data as VideoHook;
    }

    return {
      voiceover: `What if everything you knew about ${data.topic} was wrong?`,
      on_screen_text: "",
      visual: `${data.styleLabel} cinematic opening shot on ${data.topic}, dramatic lighting.`,
      rationale: "Contrarian curiosity gap that promises a payoff.",
    };
  });

// ---------------- Chapter Agent ----------------

const ChapterInput = z.object({
  topic: z.string().min(1),
  scenes: z.array(z.object({
    voiceover: z.string().optional().default(""),
    duration_sec: z.number().optional().default(3),
  })),
});

export type VideoChapters = {
  chapters: Array<{ time: string; label: string; description: string }>;
};

export const generateVideoChapters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, chargeMiddleware("video_chapters")])
  .inputValidator((v: unknown) => ChapterInput.parse(v))
  .handler(async ({ data }): Promise<VideoChapters> => {
    const key = aiKey();
    if (!key) throw new Error(AI_NOT_CONFIGURED);

    // Build cumulative timing hints so the model can align chapters to real scene starts.
    const cumulative: Array<{ time: string; hint: string; sec: number }> = [];
    let t = 0;
    for (const s of data.scenes) {
      const mm = Math.floor(t / 60).toString().padStart(2, "0");
      const ss = Math.floor(t % 60).toString().padStart(2, "0");
      cumulative.push({ time: `${mm}:${ss}`, hint: (s.voiceover || "").slice(0, 100), sec: t });
      t += Math.max(1, s.duration_sec || 3);
    }
    const totalSec = t;

    const totalMin = Math.max(1, Math.round(totalSec / 60));
    const targetChapters = Math.max(3, Math.min(10, totalMin + 1));

    const sys = `You are a YouTube chapter strategist. You group scenes into
watchable chapters that describe the video's arc. Return ONLY valid JSON.`;
    const user = `TOPIC: ${data.topic}
Total duration: ${totalSec}s (~${totalMin} min).
Scene timing hints (mm:ss — voiceover snippet):
${cumulative.map((c) => `- ${c.time} — ${c.hint}`).join("\n")}

Group these scenes into ${targetChapters} chapters that cover the whole video.
Each chapter starts at the mm:ss of the scene that opens it (the FIRST chapter MUST be 00:00).
Chapters must be strictly increasing in time. No two chapters share the same start time.

Each chapter needs:
- time: "mm:ss"
- label: 2-5 word chapter title, no punctuation, title case
- description: 1 short sentence describing what the viewer sees in this chapter

Return ONLY:
{ "chapters": [{ "time": "00:00", "label": "The Hook", "description": "..." }] }`;

    const Schema = z.object({
      chapters: z.array(z.object({
        time: z.string(),
        label: z.string(),
        description: z.string().optional().default(""),
      })),
    });

    const parsed = await callGateway(key, sys, user, 2000);
    const checked = parsed ? Schema.safeParse(parsed) : null;
    if (checked && checked.success && checked.data.chapters.length > 0) {
      const chapters = checked.data.chapters
        .map((c) => ({ time: c.time, label: c.label, description: c.description }))
        .sort((a, b) => timeToSec(a.time) - timeToSec(b.time));
      if (chapters[0]) chapters[0].time = "00:00";
      return { chapters };
    }

    // Fallback — evenly space chapters.
    const step = Math.max(1, Math.floor(cumulative.length / targetChapters));
    const labels = ["Intro", "The Setup", "The Shift", "The Evidence", "The Twist", "What It Means", "The Payoff", "Wrap-Up"];
    const chapters: Array<{ time: string; label: string; description: string }> = [];
    for (let i = 0; i < cumulative.length && chapters.length < targetChapters; i += step) {
      chapters.push({
        time: cumulative[i].time,
        label: labels[Math.min(chapters.length, labels.length - 1)],
        description: cumulative[i].hint.slice(0, 100),
      });
    }
    if (chapters[0]) chapters[0].time = "00:00";
    return { chapters };
  });

function timeToSec(t: string): number {
  const parts = t.split(":").map((n) => parseInt(n, 10) || 0);
  return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
}


/** Blueprint review → "Auto-shorten long lines". Rewrites lines to fit their scene, same language. */
export const shortenVoiceoverLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    language: z.string().max(40).default("English"),
    lines: z.array(z.object({ n: z.number().int(), text: z.string().max(2000), maxWords: z.number().int().min(1).max(200) })).min(1).max(120),
  }).parse(v))
  .handler(async ({ data }) => {
    const key = aiKey();
    if (!key) throw new Error(AI_NOT_CONFIGURED);
    const { shortenLinesWithAi } = await import("@/lib/voiceover-fit.server");
    const trimmed = new Set<number>();
    const fixed = await shortenLinesWithAi(key, data.lines, data.language, 3, trimmed);
    return { lines: [...fixed.entries()].map(([n, text]) => ({ n, text })), trimmed: [...trimmed] };
  });


// ---------------------------------------------------------------------------
// Script → Video. The creator's own script is split into scenes in code
// (src/lib/script-to-video.ts) so every word is kept; the AI only adds the
// visuals, short captions, and the title / caption / hashtags.
// ---------------------------------------------------------------------------

const ScriptToVideoInput = z.object({
  lines: z.array(z.string().min(1).max(1200)).min(1).max(120),
  language: z.string().max(40).default("English"),
  styleLabel: z.string().max(60).default("Cinematic"),
  contentType: z.string().max(40).default("short_reel"),
  aspectRatio: z.string().max(10).default("9:16"),
  niche: z.string().max(200).optional().default(""),
});

export const planScriptToVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, chargeMiddleware("video_scenes_plan")])
  .inputValidator((v: unknown) => ScriptToVideoInput.parse(v))
  .handler(async ({ data }): Promise<AiVideoScript> => {
    const { lineSeconds } = await import("@/lib/script-to-video");
    const { gatewayChatJson } = await import("@/lib/ai-gateway.server");
    type Planned = {
      title?: string; reel_title?: string; style_note?: string; caption?: string; hashtags?: string[];
      scenes?: Array<{ n?: number; role?: string; on_screen_text?: string; visual?: string; image_prompt?: string }>;
    };
    const numbered = data.lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
    let planned: Planned = {};
    try {
      planned = await gatewayChatJson<Planned>({
        messages: [
          {
            role: "system",
            content: "You are a senior short-form video creative director. You plan visuals for a script the creator already wrote. You NEVER rewrite, translate or reorder the script. Return ONLY valid JSON.",
          },
          {
            role: "user",
            content: `The creator's script, already split into ${data.lines.length} numbered scenes (language: ${data.language}):
"""
${numbered}
"""
${data.niche ? `NICHE: ${data.niche}\n` : ""}VISUAL STYLE: ${data.styleLabel}
FORMAT: ${data.contentType} (${data.aspectRatio})

Return JSON:
{
  "title": "video title in ${data.language}, max 70 chars, based on the script",
  "reel_title": "short title for the cover, max 40 chars, in ${data.language}",
  "style_note": "one line describing the visual look shared by every scene",
  "caption": "social caption in ${data.language}, 2-3 lines",
  "hashtags": ["8-12 relevant hashtags"],
  "scenes": [
    {
      "n": 1,
      "role": "Hook | Beat | CTA",
      "on_screen_text": "0-6 word caption taken from that scene's own words (same language), or an empty string",
      "visual": "one line in English: what is on screen",
      "image_prompt": "rich English prompt for an AI image model showing exactly what this scene's line talks about. Include: ${data.styleLabel} style, ${data.aspectRatio}, cinematic lighting, sharp detail. Same characters and look across scenes. NEVER put words, letters, captions or signs in the image."
    }
  ]
}
Give exactly ${data.lines.length} scenes, one per numbered line, in the same order.`,
          },
        ],
        temperature: 0.6,
        maxTokens: Math.min(8000, 900 + data.lines.length * 220),
      });
    } catch (e) {
      console.warn("[script-to-video] visual planning failed, using simple prompts", e);
    }

    const ai = Array.isArray(planned.scenes) ? planned.scenes : [];
    let t = 0;
    const scenes: AiVideoScene[] = data.lines.map((line, i) => {
      const p = ai.find((s) => Number(s?.n) === i + 1) ?? ai[i] ?? {};
      const sec = Math.round(lineSeconds(line, data.language) * 10) / 10;
      const start = t;
      t += sec;
      return {
        n: i + 1,
        time_range: `${Math.round(start)}-${Math.round(t)} sec`,
        role: String(p.role || (i === 0 ? "Hook" : i === data.lines.length - 1 ? "CTA" : `Beat ${i}`)),
        // The creator's exact words — never the AI's.
        voiceover: line,
        on_screen_text: String(p.on_screen_text ?? "").slice(0, 60),
        visual: String(p.visual || line).slice(0, 300),
        image_prompt: String(
          p.image_prompt ||
            `${data.styleLabel} style, ${data.aspectRatio}, cinematic lighting, sharp detail. A scene that shows: ${line}. No text in the image.`,
        ),
        duration: `${sec}s`,
      };
    });
    const first = data.lines[0] ?? "";
    return {
      title: String(planned.title || first).slice(0, 100),
      reel_title: String(planned.reel_title || first).slice(0, 60),
      length_sec: Math.round(t),
      style_note: String(planned.style_note || `${data.styleLabel} look, consistent across scenes`),
      scenes,
      caption: String(planned.caption || ""),
      hashtags: Array.isArray(planned.hashtags) ? planned.hashtags.map(String).slice(0, 15) : [],
    };
  });

const RewriteInput = z.object({
  script: z.string().min(1).max(5000),
  goal: z.enum(["hook", "tighter", "emotional", "simpler", "fit"]),
  targetSec: z.number().int().min(15).max(600).optional(),
  language: z.string().max(40).default("English"),
});

const GOAL_TEXT: Record<z.infer<typeof RewriteInput>["goal"], string> = {
  hook: "Make the opening line a much stronger hook that stops the scroll in the first 3 seconds. Keep the rest close to the original, only smoothing the flow.",
  tighter: "Make it shorter and tighter: remove filler and repetition, keep every real point and the ending call-to-action.",
  emotional: "Make it warmer and more emotional so viewers feel it, without exaggerating facts.",
  simpler: "Use simpler, everyday words so anyone can follow it easily.",
  fit: "Adjust the length to fit the target duration, keeping the main points and the ending call-to-action.",
};

/** Optional AI rewrite of a creator's script. Returns a suggestion; nothing is applied automatically. */
export const rewriteScriptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, chargeMiddleware("script_rewrite")])
  .inputValidator((v: unknown) => RewriteInput.parse(v))
  .handler(async ({ data }): Promise<{ script: string }> => {
    const { gatewayChatJson } = await import("@/lib/ai-gateway.server");
    const { speechWordsPerSecond } = await import("@/lib/video-duration");
    const words = data.targetSec ? Math.round(data.targetSec * speechWordsPerSecond(data.language)) : null;
    const out = await gatewayChatJson<{ script?: string }>({
      messages: [
        {
          role: "system",
          content: "You are an expert short-video scriptwriter. You improve a creator's script while keeping their voice. Return ONLY valid JSON.",
        },
        {
          role: "user",
          content: `Rewrite this video script.
GOAL: ${GOAL_TEXT[data.goal]}${words ? `\nTARGET: about ${data.targetSec} seconds when spoken (~${words} words).` : ""}
RULES:
- Same language and the same mix of languages as the original (${data.language}). If it mixes English words into ${data.language}, keep that natural mix. Do not translate it.
- Keep names, brand names and channel names exactly as written (e.g. channel names in capitals).
- Keep the meaning and facts; do not invent statistics or claims.
- One spoken line per line (separate lines with newlines), no stage directions, no emojis, no hashtags.

ORIGINAL SCRIPT:
"""
${data.script}
"""

Return JSON: { "script": "the rewritten script" }`,
        },
      ],
      temperature: 0.7,
      maxTokens: 3000,
    });
    const script = String(out?.script ?? "").trim();
    if (!script) throw new Error("The AI didn't return a rewrite. Please try again — your credit was refunded.");
    return { script: script.slice(0, 5000) };
  });
