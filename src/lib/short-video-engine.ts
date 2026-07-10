// Short Video Engine — universal generation framework for reels/shorts.
// Pure logic; no I/O. Consumed by video-agents and the publish-kit server fn.

export type Platform = "instagram" | "tiktok" | "youtube_shorts" | "facebook" | "linkedin" | "pinterest";

export type TopicBucket =
  | "ai" | "technology" | "business" | "finance" | "motivation" | "productivity"
  | "health" | "psychology" | "parenting" | "education" | "kids" | "documentary"
  | "history" | "science" | "digital_products" | "marketing" | "travel"
  | "lifestyle" | "self_improvement" | "news" | "entertainment" | "storytelling"
  | "product_promotion" | "brand_awareness" | "generic";

export type StoryStructure =
  | "problem_discovery_solution_transformation"
  | "question_curiosity_reveal"
  | "myth_truth"
  | "before_after"
  | "mistake_better_way"
  | "story_lesson"
  | "emotional_journey"
  | "documentary_narrative"
  | "product_pain_solution"
  | "educational_breakdown"
  | "case_study"
  | "timeline"
  | "future_prediction"
  | "challenge"
  | "listicle"
  | "comparison"
  | "mystery"
  | "personal_story";

export type HookArchetype =
  | "curiosity" | "contrarian" | "shocking_stat" | "emotional_question"
  | "fomo" | "mystery" | "future_prediction" | "personal_story"
  | "challenge" | "social_proof" | "before_after" | "unexpected_comparison";

export type CtaType =
  | "comment" | "share" | "save" | "follow" | "visit" | "download"
  | "learn_more" | "shop" | "dm" | "waitlist";

export type Tone =
  | "documentary" | "inspirational" | "educational" | "professional"
  | "playful" | "luxury" | "emotional" | "cinematic" | "suspenseful"
  | "news" | "minimalist";

/** Openers the engine forbids in scene 1. Enforced by prompt + post-check. */
export const BANNED_OPENERS: readonly string[] = [
  "hi everyone", "hello everyone", "hey guys", "hey everyone",
  "welcome back", "welcome to", "today we", "in today's video",
  "did you know", "let's talk about", "let me tell you", "in this video",
];

export const HOOK_ARCHETYPES: Record<HookArchetype, { label: string; guidance: string }> = {
  curiosity: { label: "Curiosity gap", guidance: "Open a knowledge gap the viewer NEEDS closed. No answer in the hook." },
  contrarian: { label: "Contrarian opinion", guidance: "State the opposite of the mainstream take. Confident, no hedging." },
  shocking_stat: { label: "Shocking statistic", guidance: "Lead with a real, verifiable, surprising number." },
  emotional_question: { label: "Emotional question", guidance: "Ask something that hits identity, fear, ambition, or love." },
  fomo: { label: "Fear of missing out", guidance: "Frame a change already happening the viewer isn't part of yet." },
  mystery: { label: "Mystery", guidance: "Tease a secret, hidden pattern, or unexplained event." },
  future_prediction: { label: "Future prediction", guidance: "Bold claim about what happens next, with a specific timeframe." },
  personal_story: { label: "Personal story", guidance: "First-person, specific, high-stakes moment. No warm-up." },
  challenge: { label: "Challenge", guidance: "Dare the viewer to try, prove, or resist something." },
  social_proof: { label: "Social proof", guidance: "Reveal that a large or elite group already does this." },
  before_after: { label: "Before / after", guidance: "Two frames: broken state, transformed state. No middle." },
  unexpected_comparison: { label: "Unexpected comparison", guidance: "Compare two things that seem unrelated to expose a truth." },
};

