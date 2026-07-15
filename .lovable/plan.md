# CreatorFlow AI → AI Content Operating System (Additive Update)

**Non-negotiable:** No changes to existing auth, credits, billing, subscriptions, renderer, AI provider wiring, current routes, or working generation flows. Everything below is **new** modules plugged into the existing shell (sidebar entries, new routes under `src/routes/_authenticated/*`, new tables, new server fns).

---

## 1. Database (single migration, additive)

New tables (all in `public`, RLS + GRANTs per project rules, scoped to `auth.uid()`; admin CRUD via `has_role(auth.uid(),'admin')` where relevant):

- `strategies` — user_id, project_id (nullable), promoting, product, audience, goal, primary_platform, secondary_platforms[], tone, frequency, plan jsonb (calendar/pillars/hooks/ctas), created/updated.
- `research_reports` — user_id, project_id (nullable), topic, niche, findings jsonb (trends, keywords, faqs, competitors, gaps, intent, pains, hooks[]), sources jsonb.
- `brand_kits` **(already exists — extend via ALTER TABLE only if columns missing)**: add `brand_voice`, `default_cta`, `watermark_url`, `intro_url`, `outro_url`, `keywords text[]`, `is_default bool`. Skip existing columns.
- `project_memory` — project_id (FK), kind (`research|strategy|script|image|voice|video|thumbnail|seo|publish|file|version`), payload jsonb, ref_url, version int, created_at. Append-only log.
- `quality_scores` — project_id, asset_type, scores jsonb (hook, retention, seo, thumbnail, script, cta, overall 0-100), recommendations jsonb, created_at.
- `ai_edits` — project_id, target (`script|caption|title|scene`), target_ref, instruction, before_text, after_text, created_at.
- `repurposed_assets` — source_project_id, format (`shorts|reels|tiktok|linkedin|ig_carousel|fb_post|blog|newsletter|podcast_transcript|x_thread`), content jsonb, status, created_at.
- `analytics_events` — user_id, event (`credit_used|project_created|video_generated|image_generated|published|template_used`), meta jsonb, occurred_at. (Aggregations computed via `read_query` server fns; no materialized view yet.)
- `marketplace_items` — kind (`prompt_pack|template|thumbnail_pack|brand_kit|voice_pack|carousel_pack`), title, slug, description, preview_url, payload jsonb, price_usd_cents (nullable, no payments yet), tier, active, sort. Public read of active; admin CRUD.
- `marketplace_installs` — user_id, item_id, installed_at.

Every new table: GRANT SELECT/INSERT/UPDATE/DELETE to `authenticated` (owner-scoped), GRANT ALL to `service_role`, RLS ON, policies scoped to `auth.uid()`; marketplace public read for `active=true` via `TO authenticated`.

## 2. Server functions (client-safe modules, no edits to existing files)

- `src/lib/strategy.functions.ts` — `generateStrategy(brief)` (Lovable AI Gateway, `openai/gpt-5.5`, structured `Output.object` with prompt-based limits per `ai-sdk-agent-patterns`), CRUD.
- `src/lib/research.functions.ts` — `runResearch(topic, niche, platform)`; uses AI Gateway with web-search style prompt (no live crawl — synthesized from model + optional user seeds). Persists to `research_reports` + `project_memory`.
- `src/lib/agents.functions.ts` — one dispatcher `runAgent({ agentId, projectId, input })`; agent registry in `src/lib/ai-agents.ts` (id, name, persona, icon, system prompt): research, script, thumbnail, video-director, seo, social, sales-copy.
- `src/lib/brand-kit.functions.ts` — get default kit, upsert, list. Applied automatically by a new `applyBrandKit(prompt, kit)` helper reused by carousel/video/image generators via optional param — no changes to existing generators' behavior when kit is absent.
- `src/lib/quality-score.functions.ts` — `scoreAsset({ type, payload })` returns rubric-based scores + recs.
- `src/lib/ai-editor.functions.ts` — `editText({ instruction, text, targetType })` returns rewritten section.
- `src/lib/repurpose.functions.ts` — `repurpose({ projectId, formats[] })` fans out to model per format, writes `repurposed_assets`.
- `src/lib/analytics.functions.ts` — `getDashboard()` reads existing `usage_history`, `projects`, `render_jobs`, `generated_assets`, `scheduled_posts` + new `analytics_events`.
- `src/lib/marketplace.functions.ts` — list active, install (writes `marketplace_installs`), admin CRUD.
- `src/lib/project-memory.functions.ts` — `appendMemory`, `listMemory(projectId)`.

