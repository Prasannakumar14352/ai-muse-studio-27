# Design: Promo Studio v1 (admin-only static creatives)

- **Spec:** `.claude/team/specs/promo-studio.md` (v1 scope only: image, carousel, static story; no video, no landing showcase)
- **Author:** architect, 2026-11-26
- **Base branch:** `main` **after** `fix/credit-integrity-c1-c4` merges. This design assumes that state: `profiles` columns locked, no user writes on `subscriptions`, `refundCreditsFn` deleted, refunds only on `reserved` rows, and `alertAdmins` resolving admins through `user_roles`. It does not touch any file that branch changes, except one additive link in `admin.index.tsx`, made after the merge.
- **SPK decisions applied:**
  - Money: $10/month hard cap with an alert at 80%, $1.00 per-request cap, a budget separate from Agent HQ, and flux/schnell at ≤1 MP only. These are stored as **admin-editable server-side settings**, with these values as the defaults.
  - Non-money: keep the spec name, schedule straight into `scheduled_posts`, warn only on duplicate posts, ship after C1–C4, add UTM tags to the app URL, support en/te/hi as text, keep archived creatives (no delete).
- **Security-auditor sign-off is required** (admin path that charges no credits, new RLS, storage policy).

---

## 1. Existing code map

| Area | File / object | Relevance |
|---|---|---|
| Auth middleware | `src/integrations/supabase/auth-middleware.ts` (`requireSupabaseAuth`; auto-generated, don't edit) | First link of every chain |
| Token attach | `src/start.ts` → `attachSupabaseAuth` (global function middleware) | Server fns get the bearer token automatically |
| Admin check (pattern to copy) | `src/lib/admin-users.functions.ts:12-17` `adminDb()`: `supabaseAdmin.rpc("has_role", …)` then `"Forbidden: admin only"` | **Chosen pattern.** It uses the service role, so it doesn't depend on the `has_role` EXECUTE grant to `authenticated`, which has flipped 4 times in migrations. Six other files copy an `assertAdmin` that uses `context.supabase` (agent-hq, social-plan, oauth-admin, …); Promo Studio does not add a seventh copy. |
| Wrong admin source (do not use) | `src/lib/access.ts:8` `ADMIN_EMAIL`, `useAccess().isAdmin` (reads `profiles.is_admin`) | Every existing `admin.*.tsx` route guards with it. Promo Studio must not. |
| Admin routes | `src/routes/_authenticated/admin.tsx` (layout `<Outlet/>`), `admin.index.tsx`, `admin.offers.tsx`, … with `createFileRoute("/_authenticated/admin/offers")` | Naming to match: `admin.promo-studio.tsx` → `/_authenticated/admin/promo-studio` |
| Auth layout | `src/routes/_authenticated/route.tsx` (`ssr: false`, `beforeLoad` resolves the session) | Child `beforeLoad` runs in the browser, so it can call a server fn |
| Paid image route | `src/routes/api/generate-image.ts` (charges via `chargeCredits`, inner `callFal` at lines 170-177) | Extraction source for the fal helper |
| fal queue helper | `src/lib/fal.server.ts` (`falSubmit`/`falPoll`, queue API, Model Studio) | Not used: v1 needs a sync call, not the queue |
| Text provider switch | `src/lib/ai-provider.ts` `aiChatFetch()` / `aiKey()` | Base of the new OpenRouter JSON helper |
| Agent LLM helper | `src/lib/agents/core.server.ts:136` `agentJson` (returns `usage.cost` via `usage:{include:true}`) | Pattern for cost capture. Left unchanged. |
| Honesty rules / product facts | `src/lib/agents/marketing.server.ts:45` `HONESTY_RULES`; `src/lib/agents/support-kb.ts` `liveKb(db)` | Prompt inputs (C8) |
| Admin alerts | `core.server.ts:83` `alertAdmins` (uses `user_roles` on the C1–C4 branch) | I7 80% alert |
| Offers | table `offers` (`20261119200000_offers.sql`); `src/lib/offers.server.ts` `offerLabel()`, private `isLive()` | Offer picker, snapshot, live re-checks |
| Scheduling | `src/lib/publishing.functions.ts:74` `schedulePost`, `platformMediaProblem()` (exported), connection lookup inline at lines 93-97 | G2 must reuse this validation |
| Publish worker | `src/lib/social-publish.server.ts` `runPublishJob`/`runDuePublishJobs`; cron in `20261117140000_social_publishing_worker.sql` | No change. It re-signs storage URLs (`resolveMedia`, line 80), and IG carousels are supported (line 383). |
| Content plan | table `content_plan_items` (`20261120160000_content_plan.sql`); `src/lib/social-plan.functions.ts` (`createPlanMediaUpload` signed-upload pattern, `attachPlanMedia` 45-day signing) | Weekly pack source; upload pattern |
| Plan helpers | `src/lib/agents/content-plan.server.ts` `istToday()`, `istToUtcIso()` | IST date math for the weekly pack and schedule dialog |
| Storage | private bucket `renders`, policies `20260706072636_*.sql` (owner = first folder) | Promo paths: `<adminId>/promo-studio/{brand,assets,bg,out}/…` |
| Overlay precedent | `html-to-image` `toPng` in `linkedin-carousel-studio.tsx:172`, `slide-editor.tsx`; Noto loader in `src/lib/text-overlay.ts` | Render approach |
| Rate-limit precedent | `src/lib/stock-media.server.ts:90` (count rows in window, then insert) | Not race-safe; Promo uses an RPC with a lock instead |
| Deps present | `html-to-image ^1.11.13`, `jszip ^3.10.1`, `zod ^3.24.2` | **No new npm dependencies** |

---

## 2. Changes, file by file

### 2.1 New files

| File | Responsibility |
|---|---|
| `supabase/migrations/20261127090000_promo_studio.sql` | Tables, RLS, grants, triggers, RPCs (§3) |
| `supabase/migrations/20261127090100_promo_studio_storage.sql` | Restrictive storage policy for `renders/*/promo-studio/*` (§3.6). Kept separate so it can be reverted alone. |
| `src/lib/require-admin.ts` | `requireAdmin` function middleware (§4.1). Reusable by any admin fn. |
| `src/lib/providers/fal-image.server.ts` | `falRunSync(endpoint, input, opts?)`: the raw `https://fal.run/<ep>` POST, moved verbatim from `generate-image.ts`. No auth, no charging. |
| `src/lib/providers/openrouter-json.server.ts` | `openrouterJson({...})`: one JSON-mode chat call through `aiChatFetch`, with timeout, `usage:{include:true}`, `max_tokens`, reasoning off. Returns `{ data, usage, requestId, model }`. No auth, no charging. |
| `src/lib/promo-studio/prices.server.ts` | `PROMO_PRICES` (per-unit USD) + `estimateCopyUsd()`, `estimateBackgroundUsd()`, `estimateRequestUsd()` |
| `src/lib/promo-studio/budget.server.ts` | `withSpend(ctx, meta, est, fn)`: reserve via RPC, run the provider call, settle (§5). The only way Promo code reaches a provider. |
| `src/lib/promo-studio/settings.server.ts` | Load/save the `promo_settings` singleton; `liveOffer()` (shares one `isOfferLive` with `offers.server.ts`, see 2.2) |
| `src/lib/promo-studio/copy.server.ts` | Prompt build (HONESTY_RULES + `liveKb` + template brief + language), zod schema for the copy JSON, script check (te/hi), soft lint for prices/codes |
| `src/lib/promo-studio/background.server.ts` | flux/schnell call at ≤1 MP sizes, upload to storage |
| `src/lib/promo-studio/creatives.server.ts` | Insert creatives, transition helper (`TRANSITIONS` table), scheduled→posted sync, signed-URL batching |
| `src/lib/promo-studio/weekly-pack.server.ts` | Read plan items, map them (H2–H4), find duplicates (H6), estimate |
| `src/lib/promo-studio/constants.ts` | Shared client+server enums: templates, formats, sizes, languages, feature tags, `SIZE_PX`, statuses. No secrets. |
| `src/lib/promo-studio.functions.ts` | **All** Promo Studio `createServerFn`s (§4). Each one is `.middleware([requireSupabaseAuth, requireAdmin])`. |
| `src/routes/_authenticated/admin.promo-studio.tsx` | Route `/_authenticated/admin/promo-studio`. `beforeLoad` guard via a server fn; lazy page component. |
| `src/components/promo-studio/PromoStudioPage.tsx` | Tabs: Create / Library / Brand Kit, plus `BudgetWidget` in the header |
| `src/components/promo-studio/BudgetWidget.tsx` | I3 |
| `src/components/promo-studio/CreateTab.tsx`, `WeeklyPackDialog.tsx` | Options, estimate line, generate loop, pack progress |
| `src/components/promo-studio/LibraryTab.tsx`, `CreativeDrawer.tsx`, `ScheduleDialog.tsx` | E, F, G |
| `src/components/promo-studio/BrandKitTab.tsx` | B1–B6, budget settings |
| `src/components/promo-studio/templates/PromoCanvas.tsx` | Fixed-pixel root (`width`/`height` from `SIZE_PX`), brand CSS variables, `data-render-root` |
| `.../templates/FeatureSpotlight.tsx`, `OfferFestival.tsx`, `BeforeAfter.tsx` | The 3 templates. Each exports `{ id, needsScreenshot, slideLayouts, render(props) }`. |
| `.../templates/DeviceFrame.tsx` | Phone / browser mockup (`public/promo-mockups/*.svg`) with the screenshot clipped inside |
| `.../templates/FitText.tsx` | Auto-shrink to a 70% minimum; reports `overflow=true` up so the editor shows "Headline too long, shorten it" (D3) |
| `.../templates/OfferChip.tsx`, `BrandLogo.tsx`, `CtaButton.tsx` | Shared parts |
| `src/components/promo-studio/render.ts` | `renderCreative(node, size)` → `{ png: Blob, jpg: Blob }[]` per slide (§8) |
| `src/components/promo-studio/fonts.ts` | Loads the self-hosted woff2 files, builds the `fontEmbedCSS` string (data URLs) |
| `public/promo-fonts/NotoSans-{Bold,Black}.woff2`, `NotoSansTelugu-Bold.woff2`, `NotoSansDevanagari-Bold.woff2`, `OFL.txt` | Static assets (SIL OFL 1.1), about 350 KB total. Fetched only on this route. Not an npm dependency. |
| `public/promo-mockups/phone.svg`, `browser.svg` | Mockup frames (hand-made SVG, no third-party art) |
| `tests/promo-studio/*.test.ts` | Using vitest if the C1–C4 branch added it (§8). Otherwise they wait for H13. |

### 2.2 Modified files (exact boundaries)

**`src/routes/api/generate-image.ts`: fal call only.**
- Replace the inner closure at lines 170-177:
  ```ts
  const callFal = async (ep: string, body: Record<string, unknown>) => {
    const res = await fetch(`https://fal.run/${ep}`, { method: "POST", headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { res, out: (await res.json().catch(() => ({}))) as FalOut };
  };
  ```
  with:
  ```ts
  const { falRunSync } = await import("@/lib/providers/fal-image.server");
  const callFal = (ep: string, body: Record<string, unknown>) => falRunSync(ep, body); // no opts → no timeout, identical behaviour
  ```
- `falRunSync` returns the same `{ res, out }` shape and reads `process.env.FAL_KEY`. The route still checks `key` at line 58 before charging.
- **Everything else in the file stays byte-for-byte the same:** the request parsing, `chargeCredits` (lines 150-167), every `reservation.refund(...)`, `reservation.finalize()`, the Kontext retry and the response shape.
- **No new request field is read.** Code review checks the diff is ≤10 lines and touches only that closure.
- `FalOut` moves to the helper as an exported type, and the route imports it.

**`src/lib/publishing.functions.ts`: extract the connection check, no behaviour change.**
- Add an exported, non-serverFn helper made of lines 93-97, moved verbatim:
  ```ts
  export async function assertPublishConnection(supabase, userId, platform, connectionId): Promise<{ id: string }>
  ```
- `schedulePost` calls it. The query and the error text stay identical.
- `schedulePromoCreative` calls `platformMediaProblem()` and `assertPublishConnection()`. That is the "reuse, not copy" required by G2.4.

**`src/lib/offers.server.ts`: export `isLive`.** Rename it to the exported `isOfferLive(o, now?)` and keep a local alias, so no call site changes. Promo Studio uses the same definition of "live" as checkout.

**`src/routes/_authenticated/admin.index.tsx`:** add one `<Link to="/admin/promo-studio">Promo Studio</Link>` next to "Payment Settings". This is done **after** the C1–C4 merge (that branch modifies this file). It is additive only.

**`src/integrations/supabase/types.ts`:** regenerate it after the migration (`supabase gen types`) so the promo tables are typed. If regeneration is blocked, use local row types in `constants.ts` plus `as never` on writes, the existing project pattern. Don't add more `as never` than needed.

**Not changed (explicitly):** `api/tts.ts`, `api/generate-video-clip.ts`, `credits-guard.*`, `access.ts`, `core.server.ts`, `social-publish.server.ts`, the publish cron, `schedulePost`'s behaviour, `content_plan_items` writes, and every `*.functions.ts` outside the two listed above.

---

## 3. Data (migration sketch)

### 3.1 `20261127090000_promo_studio.sql`

```sql
-- Promo Studio v1: admin-only marketing creatives. Company spend, never user credits.
-- All writes go through server functions (service role) after has_role(). Clients: admin SELECT only.

