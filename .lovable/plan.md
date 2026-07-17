
# Scope for this cycle

Building Phase A + SEO + Image Editing. Video (x3) and Voiceover stay **Beta** with a visible "Provider configuration required" notice on their pages and in the readiness dashboard.

## 1. Phase A — Shared foundation

### 1.1 Database (single migration)
- New `generation_jobs` table with the full status/progress/provider/error/credit fields from the spec, indexed on `(user_id)`, `(project_id)`, `(status)`, `(created_at)`.
- New `feature_readiness` table: one row per feature (`image_editing`, `ai_video`, `short_video`, `long_video`, `voiceover`, `seo_package`) storing the 9 check booleans + `status` + `last_verified_at` + `blockers[]`.
- Reuse existing `credit_ledger` (already atomic). Add `job_id uuid` column on `credit_ledger` so jobs and ledger rows are linked 1:1 for the "don't double-charge on poll" rule.
- Reuse `projects`, `generated_assets`, `asset_library` — no duplicate tables.
- RLS: owner-only on `generation_jobs`; `feature_readiness` readable by authenticated, writable by service_role only.
- Full GRANTs per project convention.

### 1.2 Provider capability registry
- `src/lib/providers/registry.server.ts` — pure server module. Maps capability → provider config (`enabled`, `production`, credential env var name, model, timeout, priority).
- `src/lib/providers/registry.functions.ts` — `getCapabilityStatusFn` returning `{ configured, provider, production }` for the UI (no secret leakage).
- Initial registry:
  - `image_generation`, `image_editing`, `background_removal`, `generative_fill` → Gemini via `LOVABLE_API_KEY` (production=true).
  - `voiceover_generation`, `video_generation` → not configured (production=false).

### 1.3 Generation job service + hook
- `src/lib/generation-jobs.functions.ts` — `createJobFn`, `updateJobFn` (service-role RPC internal), `getJobFn`, `listJobsFn`, `cancelJobFn`, `retryJobFn`. Uses `requireSupabaseAuth`, links to `credit_ledger.job_id`. Reserves credits via existing `reserve_credits` RPC before starting; finalizes on completion; refunds on technical failure only.
- `src/lib/use-generation-job.ts` — polling hook (`useGenerationJob(jobId)` with 2s interval, stops on terminal state), plus `useCreateGenerationJob()`.

### 1.4 Feature readiness system
- `src/lib/feature-readiness.ts` — canonical feature list + check keys + `computeStatus(checks)` returning `available | beta | coming_soon`. `available` requires ALL 9 checks true.
- `src/lib/feature-readiness.functions.ts` — `getFeatureReadinessFn` (public), `runReadinessCheckFn` (admin-only, probes provider registry + does dry-run capability calls).
- `src/routes/_authenticated/admin.readiness.tsx` — admin dashboard: table of features with check states, "Run readiness check" button, blocker reasons, last verified date. Admin-only via `is_admin` RPC guard.
- `src/data/toolComparisonData.ts` — swap hard-coded statuses to read from a server-fetched readiness snapshot at page load, with the hard-coded values as SSR fallback. Landing page still SSR-safe.

## 2. SEO Content Package (production, no fake metrics)

### 2.1 Types
Blog, Product, YouTube, Landing (kept minimal on turn 1; Local / Service / Social behind a "coming soon in this module" chip so we ship what actually works).

### 2.2 Backend
- `src/lib/seo-package.functions.ts` — `generateSeoPackageFn` calling `openai/gpt-5.5` via existing `ai-gateway.server` with strict Zod structured output per content type (title options, meta desc, slug, H1, outline, article, FAQ + schema, alt texts, social copy). Uses generation-job service. Credit cost: 2 for brief-only regen, 5 for full package.
- `regenerateSeoSectionFn` — single-section rewrite (1 credit).
- All keyword output labelled `"aiSuggestion": true` at the schema level; no volume/difficulty numbers.

### 2.3 UI
- `src/routes/_authenticated/seo.tsx` — 5-step wizard (Type → Inputs → Generate → Edit → Export) using existing `GenerationWizard`.
- Section cards with per-section: Copy / Regenerate / Rewrite shorter / Rewrite longer / Tone change.
- Version history via existing `templates.functions.ts` snapshot pattern applied to SEO package rows in `projects.metadata`.
- Export: TXT, Markdown, HTML (client-side). PDF stays out this turn (needs server render).
- Sidebar entry added.