All use `createServerFn` + `requireSupabaseAuth`. Credit deduction via existing `deduct_credits` RPC where a generation occurs (strategy=3, research=5, agent run=2, quality score=1, ai edit=1, repurpose=4/format). No changes to `credit-costs.ts` — new constants file `src/lib/new-costs.ts`.

## 3. Routes (all under `src/routes/_authenticated/`)

- `strategy.tsx` — wizard + generated plan viewer + calendar grid.
- `research.tsx` — new-research form + list of past reports.
- `agents.tsx` — grid of 7 agent cards; click opens chat-style single-shot runner (uses existing chat UI patterns; no thread persistence — one-off runs stored in `project_memory`).
- `brand-kit.tsx` — form for logo upload (existing `renders` bucket under `brand/` prefix), colors, fonts, voice, CTA, watermark, intro/outro, keywords. Default toggle.
- `repurpose.tsx` — pick source project → choose formats → generate; results list with copy/download.
- `analytics.tsx` — 8 stat cards + recent-activity table + top templates/projects (queries existing tables).
- `marketplace.tsx` — public grid, category filter, "Install" (no payments). Admin CMS at `admin.marketplace.tsx`.

Project detail (`projects.$id.tsx`) — add a **Memory** tab showing the timeline from `project_memory` and a **Quality Score** panel; both additive, no existing tab touched.

## 4. Sidebar (`src/components/app-shell.tsx`)

Append new items (do NOT remove existing): Dashboard, **AI Strategy**, **Research**, **Agents**, Projects, Generate (existing `/create`), **Repurpose**, **Brand Kit**, **Marketplace**, **Analytics**, Templates, Settings, Admin (existing groups preserved). Reuse existing active-state logic (longest-prefix wins) — no bug fixes needed there.

## 5. Reusable components

- `src/components/strategy-wizard.tsx`, `strategy-calendar.tsx`
- `src/components/research-report-view.tsx`
- `src/components/agent-card.tsx`, `agent-runner.tsx`
- `src/components/brand-kit-form.tsx`, `brand-kit-preview.tsx`
- `src/components/quality-score-panel.tsx`
- `src/components/ai-editor-inline.tsx` (drop-in for any text field)
- `src/components/repurpose-picker.tsx`, `repurpose-result-card.tsx`
- `src/components/analytics-stat-card.tsx`, `analytics-activity-table.tsx`
- `src/components/marketplace-card.tsx`, `marketplace-install-button.tsx`
- `src/components/project-memory-timeline.tsx`

All styled with existing tokens (glassmorphism, dark theme, `bg-card/50 backdrop-blur`, `border-white/10`, primary gradient). No new global CSS.

## 6. Performance

- Every new route file uses TanStack Query via `queryOptions` + `useSuspenseQuery` (Query is already in the project). Loaders `ensureQueryData`.
- Heavy panels (calendar grid, marketplace grid, analytics charts) are `lazy()` + `Suspense`.
- Marketplace + templates lists paginated (limit 24).
- Analytics dashboard uses one server fn returning a single aggregate payload.

## 7. Safety / backward-compat verification

- No edits to: `client.ts`, `client.server.ts`, `auth-middleware.ts`, `types.ts`, `start.ts`, existing carousel/video/thumbnail/image generators, `razorpay.functions.ts`, `deduct_credits`, `pricing_plans`, `constants.ts` billing, existing routes.
- Migration is additive (CREATE TABLE / minimal ALTER on `brand_kits` guarded by `IF NOT EXISTS`).
- `bun run typecheck` after changes.

## 8. Deliverables report

At the end, list: new tables (10), new server-fn modules (10), new routes (8 + 1 admin), new components (14), sidebar items added (6), and confirm zero modifications to existing generation/billing/auth code paths.

## Out of scope

Marketplace payments, live web scraping for research (model-synthesized only), publishing to new platforms beyond existing connectors, mobile app, real-time collab, character voice cloning.