export const CTA_LIBRARY: Record<CtaType, { label: string; line: string }> = {
  comment: { label: "Drive comments", line: "Tell me in the comments — which one hit you hardest?" },
  share: { label: "Drive shares", line: "Send this to someone who needs to hear it." },
  save: { label: "Drive saves", line: "Save this so you don't lose it." },
  follow: { label: "Drive follows", line: "Follow for more like this — I post daily." },
  visit: { label: "Drive site visits", line: "Full breakdown on the site — link in bio." },
  download: { label: "Drive downloads", line: "Download the free guide — link in bio." },
  learn_more: { label: "Drive learn more", line: "Full story on the channel — link in bio." },
  shop: { label: "Drive shop", line: "Shop the drop before it sells out — link in bio." },
  dm: { label: "Drive DMs", line: 'DM me the word "start" and I\'ll send it.' },
  waitlist: { label: "Drive waitlist", line: "Join the waitlist — link in bio. Doors open soon." },
};

/** Deterministic topic → structure preference. AI may still override. */
const STRUCTURE_BY_TOPIC: Record<TopicBucket, StoryStructure> = {
  ai: "future_prediction",
  technology: "future_prediction",
  business: "case_study",
  finance: "myth_truth",
  motivation: "personal_story",
  productivity: "mistake_better_way",
  health: "myth_truth",
  psychology: "question_curiosity_reveal",
  parenting: "story_lesson",
  education: "educational_breakdown",
  kids: "story_lesson",
  documentary: "documentary_narrative",
  history: "timeline",
  science: "myth_truth",
  digital_products: "product_pain_solution",
  marketing: "case_study",
  travel: "listicle",
  lifestyle: "before_after",
  self_improvement: "mistake_better_way",
  news: "documentary_narrative",
  entertainment: "storytelling" as unknown as StoryStructure, // fallthrough
  storytelling: "personal_story",
  product_promotion: "product_pain_solution",
  brand_awareness: "case_study",
  generic: "problem_discovery_solution_transformation",
};

/** Deterministic topic → recommended hook archetype. */
const HOOK_BY_TOPIC: Record<TopicBucket, HookArchetype> = {
  ai: "future_prediction",
  technology: "future_prediction",
  business: "shocking_stat",
  finance: "contrarian",
  motivation: "personal_story",
  productivity: "contrarian",
  health: "contrarian",
  psychology: "emotional_question",
  parenting: "emotional_question",
  education: "curiosity",
  kids: "curiosity",
  documentary: "mystery",
  history: "mystery",
  science: "shocking_stat",
  digital_products: "before_after",
  marketing: "shocking_stat",
  travel: "unexpected_comparison",
  lifestyle: "before_after",
  self_improvement: "contrarian",
  news: "shocking_stat",
  entertainment: "curiosity",
  storytelling: "personal_story",
  product_promotion: "before_after",
  brand_awareness: "social_proof",
  generic: "curiosity",
};

/** Deterministic topic → default CTA. */
const CTA_BY_TOPIC: Record<TopicBucket, CtaType> = {
  ai: "follow", technology: "follow", business: "save", finance: "save",
  motivation: "share", productivity: "save", health: "save", psychology: "comment",
  parenting: "share", education: "save", kids: "share", documentary: "follow",
  history: "follow", science: "follow", digital_products: "shop", marketing: "download",
  travel: "save", lifestyle: "follow", self_improvement: "save", news: "comment",
  entertainment: "share", storytelling: "follow", product_promotion: "shop",
  brand_awareness: "visit", generic: "follow",
};