### 2.4 Readiness gate
All 9 checks pass → SEO Package → **Available**.

## 3. Image Editing (production)

### 3.1 Storage
Reuse existing `library` bucket. Two folders per user: `image-edits/originals/` and `image-edits/versions/`. Signed URLs via existing pattern.

### 3.2 Backend
- `src/lib/image-edit.functions.ts` — `uploadOriginalFn` (validates MIME/size/dimensions), `saveEditedVersionFn`, `listVersionsFn`, `generativeEditFn` (Gemini `google/gemini-3.1-flash-image` via existing `generate-image.ts` pipeline, with `--edit-image` semantics — prompt + input URL → new PNG). Uses generation-job service, 1 credit per generative op.
- Background removal: uses Gemini edit with "solid white background" prompt + client-side chroma cleanup (best-effort, labelled as such).

### 3.3 UI (`src/routes/_authenticated/image-edit.tsx`)
- Canvas-based editor built on `<canvas>` + a small history stack (no new deps — keep bundle honest).
- Tools: crop (rect drag), resize, rotate 90°, flip H/V, aspect presets (1:1, 4:5, 9:16, 16:9, LinkedIn, Facebook, custom), brightness / contrast / saturation / blur / sharpen (CSS filters + canvas readback), undo/redo (20 steps), reset.
- Generative panel: BG remove, BG replace prompt, object remove (mask brush → prompt), generative fill (mask + prompt), prompt-based transform, extend/outpaint (prompt + direction).
- Before/after slider, zoom, fit-to-screen, version list on the right rail with "Restore" / "Set as final".
- Export: PNG, JPG (quality slider), WebP, transparent PNG when BG was removed. Custom export dimensions.
- Save to project → creates `generated_assets` row + attaches to selected project.

### 3.4 Readiness gate
- Upload, browser edits, undo/redo, export, save/reopen, download, ≥1 generative op (Gemini prompt-transform) → **Available**.

## 4. Video (x3) + Voiceover — stay Beta this cycle

- Each of `/videos`, `/promo-videos`, `/voiceover` (create if missing) shows an admin-configuration warning banner on top: "This module is in Beta — a production render provider / TTS provider is not configured. Contact admin."
- Generate buttons disabled with tooltip explaining the missing capability, per spec ("Never fall back from failed production generation to mock output").
- Existing user-facing flows keep working in dev/preview but are guarded server-side by `requireCapability("video_generation" | "voiceover_generation")` which returns `provider_not_configured` in production.
- Readiness dashboard shows exact blocker per feature.
- Landing comparison for these 4 stays "Beta" — status now driven by the readiness table, so flipping them later is a data change, not a code change.

## 5. Out of scope this turn (called out explicitly)

- FFmpeg-backed video assembly, hosted render worker, Remotion Lambda.
- Real TTS provider integration.
- Local Business / Service Page / Social Campaign SEO templates (blog/product/youtube/landing only).
- PDF/DOCX export for SEO.
- Voice cloning.
- SEMrush live data (already available as a separate skill; not wired into SEO Package this turn).
- E2E test suite covering every module (the spec's testing block is a full separate cycle).

## 6. Technical details

- Migration is idempotent (`IF NOT EXISTS`, `CREATE POLICY IF NOT EXISTS` via `DO` blocks).
- No new npm packages needed. Uses existing shadcn, tanstack query, sonner, canvas API.
- All server fns use `requireSupabaseAuth`; `supabaseAdmin` loaded inside handlers only.
- No secrets in client bundle. Registry status uses only booleans + provider name.
- Landing page SSR-safe: readiness snapshot server-fn returns fast public data, no auth.

## 7. Deliverable

At the end of this turn I'll report:
- Files changed
- Migration applied
- Which features actually pass readiness (expected: SEO Package + Image Editing → Available; Voiceover + 3 videos → Beta with named blockers)
- Manual test steps

Approve to proceed, or tell me to trim further (e.g. "SEO only this turn").