-- ---------- settings (singleton) ----------
CREATE TABLE IF NOT EXISTS public.promo_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT true,                 -- kill switch (§9)
  logo_path text,
  colors jsonb NOT NULL DEFAULT '{"primary":"#7C3AED","secondary":"#0EA5E9","accent":"#F59E0B","text":"#FFFFFF"}',
  app_url text NOT NULL DEFAULT 'https://creatorflowai.prodxstore.com',
  default_cta text NOT NULL DEFAULT 'Start free',
  offer_id uuid REFERENCES public.offers(id) ON DELETE SET NULL,
  -- money (SPK-approved defaults, admin-editable)
  monthly_cap_usd numeric(10,2) NOT NULL DEFAULT 10.00 CHECK (monthly_cap_usd >= 0 AND monthly_cap_usd <= 500),
  per_request_cap_usd numeric(10,2) NOT NULL DEFAULT 1.00 CHECK (per_request_cap_usd > 0 AND per_request_cap_usd <= 25),
  rate_10m integer NOT NULL DEFAULT 40 CHECK (rate_10m BETWEEN 1 AND 500),
  rate_24h integer NOT NULL DEFAULT 300 CHECK (rate_24h BETWEEN 1 AND 5000),
  bg_models text[] NOT NULL DEFAULT ARRAY['fal-ai/flux/schnell'],  -- server ALSO intersects with a code allowlist
  bg_max_megapixels numeric(4,2) NOT NULL DEFAULT 1.00 CHECK (bg_max_megapixels > 0 AND bg_max_megapixels <= 1.00),
  cap_alerted_month date,                                 -- first day of month an 80% alert was sent
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.promo_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ---------- screenshot library ----------
CREATE TABLE IF NOT EXISTS public.promo_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'screenshot' CHECK (kind IN ('screenshot')),   -- phase 2 adds 'recording'
  path text NOT NULL CHECK (path ~ '^[0-9a-f-]{36}/promo-studio/assets/[0-9a-f-]{36}\.(png|jpg|webp)$'),
  label text NOT NULL DEFAULT '' CHECK (char_length(label) <= 80),
  feature_tag text NOT NULL DEFAULT 'other' CHECK (feature_tag IN
    ('images','carousels','thumbnails','video','voice','captions','research','planner','pricing','other')),
  width integer, height integer,
  archived_at timestamptz,                                -- "delete from library" = soft delete (no data deletion)
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS promo_assets_tag_idx ON public.promo_assets (feature_tag, created_at DESC) WHERE archived_at IS NULL;