const TOPIC_KEYWORDS: Array<[TopicBucket, RegExp]> = [
  ["ai", /\b(ai|artificial intelligence|gpt|llm|chatgpt|claude|gemini|machine learning|neural)\b/i],
  ["technology", /\b(tech|software|startup|saas|app|gadget|hardware|coding|dev(eloper)?)\b/i],
  ["finance", /\b(money|invest|finance|stock|crypto|bitcoin|budget|debt|wealth|tax)\b/i],
  ["business", /\b(business|entrepreneur|founder|revenue|profit|customer|b2b|b2c)\b/i],
  ["health", /\b(health|nutrition|diet|fitness|workout|sleep|wellness|calorie|protein)\b/i],
  ["psychology", /\b(mind|brain|habit|psychology|behavior|emotion|anxiety|depression)\b/i],
  ["kids", /\b(kid|children|child|toddler|preschool|kindergarten)\b/i],
  ["parenting", /\b(parent|parenting|mom|dad|baby|newborn|family)\b/i],
  ["education", /\b(learn|study|school|teacher|classroom|lesson|course|worksheet)\b/i],
  ["history", /\b(history|ancient|century|war|empire|dynasty|medieval|renaissance)\b/i],
  ["science", /\b(science|physics|biology|chemistry|space|nasa|research|experiment)\b/i],
  ["documentary", /\b(documentary|investigation|expose|inside story|the true story)\b/i],
  ["digital_products", /\b(ebook|course|template|notion|preset|digital product|printable)\b/i],
  ["marketing", /\b(marketing|brand|ads|advert|campaign|copywriting|seo|funnel)\b/i],
  ["travel", /\b(travel|trip|destination|city guide|country|vacation|itinerary)\b/i],
  ["motivation", /\b(motivat|inspire|discipline|success|mindset|grind|hustle)\b/i],
  ["productivity", /\b(productiv|routine|morning|focus|deep work|schedule|planner)\b/i],
  ["news", /\b(news|breaking|today|announce(d|ment)|update|report)\b/i],
  ["product_promotion", /\b(launch|now available|buy|shop|sale|discount|order)\b/i],
  ["self_improvement", /\b(self.?improvement|better you|transform yourself|self.?help)\b/i],
];

/** Fast, deterministic topic classifier. Falls back to "generic". */
export function classifyTopic(topic: string): TopicBucket {
  if (!topic) return "generic";
  for (const [bucket, re] of TOPIC_KEYWORDS) if (re.test(topic)) return bucket;
  return "generic";
}

export function pickStructure(bucket: TopicBucket): StoryStructure {
  return STRUCTURE_BY_TOPIC[bucket];
}
export function pickHook(bucket: TopicBucket): HookArchetype {
  return HOOK_BY_TOPIC[bucket];
}
export function pickCta(bucket: TopicBucket): CtaType {
  return CTA_BY_TOPIC[bucket];
}

/** Topics that require hedged, evidence-based language. */
export function requiresFactualHedging(bucket: TopicBucket): boolean {
  return bucket === "health" || bucket === "finance" || bucket === "science" || bucket === "psychology";
}

export const HEDGING_PHRASES: readonly string[] = [
  "Research suggests", "Evidence indicates", "Experts generally agree",
  "A growing body of research", "Studies have shown",
];

/** Platform → hashtag & caption limits used by the distribution agent. */
export const PLATFORM_LIMITS: Record<Platform, { captionMax: number; hashtagCount: [number, number] }> = {
  instagram: { captionMax: 2200, hashtagCount: [8, 15] },
  tiktok: { captionMax: 300, hashtagCount: [3, 6] },
  youtube_shorts: { captionMax: 100, hashtagCount: [3, 5] },
  facebook: { captionMax: 400, hashtagCount: [3, 6] },
  linkedin: { captionMax: 1300, hashtagCount: [3, 5] },
  pinterest: { captionMax: 500, hashtagCount: [5, 10] },
};

/** Retention rule: introduce something new every N seconds. */
export const RETENTION_INTERVAL_SEC = 3;

export type EnginePlan = {
  bucket: TopicBucket;
  structure: StoryStructure;
  hook: HookArchetype;
  cta: CtaType;
  hedging: boolean;
};

export function planFromTopic(topic: string): EnginePlan {
  const bucket = classifyTopic(topic);
  return {
    bucket,
    structure: pickStructure(bucket),
    hook: pickHook(bucket),
    cta: pickCta(bucket),
    hedging: requiresFactualHedging(bucket),
  };
}
