# Creative Director Architecture

Goal: stop generating generic "talking-head" AI content. Every generator (video, carousel, image, thumbnail, future ads/posts) runs through the same upstream brain so a "Digital Product" prompt yields product mockups, a "Children's Education" prompt yields worksheets, etc.

## 1. New shared module: `src/lib/creative-director.ts`

Single source of truth. Pure TypeScript types + one server function.

### Types

```ts
type ContentIntent =
  | "digital_product" | "physical_product" | "educational"
  | "children_education" | "documentary" | "storytelling"
  | "explainer" | "tutorial" | "saas_demo" | "website_promo"
  | "business" | "personal_branding" | "social_media"
  | "news" | "course_promo" | "general";

type VisualStyle =
  | "photoreal" | "premium_product_photo" | "modern_infographic"
  | "flat_illustration" | "montessori" | "children_illustration"
  | "minimal" | "corporate" | "luxury" | "editorial"
  | "3d_illustration" | "comic" | "magazine"
  | "apple_style" | "pinterest_style" | "canva_premium";

type CreativeBrief = {
  intent: ContentIntent;
  confidence: number;
  visualHero: string;               // "the product itself" | "worksheets" | ...
  visualStyle: VisualStyle;
  cameraStyle: string;              // "top-down macro, soft studio light"
  sceneComposition: string;         // "hero product 70%, hands 20%, lifestyle 10%"
  assetMix: { productPct: number; usagePct: number; peoplePct: number; contextPct: number };
  marketingGoal: string;            // "drive PDF download"
  avoid: string[];                  // ["random talking heads", "stock people"]
  paletteHint: string;              // hex list + mood
  brandVoice: string;
  ctaStyle: string;
};

type AssetPlanItem = {
  index: number;
  role: string;                     // "Product Hero" | "Feature Highlight" | "CTA"
  slideType?: "hook"|"problem"|"benefits"|"features"|"comparison"|"process"|"checklist"|"stats"|"case_study"|"offer"|"cta";
  visualDescription: string;
  layoutHint: string;
  shotType: string;
};

type AssetPlan = { brief: CreativeBrief; items: AssetPlanItem[] };
```

### Server functions (in `src/lib/creative-director.functions.ts`)

- `detectIntent({ prompt, surface })` → `{ intent, confidence, rationale }`.
  `surface` = "video"|"carousel"|"image"|"thumbnail"|"ad".
- `buildCreativeBrief({ prompt, intent, surface, extras })` → `CreativeBrief`.
- `buildAssetPlan({ brief, surface, count })` → `AssetPlan`.
- `engineerPrompt({ brief, item, model, ratio })` → final rich image/video prompt string.

All four use `google/gemini-2.5-pro` with `response_format: json_object`, wrapped in `requireSupabaseAuth`. Zod-parsed. One convenience wrapper `runCreativeDirector({ prompt, surface, count, extras })` runs all four sequentially and returns `{ brief, plan }`.

### Style library

A `STYLE_LIBRARY: Record<VisualStyle, { lighting, palette, references, doNots }>` object drives the Prompt Engineer. Intent → default style mapping table (e.g. `children_education → montessori`, `digital_product → premium_product_photo`).

## 2. Wire into existing generators

Minimal, surgical edits — no new UI required.

### Carousel — `src/lib/carousel-ai.functions.ts`
- Before the existing "Design a premium carousel" call, run `runCreativeDirector({ prompt: topic, surface: "carousel", count: slideCount })`.
- Inject `brief` + `plan.items[i].slideType`/`layoutHint` into the existing system prompt so slides get varied types (hook/problem/benefits/…/cta) with distinct layouts, and the shared brand-lock uses `brief.paletteHint` and `brief.visualStyle`.
- Keep the existing `image_prompt` shape but route it through `engineerPrompt` so product-marketing intents produce product/mockup/flatlay language, not "person holding phone".

### Image — `src/routes/_authenticated/images.tsx` (or wherever the ad-hoc prompt call is)
- Add an "AI Direct" toggle (on by default). When on, call `runCreativeDirector` first, take `plan.items[0]`, pass through `engineerPrompt`, then hit `/api/generate-image` with the enriched prompt.

### Video — `src/lib/video-agents.ts`
- New `IntentDirectorAgent` runs before `ResearchAgent` and stores the `CreativeBrief` on the job.
- `StoryboardAgent` and beat/shot prompt building use `brief.assetMix` to bias scene composition (e.g. product-marketing → ≥70% product/mockup shots, avoid talking heads unless user explicitly asked).
- `visual-director.ts` `directBeatPrompt` accepts `CreativeBrief` and folds `cameraStyle` + `avoid` list into every beat prompt.
- Children's-education intent injects the worksheet/coloring/tracing/montessori vocabulary listed in the request.

### Thumbnail — `src/lib/thumbnail-director.ts`
- Extend concept planning with a `strategy` field: `curiosity | shock | comparison | emotion | transformation | before_after | big_numbers | question | product_focus`.
- Use `brief.intent` to pick default strategy (product intents → `product_focus`, docs → `curiosity`, education → `question`, etc.). Still generate the existing 4 concepts, but each concept declares its strategy so the layered prompts differ meaningfully.

### Future surfaces (ads, social posts)
Not built now, but the shared `runCreativeDirector` + `engineerPrompt` API is the contract they'll use.

## 3. Persistence

No new DB tables. Video jobs already live in IndexedDB via `video-job-store.ts`; add `brief` + `plan` fields there. Carousel keeps its existing local storage; brief is transient per generation.

## 4. Files touched

**New**
- `src/lib/creative-director.ts` — types, style library, intent→defaults table, thin client wrapper.
- `src/lib/creative-director.functions.ts` — the 4 server fns + `runCreativeDirector`.

**Edited**
- `src/lib/carousel-ai.functions.ts` — call director, pass brief + slideType into slide prompt, use `engineerPrompt`.
- `src/lib/video-agents.ts` — new `IntentDirectorAgent`; storyboard/shot prompts consume brief.
- `src/lib/visual-director.ts` — accept `CreativeBrief`; append `avoid` list + `cameraStyle` to every prompt.
- `src/lib/video-job-store.ts` — persist `brief` + `plan`.
- `src/lib/thumbnail-director.ts` — add `strategy`, intent-driven concept mix.
- `src/routes/_authenticated/images.tsx` — route the single-image generate through director by default.

## 5. Non-goals for this pass

- No new "Ad Creatives" or "Social Posts" routes/UI. The engine is ready for them; a follow-up turn adds the pages.
- No UI change to the Videos or Carousels landing views — the improvements happen inside the pipeline.
- No changes to auth, billing, or credit costs.

## Open questions

1. Should the detected intent be **overridable by the user** with a dropdown on each generator, or fully automatic based on the prompt? (Default: automatic with a small "AI thinks this is: Digital Product · change" chip.)
2. For carousels, is it OK if the slide **count I generate still respects the user's chosen count** but slide **types** are chosen by the planner? (i.e. user picks 6, planner picks hook/problem/benefits/features/offer/cta.)