-- ---------- creatives ----------
CREATE TABLE IF NOT EXISTS public.promo_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  template text NOT NULL CHECK (template IN ('feature_spotlight','offer_festival','before_after')),
  format text NOT NULL CHECK (format IN ('image','carousel','story')),
  size text NOT NULL CHECK (size IN ('4:5','1:1','9:16')),
  language text NOT NULL CHECK (language IN ('en','te','hi')),
  variant_index smallint NOT NULL CHECK (variant_index BETWEEN 0 AND 3),
  hook text NOT NULL, headline text NOT NULL,
  slides jsonb NOT NULL DEFAULT '[]',                     -- [{title, body}] for carousel
  cta text NOT NULL, caption text NOT NULL, hashtags text[] NOT NULL DEFAULT '{}',
  copy_warnings jsonb NOT NULL DEFAULT '[]',              -- soft lint (§6.1), shown in drawer
  offer_id uuid REFERENCES public.offers(id) ON DELETE SET NULL,
  offer_code text, offer_label text, offer_ends_at timestamptz,   -- frozen snapshot
  asset_ids uuid[] NOT NULL DEFAULT '{}',
  before_path text,                                       -- before→after "before" upload (if not a library asset)
  background_path text,
  output_paths text[] NOT NULL DEFAULT '{}',              -- PNG per slide (download)
  publish_paths text[] NOT NULL DEFAULT '{}',             -- JPEG per slide (Instagram needs JPEG)
  render_version integer NOT NULL DEFAULT 0,
  text_version integer NOT NULL DEFAULT 1,                -- bumped on every text edit
  rendered_text_version integer,                          -- text_version the current output was rendered from
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','scheduled','posted','archived')),
  approved_by uuid REFERENCES auth.users(id), approved_at timestamptz,
  scheduled_post_ids uuid[] NOT NULL DEFAULT '{}',
  schedule_note text,                                     -- "Post failed: …" (G6)
  plan_item_id uuid REFERENCES public.content_plan_items(id) ON DELETE SET NULL,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (format <> 'story' OR size = '9:16'),
  CHECK (format <> 'carousel' OR jsonb_array_length(slides) BETWEEN 3 AND 7)
);
CREATE INDEX IF NOT EXISTS promo_creatives_list_idx ON public.promo_creatives (status, created_at DESC);
CREATE INDEX IF NOT EXISTS promo_creatives_batch_idx ON public.promo_creatives (batch_id);
CREATE INDEX IF NOT EXISTS promo_creatives_plan_idx ON public.promo_creatives (plan_item_id) WHERE plan_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS promo_creatives_sched_idx ON public.promo_creatives USING gin (scheduled_post_ids) WHERE status = 'scheduled';

-- ---------- cost log (append-only; single settle of a pending row) ----------
CREATE TABLE IF NOT EXISTS public.promo_cost_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  creative_id uuid REFERENCES public.promo_creatives(id) ON DELETE SET NULL,
  batch_id uuid,
  step text NOT NULL CHECK (step IN ('copy','background','video','voice','transcode')),
  provider text NOT NULL CHECK (provider IN ('openrouter','fal')),
  model text NOT NULL,
  units numeric, unit_type text CHECK (unit_type IN ('input_tokens+output_tokens','megapixels','images','characters','seconds')),
  est_usd numeric(12,6) NOT NULL CHECK (est_usd >= 0),
  actual_usd numeric(12,6),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','settled')),
  ok boolean, error text,
  provider_request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
CREATE INDEX IF NOT EXISTS promo_cost_log_admin_time_idx ON public.promo_cost_log (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS promo_cost_log_time_idx ON public.promo_cost_log (created_at DESC);
CREATE INDEX IF NOT EXISTS promo_cost_log_creative_idx ON public.promo_cost_log (creative_id) WHERE creative_id IS NOT NULL;

-- ---------- audit (settings changes, status transitions) ----------
CREATE TABLE IF NOT EXISTS public.promo_audit (
  id bigserial PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,                                   -- 'settings.update','creative.transition','creative.edit',…
  target_id uuid,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS promo_audit_time_idx ON public.promo_audit (created_at DESC);
```

### 3.2 RLS and grants (all five tables)

```sql
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['promo_settings','promo_assets','promo_creatives','promo_cost_log','promo_audit'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins read %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Admins read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''admin''))', t);
  END LOOP;
END $$;
REVOKE USAGE, SELECT ON SEQUENCE public.promo_audit_id_seq FROM anon, authenticated;
```

- There are **no** INSERT/UPDATE/DELETE policies, and no write grants to `authenticated`. A non-admin sees 0 rows; any client write fails with 42501, admins included (A5).
- The server writes with `supabaseAdmin` after `requireAdmin`.

### 3.3 Guards in SQL (defence in depth: they hold even for the service role)

```sql
-- promo_cost_log: no DELETE ever; UPDATE only to settle a pending row once, only settle columns.
CREATE OR REPLACE FUNCTION public.tg_promo_cost_log_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'promo_cost_log is append-only' USING ERRCODE = '42501'; END IF;
  IF OLD.state <> 'pending' OR NEW.state <> 'settled'
     OR (NEW.id, NEW.admin_id, NEW.batch_id, NEW.step, NEW.provider, NEW.model, NEW.est_usd, NEW.created_at)
        IS DISTINCT FROM (OLD.id, OLD.admin_id, OLD.batch_id, OLD.step, OLD.provider, OLD.model, OLD.est_usd, OLD.created_at)
     OR (OLD.creative_id IS NOT NULL AND NEW.creative_id IS DISTINCT FROM OLD.creative_id) THEN
    RAISE EXCEPTION 'promo_cost_log rows can only be settled once' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER promo_cost_log_guard BEFORE UPDATE OR DELETE ON public.promo_cost_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_promo_cost_log_guard();
-- No exception branch: per §3.4, a batch's copy cost is split across its variants by batch_id,
-- so creative_id is never backfilled on settled rows. (CHIEF correction, 2026-11-26.)

-- promo_creatives: status state machine (server fn gives friendly errors first; this is the backstop).
CREATE OR REPLACE FUNCTION public.tg_promo_creatives_transition() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'promo creatives are never deleted in v1' USING ERRCODE = '42501'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN RAISE EXCEPTION 'creatives are created as draft' USING ERRCODE = '42501'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'posted' THEN RAISE EXCEPTION 'posted creatives are final' USING ERRCODE = '42501'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status, NEW.status) IN (
      ('draft','approved'), ('approved','draft'), ('approved','scheduled'), ('scheduled','approved'),
      ('scheduled','posted'), ('approved','posted'), ('draft','archived'), ('approved','archived'),
      ('archived','draft')) THEN
    RAISE EXCEPTION 'Can''t move a % creative to %.', OLD.status, NEW.status USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'approved' AND OLD.status = 'draft'
     AND (cardinality(NEW.output_paths) = 0 OR NEW.rendered_text_version IS DISTINCT FROM NEW.text_version) THEN
    RAISE EXCEPTION 'Render the creative before approving it' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER promo_creatives_transition BEFORE INSERT OR UPDATE OR DELETE ON public.promo_creatives
  FOR EACH ROW EXECUTE FUNCTION public.tg_promo_creatives_transition();
```

Note: the spec table allows "Scheduled → Archived (only after cancelling)". That is Scheduled → Approved → Archived, so a direct `scheduled → archived` edge is deliberately absent.

### 3.4 Budget + rate-limit RPCs (atomic)

```sql
CREATE OR REPLACE FUNCTION public.promo_reserve_spend(
  _admin uuid, _step text, _provider text, _model text, _est numeric,
  _batch uuid, _creative uuid, _units numeric, _unit_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.promo_settings%ROWTYPE; _spent numeric; _n10 int; _n24 int; _oldest timestamptz; _id uuid;
BEGIN
  -- One global lock serialises all Promo reservations (low volume; holds for ~1 ms).
  PERFORM pg_advisory_xact_lock(hashtext('promo_studio_budget'));
  SELECT * INTO s FROM public.promo_settings WHERE id = 1;
  IF NOT s.enabled THEN RETURN jsonb_build_object('ok', false, 'code', 'disabled'); END IF;
  IF NOT public.has_role(_admin, 'admin') THEN RETURN jsonb_build_object('ok', false, 'code', 'forbidden'); END IF;

  SELECT count(*) FILTER (WHERE created_at > now() - interval '10 minutes'),
         count(*),
         min(created_at) FILTER (WHERE created_at > now() - interval '10 minutes')
    INTO _n10, _n24, _oldest
    FROM public.promo_cost_log WHERE admin_id = _admin AND created_at > now() - interval '24 hours';
  IF _n10 >= s.rate_10m THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rate', 'retry_after_s',
      GREATEST(60, extract(epoch FROM (_oldest + interval '10 minutes' - now()))::int));
  END IF;
  IF _n24 >= s.rate_24h THEN RETURN jsonb_build_object('ok', false, 'code', 'rate', 'retry_after_s', 3600); END IF;

  -- Pending rows count at their estimate; settled rows at actual (fallback estimate).
  SELECT coalesce(sum(coalesce(actual_usd, est_usd)), 0) INTO _spent
    FROM public.promo_cost_log WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  IF _spent + _est > s.monthly_cap_usd THEN
    RETURN jsonb_build_object('ok', false, 'code', 'budget', 'cap', s.monthly_cap_usd, 'spent', _spent);
  END IF;

  INSERT INTO public.promo_cost_log (admin_id, creative_id, batch_id, step, provider, model, units, unit_type, est_usd)
  VALUES (_admin, _creative, _batch, _step, _provider, _model, _units, _unit_type, _est) RETURNING id INTO _id;
  RETURN jsonb_build_object('ok', true, 'id', _id, 'spent_after', _spent + _est, 'cap', s.monthly_cap_usd,
    'alert', (_spent + _est) >= 0.8 * s.monthly_cap_usd
             AND (s.cap_alerted_month IS NULL OR s.cap_alerted_month < date_trunc('month', now())::date));
