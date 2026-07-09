// Creative Director — the SHARED BRAIN behind every generator.
//
// Pipeline: User Prompt → Intent → Creative Director → Visual Strategy →
// Asset Planner → Prompt Engineer → (image/video/carousel/thumbnail/ad).
//
// This file is client-safe and dependency-free. The LLM-powered upgrade lives
// in `creative-director.functions.ts`; every helper here has a heuristic
// fallback so generators degrade gracefully when the LLM call fails.

export type ContentIntent =
  | "digital_product"
  | "physical_product"
  | "educational"
  | "children_education"
  | "documentary"
  | "storytelling"
  | "explainer"
  | "tutorial"
  | "saas_demo"
  | "website_promo"
  | "business"
  | "personal_branding"
  | "social_media"
  | "news"
  | "course_promo"
  | "general";

export type Surface = "video" | "reel" | "carousel" | "image" | "thumbnail" | "ad" | "social_post";

export type VisualStyle =
  | "photoreal"
  | "premium_product_photo"
  | "modern_infographic"
  | "flat_illustration"
  | "montessori"
  | "children_illustration"
  | "minimal"
  | "corporate"
  | "luxury"
  | "editorial"
  | "3d_illustration"
  | "comic"
  | "magazine"
  | "apple_style"
  | "pinterest_style"
  | "canva_premium";

export type ThumbnailStrategy =
  | "curiosity" | "shock" | "comparison" | "emotion" | "transformation"
  | "before_after" | "big_numbers" | "question" | "product_focus";

export type CreativeBrief = {
  intent: ContentIntent;
  confidence: number;                // 0..1
  visualHero: string;                // "the product itself" | "worksheets" | "the dashboard UI"
  visualStyle: VisualStyle;
  cameraStyle: string;               // "top-down macro on plain surface, soft studio window light"
  sceneComposition: string;          // "hero product 70%, hands 20%, lifestyle 10%"
  assetMix: { productPct: number; usagePct: number; peoplePct: number; contextPct: number };
  marketingGoal: string;             // "drive PDF download"
  avoid: string[];                   // ["random presenters", "stock talking heads"]
  paletteHint: string;               // "cream + gold accent, warm neutrals" (or hex list)
  brandVoice: string;
  ctaStyle: string;
  thumbnailStrategy: ThumbnailStrategy;
};

export type SlideType =
  | "hook" | "problem" | "benefits" | "features" | "comparison"
  | "process" | "checklist" | "statistics" | "case_study" | "offer" | "cta";

export type AssetPlanItem = {
  index: number;
  role: string;                      // "Product Hero" | "Feature Highlight" | "CTA"
  slideType?: SlideType;             // carousel only
  shotType: string;                  // "hero product mockup, top-down"
  visualDescription: string;         // human-language description of what to show
  layoutHint: string;                // "large hero centered, bullets in bottom third"
};

export type AssetPlan = { brief: CreativeBrief; items: AssetPlanItem[] };

// ---------------- Style library ----------------
// Describes how each visual style should be executed at prompt-engineering time.

export type StyleRecipe = {
  label: string;
  lighting: string;
  palette: string;
  references: string;
  doNots: string[];
};

