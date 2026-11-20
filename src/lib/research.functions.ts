import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chargeMiddleware } from "@/lib/credits-guard.server";

// ---------- Types ----------

export type ScoreKey =
  | "demand"
  | "momentum"
  | "competition"     // lower is better
  | "gap"
  | "ctr"
  | "retention"
  | "evergreen"
  | "monetization"
  | "audienceFit"
  | "difficulty";     // lower is better

export type ScoreCard = {
  key: ScoreKey;
  label: string;
  score: number; // 0-100
  lowerIsBetter?: boolean;
  reason: string;
};

export type TrendDirection = "exploding" | "rising" | "stable" | "seasonal" | "declining";

export type ViralAnalysis = {
  score: number; // 0-100
  recommendation:
    | "create_now"
    | "high_potential"
    | "needs_angle"
    | "risky"
    | "avoid";
  confidence: "low" | "medium" | "high";
  verdict: string;             // plain-english headline
  reasons: string[];           // why this recommendation
  risks: string[];
  improvements: string[];      // what to change before publishing
};

export type ActionableOutputs = {
  bestAngle: string;
  contentGap: string;
  titles: string[];            // 10
  hooks: string[];             // 5
  thumbnailConcepts: string[]; // 3-5 descriptions
  thumbnailText: string;
  suggestedFormat: string;     // e.g. "8-12 min explainer"
  suggestedDuration: string;
  bestPlatform: string;
  urgency: "today" | "24h" | "this_week" | "evergreen";
  cta: string;
  keywords: string[];
  hashtags: string[];
};

export type SimilarContent = {
  title: string;
  platform: string;
  creator: string;
  metric?: string;   // "1.2M views" or "20K likes"
  publishedAt?: string;
  length?: string;
  whyItWorked: string;
  url?: string;
  language?: string;
};

export type ResearchInputs = {
  topic: string;
  platform?: string;
  country?: string;
  audience?: string;
  niche?: string;
  channelSize?: "new" | "small" | "growing" | "established";
  contentFormat?: string;
  competitorUrl?: string;
};

export type ResearchFindings = {
  // -------- Legacy fields (kept for backwards compat with older reports) --------
  trendingTopics?: string[];
  keywords?: { term: string; intent: string; volume?: string; difficulty?: string }[];
  faqs?: string[];
  competitors?: { name: string; angle: string; strength?: string; weakness?: string }[];
  contentGaps?: string[];
  searchIntent?: string;
  audiencePains?: string[];
  suggestedHooks?: string[];
  googleTrends?: {
    risingQueries: { term: string; growth: string }[];
    relatedTopics: string[];
    seasonality: string;
  };
  redditDiscussions?: {
    subreddit: string; title: string; insight: string;
    sentiment: "positive" | "negative" | "mixed" | "curious";
  }[];
  youtubeSearches?: {
    query: string; topVideoAngle: string; estViews: string; contentGap: string;
  }[];

  // -------- Viral Research Engine (v2) --------
  inputs?: ResearchInputs;
  evidenceMode?: "live" | "ai_estimate" | "mixed";
  generatedAt?: string;
  viralAnalysis?: ViralAnalysis;
  scoreBreakdown?: ScoreCard[];
  trendDirection?: { direction: TrendDirection; note: string };
  actionable?: ActionableOutputs;
  similarContent?: SimilarContent[]; // AI estimates only unless live sources connected
  disclaimers?: string[];
};

// ---------- Helpers ----------

export function recommendationLabel(r: ViralAnalysis["recommendation"]): string {
  switch (r) {
    case "create_now": return "Create immediately";
    case "high_potential": return "High potential";
    case "needs_angle": return "Good — needs a stronger angle";
    case "risky": return "Risky";
    case "avoid": return "Avoid for now";
  }
}

export function recommendationFromScore(score: number): ViralAnalysis["recommendation"] {
  if (score >= 85) return "create_now";
  if (score >= 70) return "high_potential";
  if (score >= 55) return "needs_angle";
  if (score >= 40) return "risky";
  return "avoid";
}

// ---------- Server functions ----------