END $$;

CREATE OR REPLACE FUNCTION public.promo_settle_spend(
  _id uuid, _ok boolean, _actual numeric, _units numeric, _error text, _request_id text, _creative uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.promo_cost_log
     SET state = 'settled', ok = _ok, actual_usd = _actual, units = coalesce(_units, units),
         error = left(_error, 500), provider_request_id = _request_id,
         creative_id = coalesce(creative_id, _creative), settled_at = now()
   WHERE id = _id AND state = 'pending';
$$;

-- Claim the once-a-month 80% alert (returns true for exactly one caller).
CREATE OR REPLACE FUNCTION public.promo_claim_cap_alert() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.promo_settings SET cap_alerted_month = date_trunc('month', now())::date
   WHERE id = 1 AND (cap_alerted_month IS NULL OR cap_alerted_month < date_trunc('month', now())::date)
  RETURNING true;
$$;

-- Recompute a creative's cost from its log rows (I2).
CREATE OR REPLACE FUNCTION public.promo_refresh_creative_cost(_creative uuid) RETURNS numeric LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.promo_creatives c SET cost_usd = coalesce((
    SELECT sum(coalesce(actual_usd, est_usd)) FROM public.promo_cost_log l WHERE l.creative_id = _creative), 0)
  WHERE c.id = _creative RETURNING c.cost_usd;
$$;

REVOKE ALL ON FUNCTION public.promo_reserve_spend(uuid,text,text,text,numeric,uuid,uuid,numeric,text),
                       public.promo_settle_spend(uuid,boolean,numeric,numeric,text,text,uuid),
                       public.promo_claim_cap_alert(), public.promo_refresh_creative_cost(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promo_reserve_spend(uuid,text,text,text,numeric,uuid,uuid,numeric,text),
                          public.promo_settle_spend(uuid,boolean,numeric,numeric,text,text,uuid),
                          public.promo_claim_cap_alert(), public.promo_refresh_creative_cost(uuid)
  TO service_role;
```

- **Why an advisory lock plus a pending row:** two concurrent requests both reach the lock, and the second sees the first's pending estimate. The total stays ≤ cap at reservation time.
- **Remaining overshoot:** only `actual − est` on settled rows. Estimates are worst-case (`max_tokens`-bound), so actual ≤ est in practice. It is visible in the log.
- **Pending rows left by a crashed function** stay pending and keep counting at their estimate. That is the conservative choice. No sweeper is needed in v1.
- **Copy-row `creative_id`:** the copy call happens before creatives exist (`creative_id` null, `batch_id` set). `promo_settle_spend` can't backfill it per creative because one copy call serves N variants. **Decision:** the copy cost is split evenly across the batch's variants when computing `cost_usd`:
  - Use a `promo_refresh_creative_cost` variant that adds `copy_cost / variant_count` for rows with `step='copy' AND batch_id = c.batch_id AND creative_id IS NULL`.
  - The developer implements it as: sum of own rows + (sum of batch copy rows ÷ count of creatives in the batch).
  - The trigger exception in 3.3 is then not needed. **Drop it** to keep the guard strict.

### 3.5 Rollback SQL (kept in the PR description, not run)
Drop the triggers, the functions, then the tables in reverse order. No existing table is altered by this migration, so rollback can't affect user data.

### 3.6 `20261127090100_promo_studio_storage.sql`

```sql
-- renders/<uid>/promo-studio/** is admin-only even for the owner's own client session.
-- RESTRICTIVE: ANDed with the existing owner policies; only affects the promo-studio subfolder.
CREATE POLICY "promo-studio folder is admin only" ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING (bucket_id <> 'renders' OR (storage.foldername(name))[2] IS DISTINCT FROM 'promo-studio'
         OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id <> 'renders' OR (storage.foldername(name))[2] IS DISTINCT FROM 'promo-studio'
         OR public.has_role(auth.uid(), 'admin'));
```

- The bucket stays private.
- The server issues **signed upload URLs** only after `requireAdmin`, with paths generated on the server, and it signs all reads.
- **QA must verify** that the existing user studios' uploads to `renders/<uid>/...` still work after this policy, as a regression check.

---

## 4. Server API (`src/lib/promo-studio.functions.ts`)

### 4.1 `requireAdmin` (`src/lib/require-admin.ts`)

```ts
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** has_role(userId,'admin') via the service role. Never profiles.is_admin, never ADMIN_EMAIL, never the request body. */
export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error) throw new Error("Admin check failed");
    if (data !== true) throw new Error("Forbidden: admin only");
    return next({ context: { adminId: context.userId } });
  });
