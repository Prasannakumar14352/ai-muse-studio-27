-- Tests for Promo Studio migrations 20261127090000_promo_studio.sql and
-- 20261127090100_promo_studio_storage.sql.
--
-- Plain SQL asserts; any failure raises an exception. Everything runs in one transaction and is
-- rolled back, so it leaves no data behind (the append-only cost log included).
-- Run against a LOCAL / branch database only, never production:
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/promo_studio.sql
-- Real two-session concurrency for promo_reserve_spend is in promo_studio_concurrency.sh
-- (it needs committed fixtures, so it can't live in this rolled-back transaction).
-- Expects the Supabase roles (anon, authenticated, service_role), auth.users, auth.uid(),
-- storage.objects and all migrations applied.

BEGIN;

-- ---------------------------------------------------------------- fixtures
INSERT INTO auth.users (id, email)
VALUES ('dddddddd-0000-4000-8000-00000000000a', 'ci-promo-admin@example.test'),
       ('dddddddd-0000-4000-8000-00000000000b', 'ci-promo-user@example.test');
INSERT INTO public.user_roles (user_id, role)
VALUES ('dddddddd-0000-4000-8000-00000000000a', 'admin') ON CONFLICT DO NOTHING;
-- User B looks like an admin to the legacy checks only (profiles.is_admin), never to has_role.
UPDATE public.profiles SET is_admin = true WHERE id = 'dddddddd-0000-4000-8000-00000000000b';
DELETE FROM public.user_roles WHERE user_id = 'dddddddd-0000-4000-8000-00000000000b' AND role = 'admin';

INSERT INTO storage.buckets (id, name, public) VALUES ('renders', 'renders', false) ON CONFLICT (id) DO NOTHING;

-- Run a statement and report whether it was refused with 42501 (RLS, grants or our triggers).
CREATE OR REPLACE FUNCTION pg_temp.ci_refused(_sql text) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN false;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ci_refused(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION pg_temp.ci_assert(_ok boolean, _msg text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF _ok IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', _msg; END IF;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ci_assert(boolean, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION pg_temp.ci_as(_uid text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', _uid, true);
$$;

-- ======================================================= RLS: non-admin (A1, A5)
SELECT pg_temp.ci_as('dddddddd-0000-4000-8000-00000000000b');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM pg_temp.ci_assert((SELECT count(*) FROM public.promo_settings) = 0, 'non-admin sees promo_settings');
  PERFORM pg_temp.ci_assert((SELECT count(*) FROM public.promo_cost_log) = 0, 'non-admin sees promo_cost_log');
  PERFORM pg_temp.ci_assert((SELECT count(*) FROM public.promo_creatives) = 0, 'non-admin sees promo_creatives');
  PERFORM pg_temp.ci_assert(pg_temp.ci_refused(
    $q$INSERT INTO public.promo_audit (admin_id, action) VALUES ('dddddddd-0000-4000-8000-00000000000b', 'x')$q$),
    'non-admin insert into promo_audit');
  PERFORM pg_temp.ci_assert(pg_temp.ci_refused('UPDATE public.promo_settings SET monthly_cap_usd = 500'),
    'non-admin update promo_settings');
  PERFORM pg_temp.ci_assert(pg_temp.ci_refused(
    $q$SELECT public.promo_reserve_spend('dddddddd-0000-4000-8000-00000000000b', 'copy', 'openrouter',
        'google/gemini-2.5-flash', 0.001, NULL, NULL, NULL, NULL)$q$),
    'authenticated can execute promo_reserve_spend');
END $$;
RESET ROLE;

-- ======================================================= RLS: admin = SELECT only (A5)
SELECT pg_temp.ci_as('dddddddd-0000-4000-8000-00000000000a');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM pg_temp.ci_assert((SELECT count(*) FROM public.promo_settings) = 1, 'admin can read promo_settings');
  PERFORM pg_temp.ci_assert(pg_temp.ci_refused('UPDATE public.promo_settings SET monthly_cap_usd = 500'),
    'admin client update promo_settings');
  PERFORM pg_temp.ci_assert(pg_temp.ci_refused(
    $q$INSERT INTO public.promo_cost_log (admin_id, step, provider, model, est_usd)
       VALUES ('dddddddd-0000-4000-8000-00000000000a', 'copy', 'openrouter', 'm', 0)$q$),
    'admin client insert into promo_cost_log');
  PERFORM pg_temp.ci_assert(pg_temp.ci_refused('DELETE FROM public.promo_audit'), 'admin client delete promo_audit');
  PERFORM pg_temp.ci_assert(pg_temp.ci_refused('SELECT public.promo_claim_cap_alert()'),
    'authenticated can execute promo_claim_cap_alert');
  PERFORM pg_temp.ci_assert(pg_temp.ci_refused(
    $q$SELECT public.promo_settle_spend(gen_random_uuid(), true, 0, NULL, NULL, NULL, NULL)$q$),
    'authenticated can execute promo_settle_spend');
END $$;
RESET ROLE;

-- ======================================================= storage policy (renders/<uid>/promo-studio/**)
SELECT pg_temp.ci_as('dddddddd-0000-4000-8000-00000000000b');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM pg_temp.ci_assert(pg_temp.ci_refused(
    $q$INSERT INTO storage.objects (bucket_id, name, owner)
       VALUES ('renders', 'dddddddd-0000-4000-8000-00000000000b/promo-studio/x.png', 'dddddddd-0000-4000-8000-00000000000b')$q$),
    'non-admin upload into own promo-studio folder');
  PERFORM pg_temp.ci_assert(NOT pg_temp.ci_refused(
    $q$INSERT INTO storage.objects (bucket_id, name, owner)
       VALUES ('renders', 'dddddddd-0000-4000-8000-00000000000b/x.png', 'dddddddd-0000-4000-8000-00000000000b')$q$),
    'REGRESSION: user upload to own renders folder must still work');
  PERFORM pg_temp.ci_assert(NOT pg_temp.ci_refused(
    $q$INSERT INTO storage.objects (bucket_id, name, owner)
       VALUES ('renders', 'dddddddd-0000-4000-8000-00000000000b/projects/promo-studio.png', 'dddddddd-0000-4000-8000-00000000000b')$q$),
    'REGRESSION: only the second path segment is the promo-studio folder');
END $$;
RESET ROLE;

SELECT pg_temp.ci_as('dddddddd-0000-4000-8000-00000000000a');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM pg_temp.ci_assert(NOT pg_temp.ci_refused(
    $q$INSERT INTO storage.objects (bucket_id, name, owner)
       VALUES ('renders', 'dddddddd-0000-4000-8000-00000000000a/promo-studio/assets/x.png', 'dddddddd-0000-4000-8000-00000000000a')$q$),
    'admin upload into own promo-studio folder');
  PERFORM pg_temp.ci_assert(pg_temp.ci_refused(
    $q$INSERT INTO storage.objects (bucket_id, name, owner)
       VALUES ('renders', 'dddddddd-0000-4000-8000-00000000000b/promo-studio/y.png', 'dddddddd-0000-4000-8000-00000000000a')$q$),
    'admin upload into another user''s folder (owner policy still applies)');
END $$;
RESET ROLE;

-- ======================================================= budget RPC (service role)
SET LOCAL ROLE service_role;
DO $$
DECLARE
  A constant uuid := 'dddddddd-0000-4000-8000-00000000000a';
  B constant uuid := 'dddddddd-0000-4000-8000-00000000000b';
  _base numeric; _cap numeric; _est numeric; r jsonb; r2 jsonb; _id uuid; _n int; _row public.promo_cost_log%ROWTYPE;
BEGIN
  -- month spend already in this DB (rows can't be deleted, so the test works on top of it)
  SELECT coalesce(sum(coalesce(actual_usd, est_usd)), 0) INTO _base FROM public.promo_cost_log
   WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  PERFORM pg_temp.ci_assert(_base < 499, 'local DB already near the max cap');
  UPDATE public.promo_settings SET enabled = true, rate_10m = 500, rate_24h = 5000, per_request_cap_usd = 1,
         cap_alerted_month = NULL WHERE id = 1;

  -- cap = base + 2 × est − ε: exactly one of two reservations fits.
  _cap := ceil(_base * 100) / 100 + 0.01;
  _est := round((_cap - _base) * 0.6, 6);
  UPDATE public.promo_settings SET monthly_cap_usd = _cap WHERE id = 1;
  r := public.promo_reserve_spend(A, 'background', 'fal', 'fal-ai/flux/schnell', _est, NULL, NULL, 1, 'megapixels');
  PERFORM pg_temp.ci_assert((r->>'ok')::boolean, 'first reservation under the cap: ' || r::text);
  r2 := public.promo_reserve_spend(A, 'background', 'fal', 'fal-ai/flux/schnell', _est, NULL, NULL, 1, 'megapixels');
  PERFORM pg_temp.ci_assert(r2->>'code' = 'budget', 'second reservation must see the first pending row: ' || r2::text);
  PERFORM pg_temp.ci_assert((r->>'alert')::boolean, '80% alert flag after crossing 80%');

  -- the alert is claimed once per month
  PERFORM pg_temp.ci_assert(public.promo_claim_cap_alert() IS TRUE, 'first alert claim');
  PERFORM pg_temp.ci_assert(public.promo_claim_cap_alert() IS NULL, 'second alert claim must not win');

  -- settle once
  _id := (r->>'id')::uuid;
  PERFORM public.promo_settle_spend(_id, true, NULL, 0.97, NULL, 'req-1', NULL);
  SELECT * INTO _row FROM public.promo_cost_log WHERE id = _id;
  PERFORM pg_temp.ci_assert(_row.state = 'settled' AND _row.ok AND _row.provider_request_id = 'req-1', 'settled');
  PERFORM public.promo_settle_spend(_id, false, 99, NULL, 'second settle', 'req-2', NULL);  -- no-op
  SELECT * INTO _row FROM public.promo_cost_log WHERE id = _id;
  PERFORM pg_temp.ci_assert(_row.ok AND _row.actual_usd IS NULL AND _row.provider_request_id = 'req-1',
    'second settle must not change a settled row');
  PERFORM pg_temp.ci_assert(pg_temp.ci_refused(format(
    'UPDATE public.promo_cost_log SET actual_usd = 0 WHERE id = %L', _id)), 'service role re-settle via UPDATE');
  PERFORM pg_temp.ci_assert(pg_temp.ci_refused(format(
    'DELETE FROM public.promo_cost_log WHERE id = %L', _id)), 'service role DELETE on the cost log');

  -- a pending row can't have its estimate rewritten while settling
  UPDATE public.promo_settings SET monthly_cap_usd = 500 WHERE id = 1;
  r := public.promo_reserve_spend(A, 'copy', 'openrouter', 'google/gemini-2.5-flash', 0.0069, NULL, NULL, NULL, NULL);
  PERFORM pg_temp.ci_assert(pg_temp.ci_refused(format(
    $q$UPDATE public.promo_cost_log SET state = 'settled', est_usd = 0 WHERE id = %L$q$, r->>'id')),
    'est_usd rewritten during settle');
  PERFORM pg_temp.ci_assert(pg_temp.ci_refused(format(
    $q$UPDATE public.promo_cost_log SET error = 'x' WHERE id = %L$q$, r->>'id')),
    'pending row updated without settling');

  -- per-call cap
  UPDATE public.promo_settings SET per_request_cap_usd = 0.01 WHERE id = 1;
  r := public.promo_reserve_spend(A, 'copy', 'openrouter', 'google/gemini-2.5-flash', 0.02, NULL, NULL, NULL, NULL);
  PERFORM pg_temp.ci_assert(r->>'code' = 'per_request', 'per-request cap: ' || r::text);
  UPDATE public.promo_settings SET per_request_cap_usd = 1 WHERE id = 1;

  -- rate limit: allow exactly one more call in the 10-minute window
  SELECT count(*) INTO _n FROM public.promo_cost_log WHERE admin_id = A AND created_at > now() - interval '10 minutes';
  UPDATE public.promo_settings SET rate_10m = _n + 1 WHERE id = 1;
  r := public.promo_reserve_spend(A, 'copy', 'openrouter', 'google/gemini-2.5-flash', 0.0001, NULL, NULL, NULL, NULL);
  PERFORM pg_temp.ci_assert((r->>'ok')::boolean, 'call under the rate limit: ' || r::text);
  SELECT count(*) INTO _n FROM public.promo_cost_log WHERE admin_id = A;
  r := public.promo_reserve_spend(A, 'copy', 'openrouter', 'google/gemini-2.5-flash', 0.0001, NULL, NULL, NULL, NULL);
  PERFORM pg_temp.ci_assert(r->>'code' = 'rate' AND (r->>'retry_after_s')::int >= 60, 'rate limit: ' || r::text);
  PERFORM pg_temp.ci_assert((SELECT count(*) FROM public.promo_cost_log WHERE admin_id = A) = _n,
    'a refused reservation writes no row');
  UPDATE public.promo_settings SET rate_10m = 500 WHERE id = 1;

  -- daily limit
  SELECT count(*) INTO _n FROM public.promo_cost_log WHERE admin_id = A AND created_at > now() - interval '24 hours';
  UPDATE public.promo_settings SET rate_24h = _n WHERE id = 1;
  r := public.promo_reserve_spend(A, 'copy', 'openrouter', 'google/gemini-2.5-flash', 0.0001, NULL, NULL, NULL, NULL);
  PERFORM pg_temp.ci_assert(r->>'code' = 'rate' AND (r->>'retry_after_s')::int = 3600, 'daily limit: ' || r::text);
  UPDATE public.promo_settings SET rate_24h = 5000 WHERE id = 1;

  -- non-admin and kill switch
  r := public.promo_reserve_spend(B, 'copy', 'openrouter', 'google/gemini-2.5-flash', 0.0001, NULL, NULL, NULL, NULL);
  PERFORM pg_temp.ci_assert(r->>'code' = 'forbidden', 'non-admin (profiles.is_admin only) reservation: ' || r::text);
  UPDATE public.promo_settings SET enabled = false WHERE id = 1;
  r := public.promo_reserve_spend(A, 'copy', 'openrouter', 'google/gemini-2.5-flash', 0.0001, NULL, NULL, NULL, NULL);
  PERFORM pg_temp.ci_assert(r->>'code' = 'disabled', 'kill switch: ' || r::text);
  UPDATE public.promo_settings SET enabled = true WHERE id = 1;

  -- monthly cap 0 refuses everything
  UPDATE public.promo_settings SET monthly_cap_usd = 0 WHERE id = 1;
  r := public.promo_reserve_spend(A, 'copy', 'openrouter', 'google/gemini-2.5-flash', 0.0001, NULL, NULL, NULL, NULL);
  PERFORM pg_temp.ci_assert(r->>'code' = 'budget', 'cap 0: ' || r::text);
  UPDATE public.promo_settings SET monthly_cap_usd = 500 WHERE id = 1;
END $$;

-- ======================================================= creatives state machine
DO $$
DECLARE
  A constant uuid := 'dddddddd-0000-4000-8000-00000000000a';
  _batch constant uuid := 'eeeeeeee-0000-4000-8000-000000000001';
  c1 uuid := 'ffffffff-0000-4000-8000-000000000001';
  c2 uuid := 'ffffffff-0000-4000-8000-000000000002';
  _offer uuid; r jsonb; _cost numeric;
BEGIN
  INSERT INTO public.offers (code, title, discount_type, discount_value)
  VALUES ('CIPROMO' || floor(random() * 1e6)::text, 'CI offer', 'percent', 10) RETURNING id INTO _offer;

  PERFORM pg_temp.ci_assert(pg_temp.ci_refused(format(
    $q$INSERT INTO public.promo_creatives (batch_id, template, format, size, language, variant_index, hook, headline,
        cta, caption, status, created_by)
       VALUES (%L, 'feature_spotlight', 'image', '4:5', 'en', 0, 'h', 'H', 'c', 'cap', 'approved', %L)$q$, _batch, A)),
    'insert as approved');

  INSERT INTO public.promo_creatives (id, batch_id, template, format, size, language, variant_index, hook, headline,
                                      cta, caption, offer_id, created_by)
  VALUES (c1, _batch, 'offer_festival', 'image', '4:5', 'en', 0, 'h', 'H', 'c', 'cap', _offer, A),
         (c2, _batch, 'offer_festival', 'image', '1:1', 'en', 1, 'h2', 'H2', 'c', 'cap', NULL, A);

  PERFORM pg_temp.ci_assert(pg_temp.ci_refused(format(
    $q$UPDATE public.promo_creatives SET status = 'approved' WHERE id = %L$q$, c1)), 'approve before render');
  PERFORM pg_temp.ci_assert(pg_temp.ci_refused(format(
    $q$UPDATE public.promo_creatives SET status = 'posted' WHERE id = %L$q$, c1)), 'draft → posted');
  PERFORM pg_temp.ci_assert(pg_temp.ci_refused(format(
    $q$UPDATE public.promo_creatives SET status = 'scheduled' WHERE id = %L$q$, c1)), 'draft → scheduled');

  -- rendered but text changed after render → still blocked
  UPDATE public.promo_creatives SET output_paths = ARRAY['x.png'], rendered_text_version = 1, text_version = 2 WHERE id = c1;
  PERFORM pg_temp.ci_assert(pg_temp.ci_refused(format(
    $q$UPDATE public.promo_creatives SET status = 'approved' WHERE id = %L$q$, c1)), 'approve a stale render');
  UPDATE public.promo_creatives SET rendered_text_version = 2 WHERE id = c1;
  UPDATE public.promo_creatives SET status = 'approved' WHERE id = c1;
  UPDATE public.promo_creatives SET status = 'scheduled' WHERE id = c1;
  PERFORM pg_temp.ci_assert(pg_temp.ci_refused(format(
    $q$UPDATE public.promo_creatives SET status = 'archived' WHERE id = %L$q$, c1)), 'scheduled → archived');
  UPDATE public.promo_creatives SET status = 'posted' WHERE id = c1;
  PERFORM pg_temp.ci_assert(pg_temp.ci_refused(format(
    $q$UPDATE public.promo_creatives SET status = 'approved' WHERE id = %L$q$, c1)), 'posted → approved');
  PERFORM pg_temp.ci_assert(pg_temp.ci_refused(format(
    $q$UPDATE public.promo_creatives SET headline = 'edited' WHERE id = %L$q$, c1)), 'edit a posted creative');
  PERFORM pg_temp.ci_assert(pg_temp.ci_refused(format(
    $q$DELETE FROM public.promo_creatives WHERE id = %L$q$, c2)), 'delete a creative');

  -- deleting an offer still works when a posted creative points at it (FK ON DELETE SET NULL)
  DELETE FROM public.offers WHERE id = _offer;
  PERFORM pg_temp.ci_assert((SELECT offer_id IS NULL AND status = 'posted' FROM public.promo_creatives WHERE id = c1),
    'offer delete nulls the posted creative''s offer_id');

  -- archive / restore
  UPDATE public.promo_creatives SET status = 'archived' WHERE id = c2;
  UPDATE public.promo_creatives SET status = 'draft' WHERE id = c2;

  -- cost: own rows + an even share of the batch's copy rows
  r := public.promo_reserve_spend(A, 'copy', 'openrouter', 'google/gemini-2.5-flash', 0.006, _batch, NULL, NULL, NULL);
  PERFORM public.promo_settle_spend((r->>'id')::uuid, true, 0.004, NULL, NULL, NULL, NULL);
  r := public.promo_reserve_spend(A, 'background', 'fal', 'fal-ai/flux/schnell', 0.003, _batch, c1, 1, 'megapixels');
  PERFORM public.promo_settle_spend((r->>'id')::uuid, true, NULL, 0.97, NULL, NULL, NULL);
  _cost := public.promo_refresh_creative_cost(c1);
  PERFORM pg_temp.ci_assert(_cost = 0.005, 'c1 cost = 0.003 bg + 0.004/2 copy, got ' || _cost);
  _cost := public.promo_refresh_creative_cost(c2);
  PERFORM pg_temp.ci_assert(_cost = 0.002, 'c2 cost = 0.004/2 copy, got ' || _cost);
END $$;
RESET ROLE;

SELECT 'promo_studio.sql: all assertions passed' AS result;
ROLLBACK;