export const STYLE_LIBRARY: Record<VisualStyle, StyleRecipe> = {
  photoreal: {
    label: "Photorealistic",
    lighting: "natural daylight, soft window key, subtle bounce fill",
    palette: "true-to-life neutrals",
    references: "modern editorial photography, Canon EOS R5, 85mm f/1.4",
    doNots: ["cartoon", "flat vector", "over-processed HDR"],
  },
  premium_product_photo: {
    label: "Premium Product Photography",
    lighting: "controlled softbox, single soft rim, hero highlight on product edge",
    palette: "clean neutrals + one brand accent, soft shadows",
    references: "Apple product page, Aesop, Nordic e-commerce, Hasselblad X2D",
    doNots: ["talking-head presenter", "stock people", "cluttered backdrop", "cartoon"],
  },
  modern_infographic: {
    label: "Modern Infographic",
    lighting: "flat editorial lighting",
    palette: "2-3 brand hex + generous white",
    references: "Notion, Linear, Stripe marketing site",
    doNots: ["photorealistic people", "cinematic haze"],
  },
  flat_illustration: {
    label: "Flat Illustration",
    lighting: "even ambient",
    palette: "pastel or brand palette, 3-4 flat colors",
    references: "Dribbble editorial illustrations",
    doNots: ["photoreal skin", "3D shading"],
  },
  montessori: {
    label: "Montessori",
    lighting: "warm afternoon window light",
    palette: "cream, sage, terracotta, natural wood",
    references: "Pinterest Montessori shelves, wooden toys, worksheets on oak table",
    doNots: ["cartoon mascots", "plastic bright colors", "generic clip-art"],
  },
  children_illustration: {
    label: "Children's Illustration",
    lighting: "soft picture-book light",
    palette: "friendly primary + pastel mix",
    references: "modern children's book illustration",
    doNots: ["scary imagery", "photoreal adults", "text-heavy layouts"],
  },
  minimal: {
    label: "Minimal",
    lighting: "single soft key, generous negative space",
    palette: "off-white + single accent",
    references: "Scandinavian design, Muji, Kinfolk",
    doNots: ["busy backgrounds", "multiple competing focal points"],
  },
  corporate: {
    label: "Corporate",
    lighting: "clean office daylight",
    palette: "navy, slate, subtle brand accent",
    references: "McKinsey / HBR editorial",
    doNots: ["stock smiling handshake", "cheesy business cliché"],
  },
  luxury: {
    label: "Luxury Editorial",
    lighting: "controlled softbox with gold rim",
    palette: "gold, cream, deep black",
    references: "Vogue, Aesop, Hermes",
    doNots: ["plastic look", "over-saturation"],
  },
  editorial: {
    label: "Editorial Magazine",
    lighting: "natural editorial daylight",
    palette: "muted magazine tones",
    references: "The New Yorker photo essays, Kinfolk",
    doNots: ["stock photo aesthetic"],
  },
  "3d_illustration": {
    label: "3D Illustration",
    lighting: "soft HDRI with rim light",
    palette: "vibrant flat-3D palette",
    references: "Spline / Blender hero renders",
    doNots: ["photoreal humans", "muddy shading"],
  },
  comic: {
    label: "Comic",
    lighting: "high-contrast key",
    palette: "bold saturated primaries",
    references: "modern graphic novel spreads",
    doNots: ["photoreal skin"],
  },
  magazine: {
    label: "Magazine Cover",
    lighting: "studio strobe",
    palette: "brand-forward with strong accent",
    references: "TIME, Bloomberg Businessweek covers",
    doNots: ["amateur composition"],
  },
  apple_style: {
    label: "Apple Style",
    lighting: "controlled studio softbox, invisible seamless white",
    palette: "product-forward with soft neutrals",
    references: "apple.com hero product pages",
    doNots: ["busy props", "distracting backgrounds"],
  },
  pinterest_style: {
    label: "Pinterest Aesthetic",
    lighting: "warm ambient",
    palette: "moody warm neutrals + one accent",
    references: "top-performing Pinterest pins, flat lays",
    doNots: ["stock photography", "watermarks"],
  },
  canva_premium: {
    label: "Canva Premium Template",
    lighting: "flat editorial",
    palette: "curated brand palette + accent",
    references: "premium Canva Instagram templates, well-typeset editorial cards",
    doNots: ["default Canva clip-art", "generic emoji spam"],
  },
};

// ---------------- Intent → defaults ----------------

const INTENT_DEFAULTS: Record<ContentIntent, Omit<CreativeBrief,
  "confidence" | "marketingGoal" | "brandVoice" | "ctaStyle"