```

- Every Promo fn uses `.middleware([requireAdmin])`, which already chains `requireSupabaseAuth`.
- Handlers use `context.adminId` as the actor. **No input schema has an `admin`, `free`, `skipCredits` or `userId` field.**
- Errors: anonymous → `Unauthorized: …` (from `requireSupabaseAuth`, A3); non-admin → `Forbidden: admin only` (A2). Both throw **before** the input validator and handler, so no provider call and no write can happen.

### 4.2 Shared result shape for generation calls
Generation calls return `{ ok: true, … } | { ok: false, code: 'budget'|'rate'|'per_request'|'copy_failed'|'disabled'|'invalid'|'needs_offer'|'needs_screenshot', message }` rather than throwing, so the weekly-pack loop can stop cleanly on `budget`. Auth and validation failures still throw.

### 4.3 Function list

| Fn | Method | Input (zod) | Does | Writes |
|---|---|---|---|---|
| `getPromoAdminGate` | GET | none | Uses **`[requireSupabaseAuth]` only**, returns `{ isAdmin: boolean }` via `has_role` (service role). This is the only Promo fn that doesn't throw for non-admins; it returns no data. | none |
| `getPromoStudio` | GET | none | Settings, live offers list (`isOfferLive`, code, title, `offerLabel`), `offerEnded` flag (B5), assets (signed via **one** `createSignedUrls`), month spend (sum), creatives this month, avg cost, caps | none |
| `savePromoSettings` | POST | `{ colors?: {primary,secondary,accent,text: /^#[0-9a-f]{6}$/i}, appUrl?: z.string().url().startsWith('https://').max(200), defaultCta?: string(1..40), offerId?: uuid\|null, monthlyCapUsd?: 0..500, perRequestCapUsd?: 0.01..25, rate10m?, rate24h? }` | `offerId` must be live. Money fields are written to `promo_audit` (`action='settings.update'`, old → new). | settings, audit |
| `createPromoUpload` | POST | `{ kind: 'logo'\|'asset'\|'before', mime: 'image/png'\|'image/svg+xml'\|'image/jpeg'\|'image/webp', bytes: int }` | Rules per kind: logo = png/svg ≤1 MB (B1 message); asset = png/jpg/webp ≤5 MB; before = same as asset. Builds the path `${adminId}/promo-studio/{brand\|assets\|before}/<uuid>.<ext>` and returns `createSignedUploadUrl`. | none |
| `commitPromoLogo` | POST | `{ path }` (regex, must start with `${adminId}/promo-studio/brand/`) | Sets `logo_path` after checking the object exists | settings, audit |
| `commitPromoAssets` | POST | `{ items: [{ path, label?, featureTag, width, height }] }.max(20)` | Prefix and regex check, existence check, insert | assets |
| `updatePromoAsset` | POST | `{ id, label?, featureTag?, archived?: boolean }` | Label, tag, soft-archive | assets |
| `estimatePromoRequest` | POST | same options as generate | Returns the estimate for the "Est. $0.004" line (server prices only) | none |
| `generatePromoCreatives` | POST | see 4.4 | Copy → (optional) backgrounds → insert N drafts | creatives, cost log |
| `createPromoRenderUpload` | POST | `{ creativeId, slides: 1..7 }` | Creative must be draft or approved. Bumps `render_version` and returns signed upload URLs for `out/<creativeId>/v<rv>-NN.png` and `.jpg`. | creatives |
| `commitPromoRender` | POST | `{ creativeId, renderVersion, textVersion }` | Checks the objects exist and the PNG IHDR width/height (first 24 bytes via a ranged fetch of a signed URL) equal `SIZE_PX[size]` (D2). Sets `output_paths`, `publish_paths`, `rendered_text_version = textVersion` (must equal the current `text_version`, else "Text changed, re-render"). | creatives |
| `updatePromoCreativeText` | POST | `{ id, headline?: 1..120, cta?: 1..40, caption?: ≤2200, hashtags?: string[]≤30, slides? }` | Only draft or approved. Bumps `text_version`; if approved, sets `status='draft'` and clears `approved_*` (D4). | creatives, audit |
| `setPromoCreativeStatus` | POST | `{ id, to: 'approved'\|'draft'\|'posted'\|'archived' }` | Whitelist (§7). Approve: render current + offer live (E3); posted only from approved (G7). Scheduled and posted-from-scheduled are **not** reachable here. | creatives, audit |
| `schedulePromoCreative` | POST | `{ creativeId, targets: [{ platform: enum(instagram,facebook,linkedin), connectionId: uuid }].min(1).max(3), scheduledAt: datetime }` | §7.2 | scheduled_posts, creatives, audit |
| `cancelPromoSchedule` | POST | `{ creativeId }` | G5 | scheduled_posts, creatives, audit |
| `listPromoCreatives` | GET | `{ status?, template?, format?, language?, page: int≥0 }` (24/page) | Runs the sync (§7.3) first, then lists, plus batch-signed thumbnails | creatives (sync only) |
| `getPromoCreative` | GET | `{ id }` | Detail + signed slide URLs + cost-log rows | none |
| `planWeeklyPack` | GET | none | §8 H1–H4, H6, H9 | none |
| `getScheduleHints` | GET | `{ creativeId, platform, date }` | G8 duplicate warning, offer-end warning | none |

- **Plan check:** not applicable. This is an admin-only tool, and no user plan grants it.
- **Rate limit:** enforced on every provider call inside `promo_reserve_spend`. Non-provider fns are admin-only and cheap, so they get no rate limit in v1.

### 4.4 `generatePromoCreatives` input

```ts
z.object({
  template: z.enum(["feature_spotlight","offer_festival","before_after"]),
  format: z.enum(["image","carousel","story"]),
  size: z.enum(["4:5","1:1","9:16"]),
  language: z.enum(["en","te","hi"]),
  variants: z.number().int().min(1).max(4),
  slides: z.number().int().min(3).max(7).optional(),
  assetIds: z.array(z.string().uuid()).max(7).default([]),
  beforePath: z.string().regex(BEFORE_PATH_RE).optional(),
  beforeAssetId: z.string().uuid().optional(),
  aiBackground: z.boolean().default(false),
  topic: z.string().trim().max(300).optional(),      // admin's angle / plan idea
  planItemId: z.string().uuid().optional(),
  regenerate: z.boolean().default(false),
  batchId: z.string().uuid().optional(),             // grouping label for a weekly pack; server makes one otherwise
}).superRefine(/* story ⇒ size 9:16; carousel ⇒ slides required; non-carousel ⇒ slides absent */)
```

**Handler order** (every step before the provider call returns `ok:false` with no spend):
1. Context has `adminId` (middleware).
2. Load settings. If `enabled=false` or env `PROMO_STUDIO_DISABLED=1`, return `disabled`.
3. Template rules:
   - Spotlight and before-after need ≥1 non-archived asset (B6).
   - Before-after needs a before image plus an after asset (C4).
   - Offer/festival needs a live `settings.offer_id`; otherwise return "Pick an offer in Brand Kit first." (C3).
   - The offer is snapshotted from the DB row (`code`, `offerLabel`, `ends_at`). For non-offer templates the offer is attached only if live (B5).
4. If `planItemId` is set: the item must exist. If a non-archived creative exists for it and `regenerate=false`, return `skipped: "Already has a creative"` (H6).
5. `est = estimateRequestUsd(opts)`. If `est > per_request_cap_usd`, return `per_request` with the estimate (I5).
6. Copy call via `withSpend(step='copy')` (§5, §6.1). On invalid JSON, schema failure or script failure: settle `ok=false` and return `copy_failed`, "Couldn't write the copy. Try again." No creative is created (C7).
7. Pre-generate N creative UUIDs (`crypto.randomUUID()`) so the caption UTM (`utm_content=<id8>`) and the background paths can use them.
8. If `aiBackground`: run up to N background calls in parallel, each via `withSpend(step='background', creative=id)`.
   - **One background per variant**, shared by all slides of a carousel.
   - If one fails or is refused for budget, that variant falls back to the brand gradient with `copy_warnings += "AI background failed, using gradient"`. Not a whole-request failure.
9. Insert N rows `status='draft'`, `output_paths='{}'`. Call `promo_refresh_creative_cost` for each.
10. If `withSpend` reported `alert`, claim it with `promo_claim_cap_alert()`; when that returns true, send `alertAdmins("Promo Studio has used 80% of its $X budget this month")`. Fire-and-forget, and errors are swallowed (I7).
11. Return the creatives plus signed URLs (logo, assets, backgrounds) so the client can render.

---

## 5. Credit flow (user credits) and spend flow (company money)

**User credits: none, and none reachable.**
- Promo Studio never imports `credits-guard.*`, never calls `reserve_credits`/`chargeCredits`, never writes `credit_ledger`, and never calls `/api/generate-image` (or any `/api/*`). A6 holds by construction.
- A CI grep test enforces it (§8).
- No existing endpoint gains a parameter (A4). The only paid-route diff is the ≤10-line `callFal` swap in §2.2.

**Company spend (the "reserve / settle" pattern; this is the only one, no second helper):**

```ts
// budget.server.ts
export async function withSpend<T>(meta: { adminId; step; provider; model; batchId; creativeId?; units?; unitType },
  estUsd: number,
  call: () => Promise<{ value: T; actualUsd: number | null; units?: number; requestId?: string }>)
  : Promise<{ ok: true; value: T; alert: boolean } | { ok: false; code: "budget"|"rate"|"disabled"|"forbidden"|"provider"; message: string }>
```

1. **Reserve:** `rpc('promo_reserve_spend', …)` (atomic: lock, rate check, cap check, insert pending). If refused, map to messages:
   - "Monthly Promo Studio budget reached ($CAP). Raise it in Brand Kit → Budget." (I4)
   - "Slow down. Try again in N minutes." (I6)
2. **Call** the provider inside `try`.
3. **Settle** in `finally`: `promo_settle_spend(id, ok, actual, units, error, requestId)`. Settle failures are logged with `console.error` and the row stays pending, which is conservative.
4. A retry is a **new** `withSpend`, so every attempt has its own row (I1 "each retry is logged").

---

## 6. Provider calls

### 6.1 Copy: OpenRouter `google/gemini-2.5-flash`
- **Helper:** `openrouterJson` → `aiChatFetch` with this body:
  ```json
  {
    "model": "google/gemini-2.5-flash",
    "messages": [...],
    "response_format": {"type": "json_object"},
    "temperature": 0.8,
    "max_tokens": 1800,
    "usage": {"include": true},
    "reasoning": {"max_tokens": 0}
  }
  ```
  - `signal: AbortSignal.timeout(25_000)`.
  - The model id is hard-coded in `prices.server.ts`, not taken from `AGENT_MODEL`/`AI_MODEL_MAP`, so the price table matches.
  - `aiChatFetch` applies the model map. Flash maps to itself.
- **Reasoning off:** OpenRouter's docs do not confirm the Gemini-specific "off" shape.
  - Gemini thinking is set by a reasoning token budget, so `reasoning.max_tokens: 0` is the first choice.
  - **Task 3 includes a one-call check:** `usage.completion_tokens_details.reasoning_tokens` must be 0. If the provider rejects the shape, use `{"effort":"none"}` or `{"enabled":false}`.
  - `max_tokens: 1800` bounds the output either way.
- **Return value:** `{ data, usage: { costUsd: body.usage?.cost ?? null, promptTokens, completionTokens }, requestId: body.id }`.
- **Estimate:** `(min(inputTokensApprox, 8000) × $0.30 + 1800 × $2.50) / 1e6` ≈ **$0.0069 worst case**.
  - `inputTokensApprox = ceil(chars/3.5)`.
  - `liveKb` is sliced to 12,000 chars so the input stays ≤8k tokens.
  - Prices were checked on 2026-11-26 at OpenRouter `/models/google/gemini-2.5-flash/endpoints`: prompt $0.0000003/token, completion and internal_reasoning $0.0000025/token.
- **Prompt:**
  - **System:** role, then `HONESTY_RULES` with `{SITE}` set to `app_url`, then `product_facts` from `liveKb`, then template brief, then language rule:
    - "Write hook, headline, slide lines and CTA in Telugu script / Devanagari. Hashtags may be English."
    - "**Never write a discount code, a price, a percentage or a date. The design adds the offer itself.**"
  - **User:** JSON with the template, format, slide count, variants, topic or plan idea, the screenshot feature tags and labels, and the offer *title only*.
- **Output schema (zod, server):**
  ```
  { variants: [{ hook ≤90, headline ≤80, slides?: [{title ≤60, body ≤160}] (length = slides), cta ≤28, caption ≤1800, hashtags: string[] 3..15 }] }
  ```
  - `variants.length` must equal N. Variants must have distinct hook and headline; dedupe check, and fail if duplicate (C5).
  - For te/hi, the headline must match `/[ఀ-౿]/` or `/[ऀ-ॿ]/`; otherwise `copy_failed`.
- **Soft lint (C8):** any `₹`, `%`, `\d+\s*off`, or uppercase token matching `/\b[A-Z0-9]{5,}\b/` that isn't the snapshot code goes into `copy_warnings`. The drawer shows them, and the admin fixes the text before approving.
  - The chip always shows `offer_code` from the snapshot, so the displayed code equals `offers.code` exactly.
- **Retry:** at most 1, only on a network error, 429 or 5xx, and only if the first attempt took <12 s (so the function stays under about 60 s). Each attempt is a separate `withSpend`.
- **Provider down:** `copy_failed`, "Couldn't write the copy. Try again." The failed row is logged with `ok=false`. No creative is created.

### 6.2 Background: fal `fal-ai/flux/schnell` (sync)
- **Model:** confirmed on fal's model page, 2026-11-26: "$0.003 per megapixel", "billed by rounding up to the nearest megapixel".
- **Size:** custom `image_size: {width, height}` kept **≤1,000,000 px** so it bills as 1 MP:

  | Creative size | BG px | MP |
  |---|---|---|
  | 4:5 | 880×1104 | 0.97 |
  | 1:1 | 992×992 | 0.98 |
  | 9:16 | 736×1312 | 0.97 |

- **Server-side checks:**
  - `w*h ≤ settings.bg_max_megapixels × 1e6` (≤1.0 by CHECK).
  - The endpoint must be in `settings.bg_models ∩ CODE_ALLOWLIST(['fal-ai/flux/schnell'])`, so nano-banana can't be enabled from the DB alone.
- **Input:**
  ```
  { prompt: "<abstract on-brand background, colours …, soft gradient shapes, no text, no letters, no logos, no UI>",
    image_size, num_images: 1, num_inference_steps: 4, enable_safety_checker: true, output_format: "jpeg", sync_mode: true }
  ```
- **Call:** `falRunSync(ep, input, { signal: AbortSignal.timeout(20_000) })`. **No retry.** The variant falls back to the gradient.
- **Est:** `ceil(w*h/1e6) × 0.003 = $0.003`. `actualUsd` is null, so the estimate is used. `units = w*h/1e6`, `unit_type='megapixels'`, `provider_request_id` = the `x-fal-request-id` response header if present.
- **Storage:** decode the data URI and upload it to `${adminId}/promo-studio/bg/<creativeId>.jpg`.
- **Provider down or safety-blocked** (fal returns black images; check `has_nsfw_concepts[0]`): treated as a failure, logged with `ok=false`, gradient fallback.

### 6.3 Long jobs
None in v1. Everything is synchronous and bounded:
- copy ≤25 s, plus 1 retry only on a fast failure
- backgrounds run in parallel, ≤20 s

The worst case is about 50 s.
- **Check the Vercel function max duration for server fns** (Fluid default is 300 s; legacy Pro default is 60 s). If it is 60 s, the bounds above fit.
- Video in phase 2 uses the queue plus polling (`fal.server.ts`).

---

## 7. State machine and scheduling

### 7.1 Transitions → server functions

| From → To | Fn | Server guard (friendly message, then the SQL trigger as backstop) |
|---|---|---|
| (new) → draft | `generatePromoCreatives` | Insert only as draft |
| draft → approved | `setPromoCreativeStatus(to:'approved')` | `output_paths` non-empty and `rendered_text_version = text_version`; snapshot offer still live (`isOfferLive` on the current `offers` row by `offer_id` **and** `offer_code` equal to the snapshot). Otherwise "This offer has ended. Regenerate or remove the offer." Sets `approved_by/at`. |
| approved → draft | `setPromoCreativeStatus(to:'draft')` or `updatePromoCreativeText` | none |
| approved → scheduled | `schedulePromoCreative` only | §7.2 |
| scheduled → approved | `cancelPromoSchedule` only | §7.2 |
| scheduled → posted | system, inside `listPromoCreatives` sync | §7.3 |
| approved → posted | `setPromoCreativeStatus(to:'posted')` | none |
| draft/approved → archived | `setPromoCreativeStatus(to:'archived')` | none |
| archived → draft | `setPromoCreativeStatus(to:'draft')` | none |
| posted → * | nobody | Trigger raises |

`setPromoCreativeStatus` rejects `to:'scheduled'` at the schema level (not in the enum). It does an optimistic `UPDATE … WHERE id=$1 AND status=$from` and treats 0 rows as "Can't move a <from> creative to <to>."

### 7.2 `schedulePromoCreative`
1. `requireAdmin` (re-checks `has_role`; G2.1).
2. Load the creative. If `status <> 'approved'`, return "Approve this creative first" (G3). No insert happens.
3. Time window: `scheduledAt` must be ≥ now+5 min and ≤ now+45 days (signed-URL lifetime). If there is an offer snapshot:
   - Re-check that it is live now, otherwise "This offer has ended. Regenerate or remove the offer."
   - If `scheduledAt > offers.ends_at` (the current row; fall back to the snapshot `offer_ends_at`), return "This post would go out after the offer ends." (G2.3)
4. Media: `publish_paths` (JPEG, one per slide) are signed for 45 days via `createSignedUrls`. Then per target:
   - `platformMediaProblem(platform, urls)`, the exported validator (blocks YouTube without video).
   - **Instagram plus 9:16** is rejected: "Instagram feed posts need 4:5 or 1:1. Download the story and post it manually." The worker posts IG images as feed posts, and IG's feed rejects aspect ratios taller than 4:5.
   - `assertPublishConnection(context.supabase, adminId, platform, connectionId)`, the helper extracted from `schedulePost`.
5. Insert one `scheduled_posts` row per target via the **user-scoped** `context.supabase` (RLS "own scheduled_posts", same as `schedulePost`):
   ```
   { user_id: adminId, project_id: null, platform, connection_id, title: headline.slice(0,100),
     caption, hashtags: hashtags.join(' '), media_urls, scheduled_at, status: 'scheduled' }
   ```
6. Conditional update `promo_creatives SET status='scheduled', scheduled_post_ids = ids WHERE id AND status='approved'`. If 0 rows (a race), delete the just-inserted posts and error.
7. Audit row.

The rows show on `/calendar` (G4), and `runDuePublishJobs` posts them. The worker re-signs storage URLs at publish time (`resolveMedia`), so it needs no change.

**`cancelPromoSchedule` (G5):**
- Creative must be `scheduled`.
- With the service role: `DELETE FROM scheduled_posts WHERE id = ANY(ids) AND user_id = adminId AND status IN ('scheduled','failed','reconnect_required') RETURNING id`.
- Before deleting, if any linked row is `publishing`, `published` or `manually_published`, refuse: "This post is already going out."
- Then status becomes `approved` and `scheduled_post_ids='{}'`.
- The worker's claim (`UPDATE … WHERE status IN (scheduled,…)`) and this delete are both single-row atomic, so one of them wins.

**G8 duplicate warning (`getScheduleHints`):** warn when either of these exists for the same platform on the same IST date:
- the admin's `scheduled_posts` with status not in (`failed`, `published`)
- `agent_tasks` with `kind='social_post'`, `source_ref->>plan_item_id = creative.plan_item_id` and `source_ref->>platform = platform` (post-creator drafts)

The warning is "This day already has a <platform> post scheduled." It is a warning only.

### 7.3 Sync on Library load (G6)
For creatives in `scheduled` (a small set), load the linked `scheduled_posts` by id (service role, one `in()` query). Then:
- All linked rows are `published` or `manually_published` → `posted`, `schedule_note=null`.
- Any row is `failed` or `reconnect_required` → `schedule_note = 'Post failed: ' || last_error`; the creative stays scheduled.
- A linked row is missing (deleted in `/calendar`) → remove it from the array. If the array becomes empty → `approved`.

---

## 8. Overlay rendering (client-side, confirmed)

- **Root:** `<PromoCanvas size>` renders at exact pixels (`SIZE_PX` below). For preview it is wrapped in a scaled container (`transform: scale(k)`). The export node is the unscaled inner element, rendered off-screen (`position:fixed; left:-10000px`), so mobile still exports full size.

  | Size | Px |
  |---|---|
  | 4:5 | 1080×1350 |
  | 1:1 | 1080×1080 |
  | 9:16 | 1080×1920 |

- **Templates** (`templates/*.tsx`) are pure components of `(creative, slideIndex, brand, imageUrls)`:
  - **Feature spotlight:** headline top, `DeviceFrame` with the screenshot in the centre, CTA + URL bottom, logo top-left. Carousel: cover (hook) → one slide per `slides[i]`, each with its screenshot (cycling `asset_ids`) → CTA slide.
  - **Offer/festival:** big `OfferChip` (code + label from the snapshot), headline, optional screenshot in a small phone, festive gradient or AI background, logo top-right.
  - **Before → after:** split or two stacked panels labelled "Before" / "After" (localised), the before image and the after screenshot in a browser frame.
  - Every template renders headline, logo, CTA, app URL (display host only, e.g. `creatorflowai.prodxstore.com`) and, for offers, the chip (D1). There is never text in the AI image.
- **FitText:** binary-search the font size between 100% and 70% of the template size using `scrollHeight <= clientHeight`. If it still overflows at 70%, set `overflow` and the editor shows "Headline too long, shorten it". **Render and Approve are disabled** while any slide overflows (D3).
- **Fonts:**
  - Self-hosted woff2 in `public/promo-fonts/`: Noto Sans 700/900 (Latin), Noto Sans Telugu 700, Noto Sans Devanagari 700.
  - `fonts.ts` fetches only the ones the creative's language needs, registers them with `new FontFace(...)`, awaits `document.fonts.ready`, and builds a `fontEmbedCSS` string of `@font-face` rules with **data: URLs**.
  - That string is passed to `toPng/toJpeg({ fontEmbedCSS })`, so html-to-image never has to read the cross-origin Google Fonts stylesheet (a known silent failure there is the source of tofu).
  - Template CSS: `font-family: "Noto Sans", "Noto Sans Telugu", "Noto Sans Devanagari", sans-serif`.
- **Images:** before rendering, every image (logo, screenshots, background) is fetched from its signed URL into a `blob:` object URL, so html-to-image inlines same-origin data and canvas taint/CORS is not an issue. Then await `img.decode()` on all of them.
- **Export (`render.ts`):** for each slide:
  - `toPng(node, { width, height, pixelRatio: 1, cacheBust: true, fontEmbedCSS })` → Blob
  - `toJpeg(node, { …, quality: 0.92, backgroundColor: brand.primary })` → Blob (Instagram only accepts JPEG)
  - Check `naturalWidth/Height` client-side too.
- **Upload:**
  1. `createPromoRenderUpload({creativeId, slides})` → tokens.
  2. `supabase.storage.from('renders').uploadToSignedUrl(path, token, blob)`, the same pattern as `content-plan-autobuild.ts:234-237`.
  3. `commitPromoRender`, where the server checks the PNG IHDR size.
- **Auto-render:** after generate, the client renders each new draft in sequence and commits. If the tab closes before that, the draft stays render-less: the Library shows "Not rendered yet" with a **Render** button. Approve is blocked until it is rendered.
- **Download:**
  - PNG: from the signed `output_paths[0]`, file name `creatorflow-<template>-<size>-<lang>-<id8>.png` (F1).
  - Carousel: `const JSZip = (await import("jszip")).default`, slides `slide-01.png…` plus `caption.txt` = caption + `\n\n` + hashtags, saved as `creatorflow-carousel-<id8>.zip` (F2).
  - Copy caption uses the same text (F3).
- **UTM:** the caption's link line uses `${app_url}?utm_source=promo_studio&utm_medium=social&utm_campaign=${template}&utm_content=${id8}`. It is built on the server in step 7 of 4.4. The image shows the bare host.
- **Bundle:** the route component is lazy (`React.lazy(() => import("@/components/promo-studio/PromoStudioPage"))`). Fonts and mockups are fetched at runtime, and jszip is imported dynamically. Nothing is added to the main chunk except the tiny route file.

### Weekly pack (H1–H9)
- **`planWeeklyPack` (server):**
  - Reads `content_plan_items` where `plan_date BETWEEN istToday(0) AND istToday(6)` and `status IN ('planned','drafted')`, ordered by date, limit 7.
  - **Mapping per item:**
    - Format, from the plan format: `image` → image 4:5; `carousel` → carousel 4:5 with 5 slides; `reel`/`long` → story 9:16.
    - Template:
      - offer/festival if the idea matches the active offer code or `/offer|deal|sale|festival|diwali|christmas|sankranti|ugadi/i`
      - before-after if `/before|makeover/i`
      - otherwise spotlight
    - Language: `/telugu/i` → te, `/hindi/i` → hi, otherwise en.
    - Asset: for `build='walkthrough'`, the newest non-archived asset with `feature_tag` matching `media_id` (`tour`→none; use a small map, e.g. `thumbnails`→`thumbnails`), otherwise the newest asset.
  - Also returns: `existingCreativeId` per item (H6), per-item estimate, total estimate, remaining budget, connected platforms.
  - An offer-template item with no live offer is downgraded to spotlight with a note.
- **Client dialog:** editable rows (template, format, language, regenerate checkbox).
- **On confirm**, `batchId = crypto.randomUUID()`. Loop **sequentially**: `await generatePromoCreatives({ …row, variants: 1, planItemId, batchId, aiBackground: false unless toggled })`, then render and commit that creative before moving on.
  - Progress per row: queued → generating → rendering → done / failed / skipped.
  - On `code==='budget'`, mark the rest "Monthly Promo Studio budget reached" and stop (H7).
  - `per_request` is checked per creative on the server.
- **Never** approves, schedules or writes `content_plan_items` (H8). No writes to that table exist anywhere in Promo code (grep test).
- **Empty state (H9)** comes from `items.length === 0`.

---

## 9. Route guard and rollback

**Route** `src/routes/_authenticated/admin.promo-studio.tsx`:
```ts
export const Route = createFileRoute("/_authenticated/admin/promo-studio")({
  head: () => ({ meta: [{ title: "Promo Studio — CreatorFlow AI" }] }),
  beforeLoad: async () => {
    const { isAdmin } = await getPromoAdminGate();      // server fn, has_role
    if (!isAdmin) throw redirect({ to: "/dashboard", replace: true });
  },
  component: lazyRouteComponent(() => import("@/components/promo-studio/PromoStudioPage")),
});
```
The parent `_authenticated` has `ssr:false`, so `beforeLoad` runs in the browser with the session token attached. Because `beforeLoad` throws first, no Promo query mounts for non-admins (A1). Even if it were bypassed, every data fn 403s.

**Kill switches, fastest first:**
1. **`promo_settings.enabled=false`**: one SQL update by SPK, or a toggle in Brand Kit → Budget. Every generation returns `disabled`; Library and download still work.
2. **`monthly_cap_usd = 0`**: no provider call can reserve.
3. **Env `PROMO_STUDIO_DISABLED=1`** in Vercel: every Promo fn throws "Promo Studio is turned off" (checked inside `requireAdmin`'s consumer helper), and `getPromoAdminGate` returns false, so the route redirects.
4. **Code revert of the PR(s):** the tables stay (no user data), and the storage-policy migration can be reverted alone.

**The paid-route refactor rolls back on its own:** reverting the `callFal` swap in `generate-image.ts` restores the old code exactly.

---

## 10. Task breakdown (ordered, each independently testable)

**PR 1: Foundations (security-auditor reviews)**
1. **Migration `20261127090000_promo_studio.sql`** (§3.1–3.4).
   - Test locally: RLS as a non-admin (0 rows, writes fail) and as an admin (select only).
   - Test the triggers: illegal transitions, cost-log delete/update.
   - Test the RPC: two concurrent `promo_reserve_spend` calls with `cap = 2 × est − ε`, so exactly one succeeds.
2. **Migration `20261127090100_promo_studio_storage.sql`.** Test that a non-admin can't upload to `<uid>/promo-studio/x.png` and can still upload to `<uid>/x.png`.
3. **Providers.**
   - `providers/fal-image.server.ts` plus the `callFal` swap in `generate-image.ts`, and `providers/openrouter-json.server.ts`.
   - Test: a `generate-image` call still produces 1 `credit_ledger` row (reserved → charged) with an identical response, and a forced provider failure still refunds.
   - Run the one-off reasoning-off check (§6.1).
4. **`require-admin.ts`** plus a smoke fn. Test anon → Unauthorized; non-admin (with `profiles.is_admin=true` set via the service role and the email matching `ADMIN_EMAIL`) → Forbidden; admin → ok.
5. **`prices.server.ts`, `budget.server.ts` (`withSpend`).** Unit test with a mocked RPC: refusal codes map to the exact messages, settle is always called, and retries are logged as separate rows.

**PR 2: Shell + Brand Kit**

6. Export `isOfferLive` from `offers.server.ts`. Add `settings.server.ts`, `getPromoAdminGate`, `getPromoStudio`, `savePromoSettings` (with audit), and the route file with the guard.
7. Upload fns (`createPromoUpload`, `commitPromoLogo`, `commitPromoAssets`, `updatePromoAsset`) plus the Brand Kit tab (B1–B5, budget fields). Add the admin link in `admin.index.tsx`.

**PR 3: Generate + render**

8. `copy.server.ts` and `background.server.ts`, then `generatePromoCreatives` and `estimatePromoRequest`. Test with providers mocked and with real calls on staging (cost rows, cap refusal, C7).
9. Templates, `FitText`, `DeviceFrame`, `fonts.ts`, `render.ts`, then `createPromoRenderUpload` and `commitPromoRender`. Test pixel sizes, te/hi glyphs, and the IHDR mismatch being rejected.
10. Create tab (options, estimate line, skeletons, no double submit).

**PR 4: Library + status + schedule**

11. `listPromoCreatives` (with sync), `getPromoCreative`, `updatePromoCreativeText`, `setPromoCreativeStatus`, plus the Library tab, drawer, download/ZIP and copy caption.
12. `assertPublishConnection` extraction in `publishing.functions.ts` (schedulePost behaviour unchanged), then `schedulePromoCreative`, `cancelPromoSchedule`, `getScheduleHints` and `ScheduleDialog`.

**PR 5: Weekly pack + budget widget**

13. `weekly-pack.server.ts`, `planWeeklyPack`, `WeeklyPackDialog` (sequential loop, budget stop).
14. `BudgetWidget` (I3) and the 80% alert claim (I7).
15. Docs: changelog entry and an admin help note.

---

## 11. Test plan hints (qa-tester)

**Access (A1–A5): run against every exported fn in `promo-studio.functions.ts` (generate a list from the module's exports):**
- **Anon** (no Authorization header) → error starts with `Unauthorized`.
- **Non-admin** → `Forbidden: admin only`. Run it three times:
  - normal user
  - user with `profiles.is_admin=true` (set by the service role)
  - user whose email equals `ADMIN_EMAIL` but who has no `user_roles` row

  After each, assert: no new `promo_cost_log`, `promo_creatives`, `promo_assets`, `promo_audit` or `scheduled_posts` rows; fal/OpenRouter mocks are not called.
- **Route:** a non-admin opening `/admin/promo-studio` is redirected to `/dashboard`, and the network tab shows only `getPromoAdminGate`.
- **Supabase JS as a non-admin:** select on all 5 tables returns `[]`; insert/update/delete returns an error.
- **As an admin:** insert into `promo_cost_log` fails.
- **RPC exposure:** `rpc('promo_reserve_spend', …)` as authenticated returns permission denied.

**Paid routes still charge (A4, A6):**
- `POST /api/generate-image` with `{prompt, admin:true, promo:true, skipCredits:true}` as a normal user → 1 credit is reserved and charged, exactly like a baseline call with no flags.
- Force a fal 500 → refunded.
- Snapshot `credit_ledger` / `profiles.user_credits` / `subscriptions.monthly_credits_used` before and after a Promo generation → unchanged.
- **Grep/CI test:**
  - Nothing under `src/lib/promo-studio/**` or `promo-studio.functions.ts` imports `credits-guard`, `/api/`, `chargeCredits` or `reserve_credits`.
  - `providers/*.server.ts` are imported only by `generate-image.ts` and `promo-studio/**`.
  - No existing `api/*.ts` reads a new body field (diff review).

**Budget under concurrency (I4):**
- Set the cap so only K calls fit, then fire 10 parallel `generatePromoCreatives` calls → exactly K succeed and the rest return `budget`. `sum(coalesce(actual,est))` for the month is ≤ cap + (max actual − est).
- **Per-request cap:** set it to $0.001 → refused, with the estimate shown, and no log row.
- **Rate limit:** 41 provider calls in 10 min → the 41st returns "Slow down. Try again in N minutes." and no provider call is made.
- **Alert:** crossing 80% sends exactly one alert per month, even with parallel calls (`promo_claim_cap_alert`).

**Generation:**
- C2 bad combinations: story + 1:1, carousel without slides, variants 5, language `ta` → zod error and no log row.
- C7: mock invalid JSON → no creative, one `copy` row with `ok=false`, the user-facing message.
- te/hi: copy without native script → `copy_failed`.
- D5: background off → no `step='background'` rows.
- Background failure → the creative is still created with a gradient and a warning.
- C8: the chip text equals `offers.code`; a model output containing "50% off" shows a copy warning.

**Render:**
- PNG dimensions for 4:5, 1:1 and 9:16.
- te/hi screenshots compared visually (no tofu).
- Headline overflow → message shown and Approve disabled.
- Tampered commit (wrong size PNG) → rejected.
- Edit after render → Approve blocked until re-render (`text_version`).

**State machine:**
- Each illegal edge, through the fn and directly via the service role (trigger raises).
- Approve with an ended offer → E3 message.
- Edit an approved creative → back to draft.

**Schedule:**
- A draft id → "Approve this creative first", and 0 `scheduled_posts` rows.
- `scheduledAt` after `ends_at` → G2.3 message.
- IG + 9:16 → refused.
- YouTube → `platformMediaProblem` message.
- Someone else's `connectionId` → the not-connected message.
- Happy path: the row appears on `/calendar`, the worker publishes (staging IG test account, carousel of JPEGs), and a Library reload shows Posted.
- Cancel while `scheduled` → row deleted, creative approved. Cancel while `publishing` → refused.
- Post deleted from `/calendar` → the creative returns to approved on reload.
- Failed post → red note, creative stays scheduled.

**Weekly pack:**
- 0 items → H9 empty state.
- Mapping table cases (H2–H4).
- Existing creative → skipped unless Regenerate is ticked.
- Budget runs out on day 3 → days 1–2 are kept and days 3–7 show the budget message.
- `content_plan_items.status` is unchanged afterwards.

**Regression:**
- `npm run build`, type-check.
- User uploads to `renders` still work after the storage policy.
- `schedulePost` from `/calendar` behaves the same after the `assertPublishConnection` extraction.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| A credit-free path leaks to users | Only `requireAdmin` fns reach the providers. The helpers are `.server.ts` with no route or serverFn. There are no body flags. Grep tests. Security-auditor sign-off. |
| The refactor changes paid image behaviour | The diff is limited to the `callFal` closure (≤10 lines), with no timeout passed. QA's charge and refund regression. Reverts on its own. |
| The admin check is read from the wrong source | `has_role` via the service role in one middleware. `useAccess` is not used for the guard. Tests with `is_admin=true` and `ADMIN_EMAIL`. |
| The budget race | Advisory-lock RPC plus a pending reservation. Worst-case estimates. |
| Instagram rejects PNG or 9:16 feed images | JPEG `publish_paths`. IG + 9:16 is refused at schedule time. Facebook multi-image behaviour is **untested in the worker** and must be tested on staging. If it fails, limit carousel scheduling to Instagram in v1. |
| html-to-image drops fonts or images (tofu, blank screenshots) | Self-hosted fonts via `fontEmbedCSS` data URLs. Blob URLs for images. Server IHDR size check. A human approves the visible PNG. |
| The client renders something different from the stored text | `text_version` / `rendered_text_version` gate on Approve. Admin-only, with human approval (accepted in the spec). |
| The admin edits the `scheduled_posts` row in `/calendar` after scheduling (bypasses offer re-checks) | Accepted for v1: it is the admin's own row. Documented. Sync handles deletion. |
| A Vercel timeout on generate | Bounded timeouts (25 s + 20 s parallel). Verify the function max duration. |
| A restrictive storage policy slows or breaks storage queries | The expression is cheap. It is in a separate migration, with a regression test on user uploads. Revert that migration alone. |
| `has_role` EXECUTE grants change in a future migration | The middleware uses the service role. RLS policies use `has_role` like `content_plan_items` already does. |
| Stale Supabase types | Regenerate types in PR 1. |

---

## 13. Decisions SPK must make

**Blocking:** none. All money numbers are approved, and the defaults are encoded as settings.

**Non-blocking (defaults chosen; SPK may override):**
1. **One AI background per variant, shared across carousel slides** (cheaper), rather than one per slide. Default: per variant.
2. **Stories can't be scheduled to Instagram** (the worker has no IG Stories support, and feed posts can't be 9:16). They are download-and-post-manually only. Facebook/LinkedIn scheduling of 9:16 is allowed.
3. **Copy cost of a batch is split evenly across its variants** for the per-creative `cost_usd`.
4. Admins can edit the rate limits (40 per 10 min / 300 per 24 h) in Brand Kit → Budget, like the caps.
