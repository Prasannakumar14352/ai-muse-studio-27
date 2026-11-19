import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chargeMiddleware } from "@/lib/credits-guard.server";

export type RepurposeFormat =
  | "shorts" | "reels" | "tiktok" | "linkedin" | "ig_carousel"
  | "fb_post" | "blog" | "newsletter" | "podcast_transcript" | "x_thread";

export const REPURPOSE_FORMATS: { id: RepurposeFormat; label: string }[] = [
  { id: "shorts", label: "YouTube Shorts" },
  { id: "reels", label: "Instagram Reels" },
  { id: "tiktok", label: "TikTok" },
  { id: "linkedin", label: "LinkedIn Post" },
  { id: "ig_carousel", label: "Instagram Carousel" },
  { id: "fb_post", label: "Facebook Post" },
  { id: "blog", label: "Blog Article" },
  { id: "newsletter", label: "Newsletter" },
  { id: "podcast_transcript", label: "Podcast Transcript" },
  { id: "x_thread", label: "X Thread" },
];

const FORMAT_PROMPTS: Record<RepurposeFormat, string> = {
  shorts: "Rewrite as a 45-second YouTube Shorts script: hook + 3 beats + CTA. Include on-screen text cues.",
  reels: "Instagram Reels script under 30s with strong hook, quick pacing, and caption text.",
  tiktok: "TikTok script under 30s. Use trend-style hook and a punchy CTA.",
  linkedin: "LinkedIn post: 150-200 words, professional, story-driven, ends with question.",
  ig_carousel: "Instagram carousel: 8 slides. For each: {slide, headline, body(<=25 words)}. Include a CTA slide.",
  fb_post: "Facebook post ~120 words, conversational, one clear CTA.",
  blog: "1200-word SEO blog article with H1, intro, 5 H2 sections, conclusion, and meta description.",
  newsletter: "Email newsletter: subject line, 300-500 word body, single CTA.",
  podcast_transcript: "Podcast transcript / show notes: intro, 3 chapters with timestamps, outro.",
  x_thread: "X (Twitter) thread of 8 tweets, each <280 chars, tweet 1 = hook.",
};

export const repurposeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, chargeMiddleware("repurpose")])
  .inputValidator((i: { sourceProjectId?: string | null; source: string; formats: RepurposeFormat[] }) => {
    if (!i.source?.trim()) throw new Error("source content required");
    if (!i.formats?.length) throw new Error("select at least one format");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { gatewayChatText } = await import("@/lib/ai-gateway.server");
    const results: Array<{ id: string; format: RepurposeFormat; content: string }> = [];
    for (const fmt of data.formats) {
      const promptSuffix = FORMAT_PROMPTS[fmt];
      const text = await gatewayChatText({
        messages: [
          { role: "system", content: "You are a multi-format content repurposing engine. Preserve the core message and adapt it to the platform's norms. Output ONLY the finished content, ready to paste: no preface or sign-off (never start with \"Here are…\" / \"Sure\"), and plain text only — no markdown symbols like #, ##, *, ** or backticks. Use line breaks, numbered lines or emoji for structure instead." },
          { role: "user", content: `${promptSuffix}\n\nSource content:\n${data.source.slice(0, 8000)}` },
        ],
        temperature: 0.7,
        maxTokens: 2500,
      }).then(cleanPasteReady);
      const { data: row, error } = await context.supabase
        .from("repurposed_assets" as never)
        .insert({
          user_id: context.userId,
          source_project_id: data.sourceProjectId ?? null,
          format: fmt,
          content: { text },
          status: "ready",
        } as never)
        .select()
        .single();
      if (error) throw new Error(error.message);
      const r = row as unknown as { id: string };
      results.push({ id: r.id, format: fmt, content: text });
    }
    return { results };
  });

export const listRepurposedFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("repurposed_assets" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Array<{
      id: string; format: RepurposeFormat; content: { text?: string }; created_at: string;
    }>;
  });

/** Strip chatty prefaces and markdown so the text pastes cleanly into LinkedIn, X, etc. */
export function cleanPasteReady(raw: string): string {
  let t = (raw ?? "").replace(/\r/g, "").trim();
  // Drop a leading "Here are/is…", "Sure…", "Certainly…" line.
  t = t.replace(/^(?:sure|certainly|absolutely|of course|okay|here(?:'s| is| are)\b)[^\n]*\n+/i, "");
  t = t
    .replace(/^```[a-z]*\n?|```$/gim, "")
    .replace(/^#{1,6}\s+/gm, "")            // headings
    .replace(/\*\*(.+?)\*\*/g, "$1")         // bold
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*(?!\*)/g, "$1$2") // italics
    .replace(/^\s*[-*]\s+/gm, "• ")           // bullets → •
    .replace(/^-{3,}$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
  return t.trim();
}