> & { defaultCta: string; defaultGoal: string; defaultVoice: string }> = {
  digital_product: {
    intent: "digital_product",
    visualHero: "the digital product itself (screens, PDFs, mockups)",
    visualStyle: "premium_product_photo",
    cameraStyle: "clean device mockups + top-down flat lays, soft studio light",
    sceneComposition: "70% product / mockups, 20% product-in-use, 10% context",
    assetMix: { productPct: 70, usagePct: 20, peoplePct: 10, contextPct: 0 },
    avoid: ["random presenter", "generic stock talking head", "unrelated lifestyle people"],
    paletteHint: "brand palette + clean neutrals, premium marketing energy",
    thumbnailStrategy: "product_focus",
    defaultCta: "Get it now",
    defaultGoal: "drive product page conversions",
    defaultVoice: "confident, benefit-led, premium",
  },
  physical_product: {
    intent: "physical_product",
    visualHero: "the physical product",
    visualStyle: "premium_product_photo",
    cameraStyle: "hero product photography, packaging shots, close-up details, hands using it",
    sceneComposition: "60% product, 25% product-in-use, 15% lifestyle context",
    assetMix: { productPct: 60, usagePct: 25, peoplePct: 15, contextPct: 0 },
    avoid: ["stock presenter", "unrelated influencer", "cluttered background"],
    paletteHint: "brand palette + premium neutrals",
    thumbnailStrategy: "product_focus",
    defaultCta: "Shop now",
    defaultGoal: "drive store conversions",
    defaultVoice: "premium, sensory, benefit-led",
  },
  educational: {
    intent: "educational",
    visualHero: "clear illustrated concepts and diagrams",
    visualStyle: "modern_infographic",
    cameraStyle: "clean infographic layouts, annotated diagrams, before/after comparisons",
    sceneComposition: "60% diagrams / infographics, 30% supporting visuals, 10% instructor if needed",
    assetMix: { productPct: 60, usagePct: 20, peoplePct: 10, contextPct: 10 },
    avoid: ["random stock people", "meaningless b-roll"],
    paletteHint: "editorial neutrals + 1-2 accents for emphasis",
    thumbnailStrategy: "question",
    defaultCta: "Save this for later",
    defaultGoal: "teach one concept clearly",
    defaultVoice: "clear, calm, authoritative",
  },
  children_education: {
    intent: "children_education",
    visualHero: "worksheets, tracing pages, mazes, coloring, hands-on activities",
    visualStyle: "montessori",
    cameraStyle: "top-down flat lays of worksheets on oak table, hands of a child completing activities, warm afternoon window light",
    sceneComposition: "60% worksheets/activities, 25% child hands / parent-child interaction, 15% Montessori shelf context",
    assetMix: { productPct: 60, usagePct: 25, peoplePct: 15, contextPct: 0 },
    avoid: ["cartoon mascots", "plastic bright colors", "adult presenter to camera", "generic clip-art"],
    paletteHint: "cream, sage, terracotta, natural wood tones",
    thumbnailStrategy: "product_focus",
    defaultCta: "Download the worksheets",
    defaultGoal: "drive worksheet PDF downloads",
    defaultVoice: "warm, calm, parent-to-parent",
  },
  documentary: {
    intent: "documentary",
    visualHero: "cinematic storytelling — subjects, environments, archival",
    visualStyle: "editorial",
    cameraStyle: "wide establishing shots, hero portraits, macro details, drone",
    sceneComposition: "40% subject, 30% environment, 20% detail, 10% archival",
    assetMix: { productPct: 0, usagePct: 0, peoplePct: 40, contextPct: 60 },
    avoid: ["cheap stock", "cartoon"],
    paletteHint: "muted editorial grade",
    thumbnailStrategy: "curiosity",
    defaultCta: "Subscribe for more",
    defaultGoal: "watch time + subscribes",
    defaultVoice: "narrative, immersive",
  },
  storytelling: {
    intent: "storytelling",
    visualHero: "characters and environments",
    visualStyle: "editorial",
    cameraStyle: "cinematic character portraits, environmental context, story beats",
    sceneComposition: "50% characters, 30% environment, 20% moment beats",
    assetMix: { productPct: 0, usagePct: 0, peoplePct: 50, contextPct: 50 },
    avoid: ["random stock"],
    paletteHint: "moody cinematic grade",
    thumbnailStrategy: "emotion",
    defaultCta: "Follow the story",
    defaultGoal: "audience retention",
    defaultVoice: "narrative, emotional",
  },
  explainer: {
    intent: "explainer",
    visualHero: "diagrams + product/subject",
    visualStyle: "modern_infographic",
    cameraStyle: "diagrams, animated-looking infographics, product overlays",
    sceneComposition: "50% diagrams, 30% product/subject, 20% context",
    assetMix: { productPct: 50, usagePct: 20, peoplePct: 10, contextPct: 20 },
    avoid: ["talking head only", "generic stock"],
    paletteHint: "editorial neutrals + brand accent",
    thumbnailStrategy: "question",
    defaultCta: "Learn more",
    defaultGoal: "clear understanding",
    defaultVoice: "clear, friendly, precise",
  },
  tutorial: {
    intent: "tutorial",
    visualHero: "the app / product / material being used",
    visualStyle: "premium_product_photo",
    cameraStyle: "screen recordings, hands-on-keyboard, top-down demo",
    sceneComposition: "70% product/UI in use, 20% hands, 10% context",
    assetMix: { productPct: 70, usagePct: 20, peoplePct: 10, contextPct: 0 },
    avoid: ["random b-roll", "cinematic filler"],
    paletteHint: "clean neutrals + product accent",
    thumbnailStrategy: "big_numbers",
    defaultCta: "Try it yourself",
    defaultGoal: "successful step-by-step completion",
    defaultVoice: "clear, encouraging",
  },
  saas_demo: {
    intent: "saas_demo",
    visualHero: "the dashboard, UI, and app screens",
    visualStyle: "apple_style",
    cameraStyle: "hero UI mockups on device frames, dashboard close-ups, dark and light mode",
    sceneComposition: "80% UI/dashboard, 20% device + context",
    assetMix: { productPct: 80, usagePct: 15, peoplePct: 5, contextPct: 0 },
    avoid: ["random stock person", "unrelated office scene"],
    paletteHint: "brand palette + dashboard neutrals",
    thumbnailStrategy: "product_focus",
    defaultCta: "Try the demo",
    defaultGoal: "start free trial",
    defaultVoice: "confident, product-led",
  },
  website_promo: {
    intent: "website_promo",
    visualHero: "the website / landing page",
    visualStyle: "apple_style",
    cameraStyle: "browser mockups, hero screenshots, device frames",
    sceneComposition: "70% site UI, 20% device context, 10% brand marks",
    assetMix: { productPct: 70, usagePct: 20, peoplePct: 10, contextPct: 0 },
    avoid: ["random stock people"],
    paletteHint: "brand palette + neutrals",
    thumbnailStrategy: "product_focus",
    defaultCta: "Visit the site",
    defaultGoal: "site visits",
    defaultVoice: "confident, brand-led",
  },
  business: {
    intent: "business",
    visualHero: "charts, data, professional environments",
    visualStyle: "corporate",
    cameraStyle: "editorial portraits, infographics, workspace details",
    sceneComposition: "40% infographics, 30% workspace, 30% subject",
    assetMix: { productPct: 30, usagePct: 20, peoplePct: 30, contextPct: 20 },
    avoid: ["cheesy stock handshake", "cliché business cliché"],
    paletteHint: "navy + slate + accent",
    thumbnailStrategy: "big_numbers",
    defaultCta: "Read the breakdown",
    defaultGoal: "authority + credibility",
    defaultVoice: "authoritative, analytical",
  },
  personal_branding: {
    intent: "personal_branding",
    visualHero: "the creator + supporting brand assets",
    visualStyle: "editorial",
    cameraStyle: "editorial portraits, brand supporting assets, lifestyle context",
    sceneComposition: "50% creator, 30% brand assets, 20% context",
    assetMix: { productPct: 20, usagePct: 20, peoplePct: 50, contextPct: 10 },
    avoid: ["stock strangers", "unbranded generic"],
    paletteHint: "personal brand palette",
    thumbnailStrategy: "emotion",
    defaultCta: "Follow for more",
    defaultGoal: "audience growth",
    defaultVoice: "on-brand, personal",
  },
  social_media: {
    intent: "social_media",
    visualHero: "the hook subject",
    visualStyle: "canva_premium",
    cameraStyle: "scroll-stopping hero + bold typography",
    sceneComposition: "60% hero visual, 40% supporting layout",
    assetMix: { productPct: 40, usagePct: 20, peoplePct: 30, contextPct: 10 },
    avoid: ["generic default templates"],
    paletteHint: "bold, on-brand, high contrast",
    thumbnailStrategy: "curiosity",
    defaultCta: "Save this",
    defaultGoal: "shares + saves",
    defaultVoice: "punchy, direct",
  },
  news: {
    intent: "news",
    visualHero: "the story subject + supporting photography",
    visualStyle: "editorial",
    cameraStyle: "editorial photojournalism, portraits, environments",
    sceneComposition: "50% story subject, 30% context, 20% supporting data",
    assetMix: { productPct: 10, usagePct: 10, peoplePct: 40, contextPct: 40 },
    avoid: ["cinematic drama beyond truth", "generic stock"],
    paletteHint: "editorial newsroom grade",
    thumbnailStrategy: "shock",
    defaultCta: "Read the full story",
    defaultGoal: "informed viewer",
    defaultVoice: "journalistic, precise",
  },
  course_promo: {
    intent: "course_promo",
    visualHero: "the course materials + outcome",
    visualStyle: "premium_product_photo",
    cameraStyle: "device mockups showing course, worksheets, before/after outcomes",
    sceneComposition: "60% course materials, 25% outcomes / results, 15% instructor optional",
    assetMix: { productPct: 60, usagePct: 25, peoplePct: 15, contextPct: 0 },
    avoid: ["random stock student", "generic e-learning cliché"],
    paletteHint: "brand palette + trust neutrals",
    thumbnailStrategy: "transformation",
    defaultCta: "Enroll now",
    defaultGoal: "course sales",
    defaultVoice: "confident, outcome-led",
  },
  general: {
    intent: "general",
    visualHero: "the subject of the prompt",
    visualStyle: "editorial",
    cameraStyle: "editorial, natural light, purposeful composition",
    sceneComposition: "50% subject, 30% context, 20% detail",
    assetMix: { productPct: 30, usagePct: 20, peoplePct: 30, contextPct: 20 },
    avoid: ["generic stock imagery"],
    paletteHint: "editorial neutrals + one accent",
    thumbnailStrategy: "curiosity",
    defaultCta: "Learn more",
    defaultGoal: "engagement",
    defaultVoice: "clear, engaging",
  },
};