export const runResearchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, chargeMiddleware("research")])
  .inputValidator((i: ResearchInputs & { projectId?: string | null }) => i)
  .handler(async ({ data, context }) => {
    const { gatewayChatJson } = await import("@/lib/ai-gateway.server");
    const { fetchLiveYouTube, fmtViews, fmtDuration } = await import("@/lib/youtube-research.server");

    const inputs: ResearchInputs = {
      topic: data.topic,
      platform: data.platform,
      country: data.country,
      audience: data.audience,
      niche: data.niche,
      channelSize: data.channelSize,
      contentFormat: data.contentFormat,
      competitorUrl: data.competitorUrl,
    };

    const live = await fetchLiveYouTube(data.topic, data.country);
    const liveBlock = live && live.length
      ? `\n\nLIVE YOUTUBE DATA (real, from the YouTube Data API — top videos on this topic in the last 6 months, by views):\n${live
          .slice(0, 10)
          .map((v, i) => `${i + 1}. "${v.title}" — ${v.creator} — ${fmtViews(v.views)}, ${v.likes} likes, ${v.comments} comments, ${fmtDuration(v.durationSec)}, published ${v.publishedAt}`)
          .join("\n")}\nUse this real data to judge demand, competition and momentum. Base "youtubeSearches" on it.`
      : "";

    const prompt = `You are a viral content research analyst. Assess whether a creator should make content about the topic below and return ONE JSON object.

Topic: ${inputs.topic}
Platform: ${inputs.platform ?? "any"}
Country / Market: ${inputs.country ?? "global"}
Target audience: ${inputs.audience ?? "general"}
Niche: ${inputs.niche ?? "general"}
Channel size: ${inputs.channelSize ?? "unspecified"}
Content format: ${inputs.contentFormat ?? "unspecified"}
Competitor URL: ${inputs.competitorUrl ?? "none"}${liveBlock}

IMPORTANT DATA-INTEGRITY RULES:
- ${live && live.length ? "You DO have the live YouTube data above, but NOT Google Trends or TikTok." : "You do NOT have live access to Google Trends, YouTube API, or TikTok."} All numeric estimates are AI strategic estimates based on well-known patterns.
- DO NOT invent specific view counts, creator names, channel IDs, or dates unless they are widely and reliably known. When unsure, leave optional fields blank.
- For "similarContent", produce at most 4 entries and only include a metric/date when you are highly confident.

Return EXACTLY this JSON shape (no prose, no markdown):

{
  "viralAnalysis": {
    "score": number 0-100,
    "recommendation": "create_now" | "high_potential" | "needs_angle" | "risky" | "avoid",
    "confidence": "low" | "medium" | "high",
    "verdict": string (1-2 plain sentences),
    "reasons": string[] (3-5),
    "risks": string[] (2-4),
    "improvements": string[] (3-5)
  },
  "scoreBreakdown": [
    { "key": "demand",       "label": "Search / audience demand", "score": 0-100, "reason": string },
    { "key": "momentum",     "label": "Trend momentum",           "score": 0-100, "reason": string },
    { "key": "competition",  "label": "Competition level",        "score": 0-100, "lowerIsBetter": true, "reason": string },
    { "key": "gap",          "label": "Content gap opportunity",  "score": 0-100, "reason": string },
    { "key": "ctr",          "label": "Click-through potential",  "score": 0-100, "reason": string },
    { "key": "retention",    "label": "Retention potential",      "score": 0-100, "reason": string },
    { "key": "evergreen",    "label": "Evergreen value",          "score": 0-100, "reason": string },
    { "key": "monetization", "label": "Monetization potential",   "score": 0-100, "reason": string },
    { "key": "audienceFit",  "label": "Audience fit",             "score": 0-100, "reason": string },
    { "key": "difficulty",   "label": "Production difficulty",    "score": 0-100, "lowerIsBetter": true, "reason": string }
  ],
  "trendDirection": {
    "direction": "exploding" | "rising" | "stable" | "seasonal" | "declining",
    "note": string (1 sentence)
  },
  "actionable": {
    "bestAngle": string,
    "contentGap": string,
    "titles": string[] (exactly 10, punchy, platform-appropriate),
    "hooks": string[] (exactly 5, first 3 seconds),
    "thumbnailConcepts": string[] (3-5 short visual descriptions),
    "thumbnailText": string (max 4 words),
    "suggestedFormat": string,
    "suggestedDuration": string,
    "bestPlatform": string,
    "urgency": "today" | "24h" | "this_week" | "evergreen",
    "cta": string,
    "keywords": string[] (6-12),
    "hashtags": string[] (5-10, include #)
  },
  "similarContent": [
    { "title": string, "platform": string, "creator": string, "metric": string?, "publishedAt": string?, "length": string?, "whyItWorked": string }
  ],
  "googleTrends": {
    "risingQueries": [ { "term": string, "growth": string } ] (4-6),
    "relatedTopics": string[] (4-8),
    "seasonality": string
  },
  "redditDiscussions": [ { "subreddit": string, "title": string, "insight": string, "sentiment": "positive"|"negative"|"mixed"|"curious" } ] (3-6),
  "youtubeSearches": [ { "query": string, "topVideoAngle": string, "estViews": string, "contentGap": string } ] (3-6),
  "keywords": [ { "term": string, "intent": string, "volume": "Low"|"Medium"|"High"|"Very High", "difficulty": "Easy"|"Medium"|"Hard" } ] (6-12),
  "contentGaps": string[] (3-6),
  "audiencePains": string[] (3-6),
  "disclaimers": string[] (short notes about anything you were unsure about)
}`;

    const ai = await gatewayChatJson<ResearchFindings>({
      messages: [
        { role: "system", content: "You are a viral content research analyst. Return ONLY a valid JSON object. Never fabricate specific view counts, dates, or channel names — leave those fields blank when unsure." },
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
      maxTokens: 8000,
    });

    // Guarantee recommendation aligns with score if AI drifted.
    if (ai.viralAnalysis && typeof ai.viralAnalysis.score === "number") {
      const clamped = Math.max(0, Math.min(100, Math.round(ai.viralAnalysis.score)));
      ai.viralAnalysis.score = clamped;
      ai.viralAnalysis.recommendation = recommendationFromScore(clamped);
    }

    const hasLive = !!(live && live.length);
    if (hasLive) {
      // Replace AI-guessed examples with the real top videos.
      ai.similarContent = live!.slice(0, 6).map((v) => ({
        title: v.title,
        platform: "YouTube",
        creator: v.creator,
        metric: fmtViews(v.views),
        publishedAt: v.publishedAt,
        length: fmtDuration(v.durationSec),
        whyItWorked: `${v.likes.toLocaleString()} likes · ${v.comments.toLocaleString()} comments`,
        url: v.url,
        language: v.language,
      })) as ResearchFindings["similarContent"];
    }
    const findings: ResearchFindings = {
      ...ai,
      inputs,
      evidenceMode: hasLive ? "mixed" : "ai_estimate",
      generatedAt: new Date().toISOString(),
      disclaimers: [
        hasLive
          ? "Similar videos are live YouTube data. Scores, Google Trends, Reddit and keyword volumes are AI estimates."
          : "All metrics are AI strategic estimates — live Google Trends, YouTube, and TikTok data are not connected.",
        // The model's own "unsure about" notes are working notes, not user copy — not shown.
      ],
    };

    const { data: row, error } = await context.supabase
      .from("research_reports" as never)
      .insert({
        user_id: context.userId,
        project_id: data.projectId ?? null,
        topic: data.topic,
        niche: data.niche ?? null,
        platform: data.platform ?? null,
        findings,
        sources: hasLive ? ["youtube_data_api:v3", "ai_estimate:v2"] : ["ai_estimate:v2"],
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);

    if (data.projectId) {
      await context.supabase.from("project_memory" as never).insert({
        user_id: context.userId,
        project_id: data.projectId,
        kind: "research",
        payload: findings,
      } as never);
    }
    return row as unknown as { id: string; findings: ResearchFindings };
  });

export const listResearchFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("research_reports" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Array<{
      id: string; topic: string; niche: string | null; platform: string | null;
      findings: ResearchFindings; created_at: string;
    }>;
  });

export const deleteResearchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("research_reports" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
