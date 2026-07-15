# Unified AI Generation Wizard

Goal: every generation module (Videos, Carousels, Images, Thumbnails, LinkedIn Posts, Captions) uses the same 5-step wizard and the same "planning-first, editable-plan" experience — so the app feels like one platform instead of six separate generators.

Thumbnails already follows this pattern (Plan → Brief → Generate). We'll lift its shape into a reusable primitive and retrofit the other modules.

---

## 1. Shared wizard primitive

New files:
- `src/components/wizard/GenerationWizard.tsx` — controlled 5-step shell: `Plan → Review → Generate → Preview → Export`. Renders step header, progress, Back/Next, and slot per step.
- `src/components/wizard/PlanEditor.tsx` — generic editor for a plan object: renders each section as an editable card with **Edit / Rewrite / Regenerate section / Delete / Add**.
- `src/components/wizard/AssetActions.tsx` — post-generation action bar: **Duplicate / Edit / Regenerate / Save / Export / Publish / History**.
- `src/lib/plan-store.ts` — localStorage-backed store keyed by `{module, projectId}` persisting `{originalPrompt, aiPlan, editedPlan, result, exports[]}` + version history.

## 2. Planning server functions

One `createServerFn` per module producing a typed, editable plan JSON via `gatewayChatText` (structured output). Naming: `plan<Module>Fn`.

New / extended files:
- `src/lib/video-plan.functions.ts` — outline, script, scenes, image prompts, video prompts, VO, captions, CTA.
- `src/lib/carousel-plan.functions.ts` — slide titles, slide content, image prompts, CTA, caption, hashtags.
- `src/lib/image-plan.functions.ts` — positive/negative prompt, composition, camera, lighting, colors.
- `src/lib/linkedin-plan.functions.ts` — hook, story, CTA, first comment, hashtags.
- `src/lib/caption-plan.functions.ts` — 3 caption variants, hooks, CTAs, hashtag pack.
- Reuse existing `src/lib/thumbnail-planner.functions.ts` (already conformant).

Each also exposes `regenerateSectionFn({plan, section, instruction})` so the PlanEditor's per-section "Regenerate" works without redoing the whole plan.

## 3. Route retrofits

Each module route is rewritten to mount `<GenerationWizard>` with module-specific step content. Existing generation logic stays — we only move it behind the wizard's "Generate" step.

- `src/routes/_authenticated/videos.tsx`
- `src/routes/_authenticated/carousels.tsx` (and `create_.carousel.tsx`)
- `src/routes/_authenticated/images.tsx`
- `src/routes/_authenticated/thumbnails.tsx` — already 2-step; wrap into 5-step shell, no logic changes.
- `src/routes/_authenticated/linkedin-posts.new.tsx`
- `src/routes/_authenticated/captions.tsx`

## 4. Persistence

Every wizard writes to `project_memory` (existing table) with `kind: 'wizard:<module>'` and payload `{originalPrompt, aiPlan, editedPlan, result, exports}`. Version history reads back the last N entries for the same project+module. Local draft mirrored to `plan-store.ts` so refresh doesn't lose in-progress plans.

## 5. Post-generation actions

`AssetActions` wires to existing helpers where they exist (download, publish-kit, repurpose), and to new lightweight ones where they don't (Duplicate = clone plan into a new draft; History = list previous `project_memory` entries).

## 6. Design

Reuse existing glass/dark tokens. No new theme. Wizard step bar uses the same pill styling as the current thumbnails/strategy wizards for visual consistency.

---

## Technical notes

- No schema changes. `project_memory` already accepts arbitrary `payload jsonb`.
- Planning fns follow `.middleware([requireSupabaseAuth])` and default `platforms: {}` guard (same fix as publish-kit) to survive model omissions.
- Wizard is client-only; server fns are called via `useServerFn`.
- Credits: planning uses the existing `deduct_credits` RPC with a small planning cost (configurable via `credit-costs.ts`); final Generate keeps its current cost.
- Typecheck (`bunx tsgo --noEmit`) must pass before finishing.

## Out of scope

- No changes to auth, billing, credits math, Razorpay, webhooks, rendering pipeline, or AI providers.
- No redesign of branding, sidebar, or route structure beyond the wizard mount.
- Marketplace/Analytics/Brand Kit modules untouched (not generation modules).

## Deliverable order

1. Wizard primitives + plan store + shared PlanEditor/AssetActions.
2. Planning server fns for all six modules (parallel).
3. Retrofit routes one module at a time, starting with Images (simplest) and ending with Videos (most complex).
4. Typecheck, then a short summary of files changed.