// ---------------- Heuristic intent detection (offline fallback) ----------------

const INTENT_KEYWORDS: Array<{ intent: ContentIntent; words: string[] }> = [
  { intent: "children_education", words: ["worksheet", "worksheets", "montessori", "toddler", "preschool", "kindergarten", "tracing", "coloring", "kids learning", "phonics", "little minds", "activity book"] },
  { intent: "digital_product",    words: ["ebook", "pdf", "notion template", "digital product", "download", "printable", "template pack", "figma template", "notion pack"] },
  { intent: "physical_product",   words: ["product photo", "packaging", "unboxing", "beauty product", "skincare", "gadget", "device", "bottle", "merch"] },
  { intent: "saas_demo",          words: ["dashboard", "saas", "app demo", "web app", "ui walkthrough", "product tour", "onboarding flow"] },
  { intent: "website_promo",      words: ["landing page", "website launch", "site relaunch", "microsite"] },
  { intent: "course_promo",       words: ["course", "cohort", "bootcamp", "curriculum", "enroll", "students of my course"] },
  { intent: "tutorial",           words: ["how to", "tutorial", "step by step", "walkthrough", "guide to"] },
  { intent: "explainer",          words: ["explained", "explainer", "what is", "how does", "breakdown"] },
  { intent: "documentary",        words: ["documentary", "the true story", "the rise of", "the fall of", "the history of"] },
  { intent: "storytelling",       words: ["story", "narrative", "the day i", "chapter"] },
  { intent: "news",               words: ["breaking", "news", "just in", "report", "announcement"] },
  { intent: "business",           words: ["strategy", "case study", "growth", "revenue", "market", "startup", "b2b"] },
  { intent: "personal_branding",  words: ["my journey", "personal brand", "my story", "behind the scenes"] },
  { intent: "social_media",       words: ["instagram post", "reel idea", "tiktok", "linkedin post"] },
  { intent: "educational",        words: ["learn", "lesson", "teach", "concept", "principle", "science of", "math"] },
];

