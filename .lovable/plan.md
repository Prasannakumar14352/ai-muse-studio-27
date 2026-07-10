
## Goal

Ship a "Short Video Engine" that produces production-ready reels (IG / TikTok / YT Shorts / FB) AND upgrades the existing long-form pipeline with the same intelligence (adaptive structures, viral hook engine, distribution package, self-scoring quality loop).

## What ships

### 1. New "Shorts" mode in `/videos`

- Toggle at the top of the New Video view: **Short (9:16, 15–60s)** vs **Long (16:9, existing flow)**.
- Preset durations: 15s / 30s / 45s / 60s. Aspect 9:16 forced.
- Reuses existing project storage — new `format: "short" | "long"` field on the job.
- Renderer branch: `video-renderer.ts` gets a 9:16 output path (1080x1920, 30fps).

### 2. Shared "Short Video Engine" library

New `src/lib/short-video-engine.ts` (pure logic, no I/O) with:
- **Topic classifier** → maps free-text topic to one of the 26 topic buckets in the spec.
- **Structure picker** → chooses the story pattern per topic (Problem→Solution, Myth→Truth, Before→After, Listicle, Case Study, etc.). Deterministic table + AI override for edge cases.
- **Hook Engine** → 12 hook archetypes (Curiosity, Contrarian, Shocking Stat, FOMO, Mystery, Prediction, Personal Story, Challenge, Social Proof, Before/After, Unexpected Comparison, Emotional Question). Banned openers list ("Hi everyone", "Did you know", "In today's video", etc.) enforced.
- **Retention rules** → every 2–3s: new visual/angle/motion/info/emotion. Enforced by scene planner and validated by Quality Agent.
- **CTA picker** → chooses CTA type from goal (Comment, Save, Share, Follow, Shop, DM, Visit, Download, Waitlist, Learn More).

### 3. Adaptive pipeline (shared by Shorts and Long-form)

Extend `src/lib/video-agents.ts`:
- **New `TopicIntentAgent`** — runs first, produces `{ topicBucket, tone, structurePattern, hookArchetype, ctaType, platform }`.
- **`RetentionEngineAgent`** (exists) → upgraded to accept `structurePattern` and generate variable scene counts (not fixed 90–120).
- **`ScriptAgent`** → prompt rewritten to enforce: banned openers, chosen hook archetype, chosen structure, VO tone table, ≤6-word on-screen text, 2–3s beat cadence.
- **`VisualDirectorAgent`** (exists) → forbid repeating environment/angle/lighting/palette within a 3-beat window.
- **Hybrid clip generation** — new `HeroBeatSelector`: picks 2–3 "hero" beats (hook + reveal + CTA/climax). Those call `videogen--generate_video` at render time (or the runtime AI video route); others use image + Motion Director.
- **Factual guardrails** — `ScriptAgent` prompt bakes in "Research suggests / Evidence indicates / Experts generally agree" hedging for health/finance/science/psychology topics.

### 4. Distribution package generation

New `DistributionAgent` (`src/lib/distribution-agent.ts`) produces per-video:
- SEO title (≤60 char) + description (≤160 char)
- Keywords (5–10)
- Hashtags — 3 platform-specific sets (IG, TikTok, YT Shorts, FB)
- Caption — 3 variants sized per platform (IG ≤2200, TikTok ≤300, YT Shorts ≤100, FB ≤400)
- Pinned first comment
- CTA line (from CTA picker)
- Thumbnail concept + prompt (9:16 for shorts, 16:9 for long) → routed through existing Thumbnail Studio.

Stored on the project as `distribution` JSON blob (Supabase `projects` table, new column via migration). Rendered in a new **"Publish Kit"** tab on the project page with copy-to-clipboard per field per platform.

### 5. Quality Review Agent (self-scoring loop)

New `src/lib/quality-review-agent.ts`:
- Runs after full generation. Scores 0–100 across:
  1. Hook strength (≥80 required)
  2. Storytelling coherence (≥75)
  3. Factual/hedging correctness (≥85)
  4. Visual diversity (≥75) — checks repeats in environment/angle/palette
  5. Thumbnail quality (≥75) — checks contrast, subject clarity, text ≤6 words
  6. SEO completeness (≥90) — all distribution fields populated & within limits
  7. CTA suitability (≥75) — matches goal
  8. Retention (≥75) — beat cadence & pattern-interrupt density
- Per-section threshold from a single config const (user can tune later).
- On sub-threshold → regenerate ONLY that section (targeted agent re-run, max 2 attempts). Old drafts discarded; user sees only final output.
- Score panel visible in DEV mode; user-facing view shows only the final asset + a green "Production Quality" badge.

### 6. UI changes

- `src/routes/_authenticated/videos.tsx` — add format toggle (Short/Long), duration presets update based on format, new "Publish Kit" section on project page.
- `src/routes/_authenticated/projects.$id.tsx` — new **Publish Kit** tab with per-platform caption/hashtag/CTA blocks, copy buttons, thumbnail preview.
- Existing carousel/thumbnail routes: unchanged.

## Technical details

- **Storage**: extend `video-job-store.ts` with `format`, `platform`, `distribution`, `qualityReport`. Backend `projects` table gets `distribution jsonb` and `quality_report jsonb` columns via migration (with GRANTs).
- **Models**: `google/gemini-3.5-flash` for classifier/hook/distribution/quality (cheap+fast structured JSON); `google/gemini-2.5-pro` retained for Script + Visual Director (quality). Image models unchanged. AI video clips via existing `/api/generate-video-clip`.
- **Renderer**: `video-renderer.ts` gains `aspectRatio` + `size` params. 9:16 path uses 1080×1920. Motion Director unchanged (already resolution-agnostic).
- **Streaming/limits**: Quality regen loop bounded to 2 attempts per section, hard cap 8 total regenerations per video to avoid runaway cost.
- **Backwards compat**: existing projects default `format: "long"`, empty `distribution` and `qualityReport` render gracefully.

## Files

New: `src/lib/short-video-engine.ts`, `src/lib/distribution-agent.ts`, `src/lib/quality-review-agent.ts`, `src/components/publish-kit-panel.tsx`, one Supabase migration.

Modified: `src/lib/video-agents.ts`, `src/lib/video-ai.functions.ts`, `src/lib/video-renderer.ts`, `src/lib/video-job-store.ts`, `src/routes/_authenticated/videos.tsx`, `src/routes/_authenticated/projects.$id.tsx`.

## Out of scope for v1

- Auto-scheduling / auto-publishing to platforms (kit is copy-paste).
- Voice cloning / custom TTS voices (uses current voice stack).
- A/B testing hooks with real analytics feedback.
