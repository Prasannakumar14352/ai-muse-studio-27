## Scope

Four workstreams for the existing CreatorFlow AI (currently branded "CreatorVault AI") project. No unrelated redesigns.

---

### 1. Branding: CreatorVault AI → CreatorFlow AI

**Finding:** ~27 source files contain `CreatorVault` / `creatorvault.ai`. `ProdXStore` already exists as parent company (see `src/assets/prodxstore-*` assets). Nothing renames ProdXStore.

**Changes:**
- Text replace across every user-facing file listed by grep (routes, components, `constants.ts` `BRAND`, `SUPPORT_EMAIL`, `landing-content.ts`, `public-shell`, `app-shell`, `auth.tsx`, `__root.tsx` head/OG/JSON-LD, `styles.css` comments, `pricing.tsx`, `billing.tsx`, `settings.tsx`, `VERCEL_DEPLOYMENT.md`, etc.).
- Update `SUPPORT_EMAIL` to `support@creatorflow.ai` (matches new brand).
- Add "by ProdXStore" tagline under the wordmark in `PublicShell` header, landing footer, auth page, and sidebar workspace header.
- Update Razorpay `description`/`notes` strings in `src/lib/razorpay.functions.ts` (checkout modal + order name) to "CreatorFlow AI".
- Rename demo asset reference logically: keep filename `creatorvault-demo.mp4` (bundled binary can't be re-uploaded from here), but add `src/assets/creatorflow-demo.mp4.asset.json` alias pointer and update all imports/labels/captions/poster alt-text to "CreatorFlow AI demo". Report the filename as an intentionally retained internal identifier.
- Retained internal identifiers to report: the bundled `creatorvault-demo.mp4` binary and its R2 key (cannot re-render from repo agent), plus DB column names / migration filenames (never user-visible).

### 2. Real Premium Templates module

**Finding:** No template system exists — "Premium Templates" is only a pricing bullet today.

**Database migration** (single new table + seed):
- `public.templates` — name, slug, category (enum-like text: `short_video|long_video|product_promo|documentary|carousel|linkedin_post|image|thumbnail|seo_pack`), description, preview_image_url, aspect_ratio, platform, style, default_prompt (text), default_brief (jsonb — scene/slide structure + prefill for existing brief form), tags (text[]), access_tier (`free|starter|creator|pro`), featured (bool), active (bool), sort_order (int), created_by (uuid nullable — null = system seed), timestamps.
- `public.template_favorites` — (user_id, template_id) composite PK.
- GRANTs + RLS: authenticated can SELECT active templates; only admin (`has_role`) can INSERT/UPDATE/DELETE. Favorites: user owns their rows.
- Seed 3+ templates per category (9 categories × 3 = 27 rows) with realistic prompts/briefs.

**Client:**
- `src/lib/templates.functions.ts` — list, get, favorite, admin CRUD server fns.
- `src/lib/template-access.ts` — access rule: free→free, starter/starter_life→free+starter, creator/creator_life→+creator, pro/pro_life→all, admin→all.
- `src/routes/_authenticated/templates.tsx` — grid with category tabs, search, Free/Premium filter, favorites. Locked cards show badge + "Upgrade" CTA linking to `/pricing`. "Use Template" navigates to the matching creation flow (`/create` for videos/images/etc., `/create/carousel` for carousels, `/linkedin-posts/new` for LinkedIn) with `?template=<slug>` query. Read `template` param in `project-brief-form.tsx` and prefill via `templates.functions.ts` `getTemplate`.
- `src/routes/_authenticated/admin.templates.tsx` — admin CRUD, mark free/premium/pro, featured toggle, sort_order reorder, activate/deactivate, thumbnail upload (uses existing `renders` storage bucket at new prefix `templates/`).
- Sidebar entry "Templates" in `app-shell.tsx`.

### 3. Landing pricing tabs

- Replace flat grid in `src/routes/index.tsx` "Pricing" section with a `LandingPricingSection` component that mounts tabs (Subscription / Lifetime), reusing `MONTHLY_PLANS` / `LIFETIME_PLANS` from `constants.ts` — same source as `/pricing`.
- Include the concise bullet transformer + comparison block + Credit-packs section (reusing `<TopupPacks />`; for public users the checkout button routes to `/auth?next=/pricing`).
- Ensure `pricing.tsx` and landing both read `MONTHLY_PLANS` / `LIFETIME_PLANS` from `constants.ts` (already the case for `pricing.tsx`).

### 4. Demo video refresh

- The bundled MP4 binary can't be re-rendered by this agent, so:
  - Rewrite `DemoVideoSection` in `landing-sections.tsx` with new title "See CreatorFlow AI in action", new 10-step storyboard captions, updated poster, no autoplay, `preload="metadata"`, `loading="lazy"` iframe pattern, `<track>` placeholder for captions.
  - Generate a new poster PNG via imagegen matching CreatorFlow AI dark/orange-pink theme with sidebar mockup.
  - Update `remotion-demo/src/MainVideo.tsx` + `Root.tsx` to reflect current UI (dashboard → content type → Review & Edit blueprint → generate → templates → pricing tabs → CTA), driven by the current theme tokens. Provide the exact render command in the final report: `cd remotion-demo && bun install && bun run render`.
  - Do NOT claim a new MP4 was rendered. Existing MP4 remains served until the user runs the render step and replaces `/mnt/user-uploads/creatorvault-demo.mp4` (or the CDN asset).

### 5. Acceptance / verification

- `rg -i "creatorvault|creator vault"` returns only the retained internal identifiers list.
- Typecheck passes.
- Manual smoke: landing tabs render both sets; `/pricing` unchanged in behavior; template card → creation flow prefills; admin templates CRUD works; Razorpay modal shows "CreatorFlow AI".

## Technical details

- Migration order per project rules: CREATE TABLE → GRANT → ALTER ENABLE RLS → CREATE POLICY. `templates` gets SELECT to `authenticated` (filtered by `active=true` policy) + ALL to `service_role`; INSERT/UPDATE/DELETE gated by `has_role(auth.uid(),'admin')`. `template_favorites` scoped to `auth.uid()`.
- Template `default_brief` jsonb shape matches `project-brief-form.tsx` inputs (topic, tone, platform, style, aspect_ratio, scenes[]) so prefill is a shallow merge.
- `project-brief-form.tsx` reads `useSearch({ from: '__root__' })` `template` param on mount; if present, calls `getTemplate({ slug })` and merges into form state before first render (guarded by hydration flag to avoid mismatch).
- Access enforcement: `template-access.ts` returns `canUse(template, access)`; server fn `useTemplate` re-checks server-side before returning prefill payload — locked users get 403.
- Landing pricing "Contact Sales" and "Get Started" CTAs point to `/contact` and `/auth` respectively; authenticated users see "Open app" per existing `PublicShell` pattern.
- Sidebar highlighting: add `/templates` to sidebar items list; existing `useRouterState` match handles active state.

## Out of scope

- No changes to billing math, credit consumption order, Razorpay integration internals, existing generation pipelines, or auth flow.
- No re-render of the bundled demo MP4 binary from this agent — the Remotion source will be updated and ready to render.

## Deliverables report (after implementation)

Will include: pre-existing template state (none), file list, migration summary, branding replacements count, template access matrix, landing pricing diff, demo work vs remaining render step, test steps, known limitations.