export function detectIntentHeuristic(prompt: string): { intent: ContentIntent; confidence: number } {
  const s = (prompt || "").toLowerCase();
  let best: { intent: ContentIntent; hits: number } = { intent: "general", hits: 0 };
  for (const { intent, words } of INTENT_KEYWORDS) {
    const hits = words.reduce((n, w) => n + (s.includes(w) ? 1 : 0), 0);
    if (hits > best.hits) best = { intent, hits };
  }
  const confidence = best.hits === 0 ? 0.3 : Math.min(0.95, 0.5 + best.hits * 0.15);
  return { intent: best.intent, confidence };
}

/** Build a full brief from a detected intent + user prompt. Zero-LLM fallback. */
export function buildBriefFromIntent(prompt: string, intent: ContentIntent, confidence = 0.6): CreativeBrief {
  const d = INTENT_DEFAULTS[intent];
  return {
    intent: d.intent,
    confidence,
    visualHero: d.visualHero,
    visualStyle: d.visualStyle,
    cameraStyle: d.cameraStyle,
    sceneComposition: d.sceneComposition,
    assetMix: d.assetMix,
    marketingGoal: d.defaultGoal,
    avoid: d.avoid,
    paletteHint: d.paletteHint,
    brandVoice: d.defaultVoice,
    ctaStyle: d.defaultCta,
    thumbnailStrategy: d.thumbnailStrategy,
  };
}

/** One-liner heuristic entry point used by any client-side generator. */
export function directorFromPrompt(prompt: string): CreativeBrief {
  const { intent, confidence } = detectIntentHeuristic(prompt);
  return buildBriefFromIntent(prompt, intent, confidence);
}

// ---------------- Asset plan (heuristic) ----------------

const SLIDE_TYPE_MENU: SlideType[] = [
  "hook", "problem", "benefits", "features", "process", "checklist",
  "comparison", "statistics", "case_study", "offer", "cta",
];

/** Build a heuristic asset plan for the given surface + count. */
export function buildAssetPlanHeuristic(
  brief: CreativeBrief,
  surface: Surface,
  count: number,
): AssetPlan {
  const items: AssetPlanItem[] = [];
  if (surface === "carousel") {
    // Ensure Hook + CTA bookends, distribute middle slides across varied types.
    const middleCount = Math.max(0, count - 2);
    const middlePool: SlideType[] = ["problem", "benefits", "features", "process", "statistics", "comparison", "case_study", "offer"];
    for (let i = 0; i < count; i++) {
      const slideType: SlideType = i === 0 ? "hook" : i === count - 1 ? "cta" : middlePool[(i - 1) % middlePool.length];
      items.push({
        index: i + 1,
        role: slideType === "hook" ? "Hook" : slideType === "cta" ? "CTA" : `Slide ${i + 1}`,
        slideType,
        shotType: pickShotTypeForBrief(brief, i),
        visualDescription: describeVisualFor(brief, slideType, i),
        layoutHint: layoutFor(slideType),
      });
    }
    return { brief, items };
  }
  // Video / reel / image / thumbnail / ad — asset plan is a list of shot roles.
  const roles = pickAssetRoles(brief, count);
  for (let i = 0; i < roles.length; i++) {
    items.push({
      index: i + 1,
      role: roles[i],
      shotType: pickShotTypeForBrief(brief, i),
      visualDescription: `${roles[i]} — ${brief.visualHero}`,
      layoutHint: "cinematic composition following the visual strategy",
    });
  }
  return { brief, items };
}

function pickAssetRoles(brief: CreativeBrief, count: number): string[] {
  const productRoles = ["Product Hero", "Product Mockup", "Packaging / Cover", "Feature Highlight", "Close-up Detail", "Lifestyle Usage", "Benefits Visual", "CTA / Outcome"];
  const eduRoles     = ["Worksheet Hero", "Top-down Flat Lay", "Child Completing Activity", "Parent-Child Moment", "Montessori Shelf Context", "Coloring Detail", "Tracing Close-up", "Outcome / Progress"];
  const docRoles     = ["Wide Establishing", "Hero Portrait", "Environment Detail", "Macro Detail", "Archival Reference", "Reveal Moment", "Emotional Beat", "Closing Frame"];
  const roleset =
    brief.intent === "children_education" ? eduRoles :
    brief.intent === "digital_product" || brief.intent === "physical_product" || brief.intent === "saas_demo" || brief.intent === "website_promo" || brief.intent === "course_promo" ? productRoles :
    docRoles;
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(roleset[i % roleset.length]);
  return out;
}

function pickShotTypeForBrief(brief: CreativeBrief, i: number): string {
  const product = ["hero product mockup", "top-down flat lay", "close-up detail", "hands using the product", "packaging shot", "device frame mockup"];
  const edu     = ["top-down worksheet flat lay on oak table", "child hands tracing", "child completing activity", "parent guiding child", "shelf context wide", "coloring close-up"];
  const doc     = ["wide establishing", "hero portrait", "macro detail", "over-the-shoulder", "low-angle", "environment detail"];
  const bank =
    brief.intent === "children_education" ? edu :
    brief.intent === "digital_product" || brief.intent === "physical_product" || brief.intent === "saas_demo" || brief.intent === "website_promo" || brief.intent === "course_promo" ? product :
    doc;
  return bank[i % bank.length];
}

function describeVisualFor(brief: CreativeBrief, slideType: SlideType, i: number): string {
  const hero = brief.visualHero;
  switch (slideType) {
    case "hook":       return `Bold scroll-stopping opener featuring ${hero}. Massive headline, minimal supporting copy.`;
    case "problem":    return `Illustrate the pain point without hero — muted palette, empty state, tension.`;
    case "benefits":   return `${hero} shown delivering a clear win. Warm, aspirational.`;
    case "features":   return `${hero} with labeled feature callouts arranged around the hero.`;
    case "comparison": return `Split-screen: "before" muted / left vs "after" vibrant / right, both showing ${hero}.`;
    case "process":    return `Numbered steps (1-2-3) each with an icon or sub-visual of ${hero}.`;
    case "checklist":  return `Checklist card layout with hero visual on the side, ticks on the checklist items.`;
    case "statistics": return `Giant stat number dominating the slide with ${hero} as supporting visual.`;
    case "case_study": return `Real-world outcome: quote card + result number + supporting shot of ${hero}.`;
    case "offer":      return `Offer card with pricing / bonus stack + hero rendering of ${hero}.`;
    case "cta":        return `Clear CTA button + hero of ${hero} + arrow prompting the swipe/click.`;
    default:           return `${hero}, slide ${i + 1}`;
  }
}

function layoutFor(slideType: SlideType): string {
  switch (slideType) {
    case "hook":       return "giant headline top, hero centered bottom";
    case "problem":    return "centered headline, small supporting visual bottom right";
    case "benefits":   return "hero left, bullet list right";
    case "features":   return "hero centered with 4 corner callout labels";
    case "comparison": return "vertical 50/50 split, headline overlaid top";
    case "process":    return "3 columns numbered, each with icon + micro-caption";
    case "checklist":  return "hero left, tick list right on cream card";
    case "statistics": return "massive number top, supporting visual bottom";
    case "case_study": return "quote card top, result number bottom right, hero left";
    case "offer":      return "hero left, pricing card + bonus stack right";
    case "cta":        return "big CTA button centered, hero above, arrow bottom right";
  }
  return "clean editorial layout";
}

// ---------------- Prompt Engineer (client-safe) ----------------

/** Returns a string block you can prepend to ANY image / video prompt. */
export function briefEnrichment(brief: CreativeBrief): string {
  const recipe = STYLE_LIBRARY[brief.visualStyle];
  const doNots = Array.from(new Set([...(brief.avoid ?? []), ...(recipe?.doNots ?? [])]));
  const lines = [
    `CREATIVE DIRECTOR BRIEF (obey strictly)`,
    `Intent: ${brief.intent}`,
    `Visual hero: ${brief.visualHero}`,
    `Visual style: ${recipe?.label ?? brief.visualStyle} — ${recipe?.references ?? ""}`,
    `Lighting: ${recipe?.lighting ?? "editorial"}`,
    `Palette: ${brief.paletteHint}${recipe?.palette ? ` (${recipe.palette})` : ""}`,
    `Camera style: ${brief.cameraStyle}`,
    `Scene composition rule: ${brief.sceneComposition}`,
    `Marketing goal: ${brief.marketingGoal}`,
    doNots.length ? `AVOID: ${doNots.join(", ")}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

/** Combine brief + asset plan item into a final rich image prompt. */
export function engineerPrompt(brief: CreativeBrief, item: AssetPlanItem, extra?: string): string {
  return [
    briefEnrichment(brief),
    `---`,
    `Asset ${item.index}: ${item.role}${item.slideType ? ` (${item.slideType})` : ""}`,
    `Shot type: ${item.shotType}`,
    `Layout: ${item.layoutHint}`,
    `What to show: ${item.visualDescription}`,
    extra ? `Extra context: ${extra}` : "",
    `Spell every word correctly. No lorem ipsum. No gibberish text.`,
  ].filter(Boolean).join("\n");
}
