-- Regression test for audit 2026-11-26 C1-C4 (migration 20261126120000_credit_integrity_lockdown).
--
-- Plain SQL asserts; any failure raises an exception. Everything runs in one
-- transaction and is rolled back, so it leaves no data behind.
-- Run against a LOCAL / branch database only, never production:
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/credit_integrity.sql
-- Expects the Supabase roles (anon, authenticated, service_role), auth.users,
-- auth.uid() and all migrations applied.

BEGIN;

-- ---------------------------------------------------------------- fixtures
-- Two users; handle_new_user() creates their profiles and free subscriptions.
INSERT INTO auth.users (id, email)
VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'ci-user-a@example.test'),
       ('aaaaaaaa-0000-4000-8000-000000000002', 'ci-user-b@example.test');

UPDATE public.profiles SET user_credits = 100, lifetime_credits = 0
 WHERE id IN ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002');

-- Ledger rows for user A: one open reservation, one finalized (charged) generation.
INSERT INTO public.credit_ledger (id, user_id, action, credits_estimated, credits_reserved,
                                  credits_charged, source, status, idempotency_key)
VALUES ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'image', 7, 7, 0,
        'balance', 'reserved', 'ci:reserved'),
       ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'image', 9, 9, 9,
        'balance', 'charged', 'ci:charged');

INSERT INTO public.generation_jobs (id, user_id, module_type, job_type, ledger_id)
VALUES ('cccccccc-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'seo', 'package',
        'bbbbbbbb-0000-4000-8000-000000000001');

-- Helper: run a statement as an API role and report whether it was refused.
CREATE OR REPLACE FUNCTION pg_temp.ci_refused(_sql text) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN false;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN true;
END $$;

-- ------------------------------------------------- act as authenticated user A
SELECT set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE _n int;
BEGIN
  -- C1: Settings fields still work.
  UPDATE public.profiles SET full_name = 'CI Name', brand_name = 'CI Brand'
   WHERE id = auth.uid();
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n <> 1 THEN RAISE EXCEPTION 'C1: user could not update own full_name (rows=%)', _n; END IF;

  -- C1: money / admin / plan columns are refused.
  IF NOT pg_temp.ci_refused($q$UPDATE public.profiles SET user_credits = 999999 WHERE id = auth.uid()$q$) THEN
    RAISE EXCEPTION 'C1: authenticated user updated user_credits';
  END IF;
  IF NOT pg_temp.ci_refused($q$UPDATE public.profiles SET lifetime_credits = 999999 WHERE id = auth.uid()$q$) THEN
    RAISE EXCEPTION 'C1: authenticated user updated lifetime_credits';
  END IF;
  IF NOT pg_temp.ci_refused($q$UPDATE public.profiles SET is_admin = true WHERE id = auth.uid()$q$) THEN
    RAISE EXCEPTION 'C1: authenticated user updated is_admin';
  END IF;
  IF NOT pg_temp.ci_refused($q$UPDATE public.profiles SET role = 'admin' WHERE id = auth.uid()$q$) THEN
    RAISE EXCEPTION 'C1: authenticated user updated role';
  END IF;
  IF NOT pg_temp.ci_refused($q$UPDATE public.profiles SET plan = 'pro' WHERE id = auth.uid()$q$) THEN
    RAISE EXCEPTION 'C1: authenticated user updated plan';
  END IF;
  IF NOT pg_temp.ci_refused($q$INSERT INTO public.profiles (id) VALUES ('aaaaaaaa-0000-4000-8000-0000000000ff')$q$) THEN
    RAISE EXCEPTION 'C1: authenticated user inserted a profile';
  END IF;

  -- C2: subscriptions are read-only.
  PERFORM 1 FROM public.subscriptions WHERE user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'C2: user can no longer read own subscription'; END IF;
  IF NOT pg_temp.ci_refused($q$UPDATE public.subscriptions SET plan_name = 'pro', unlimited_usage = true WHERE user_id = auth.uid()$q$) THEN
    RAISE EXCEPTION 'C2: authenticated user updated own subscription';
  END IF;
  IF NOT pg_temp.ci_refused($q$INSERT INTO public.subscriptions (user_id, plan_name, unlimited_usage) VALUES (auth.uid(), 'pro', true)$q$) THEN
    RAISE EXCEPTION 'C2: authenticated user inserted a subscription';
  END IF;
  IF NOT pg_temp.ci_refused($q$DELETE FROM public.subscriptions WHERE user_id = auth.uid()$q$) THEN
    RAISE EXCEPTION 'C2: authenticated user deleted a subscription';
  END IF;

  -- C4: generation_jobs.ledger_id / status are no longer user-writable.
  IF NOT pg_temp.ci_refused($q$UPDATE public.generation_jobs SET ledger_id = 'bbbbbbbb-0000-4000-8000-000000000002' WHERE user_id = auth.uid()$q$) THEN
    RAISE EXCEPTION 'C4: authenticated user rewrote generation_jobs.ledger_id';
  END IF;
  IF NOT pg_temp.ci_refused($q$INSERT INTO public.generation_jobs (user_id, module_type, job_type, ledger_id) VALUES (auth.uid(), 'x', 'y', 'bbbbbbbb-0000-4000-8000-000000000002')$q$) THEN
    RAISE EXCEPTION 'C4: authenticated user inserted a generation job';
  END IF;

  -- Credit RPCs stay service-role only.
  IF NOT pg_temp.ci_refused($q$SELECT public.refund_credits_by_ledger('bbbbbbbb-0000-4000-8000-000000000001', 'x')$q$) THEN
    RAISE EXCEPTION 'C4: authenticated user executed refund_credits_by_ledger';
  END IF;
  IF NOT pg_temp.ci_refused($q$UPDATE public.credit_ledger SET status = 'reserved' WHERE user_id = auth.uid()$q$) THEN
    RAISE EXCEPTION 'C4: authenticated user updated credit_ledger';
  END IF;
END $$;

RESET ROLE;

-- ------------------------------------------- defence in depth: the trigger
-- Even if UPDATE on user_credits were granted again, the trigger refuses it.
GRANT UPDATE (user_credits, is_admin) ON public.profiles TO authenticated;  -- rolled back at the end
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF NOT pg_temp.ci_refused($q$UPDATE public.profiles SET user_credits = 999999 WHERE id = auth.uid()$q$) THEN
    RAISE EXCEPTION 'C1: trigger did not block user_credits for authenticated';
  END IF;
  IF NOT pg_temp.ci_refused($q$UPDATE public.profiles SET is_admin = true WHERE id = auth.uid()$q$) THEN
    RAISE EXCEPTION 'C1: trigger did not block is_admin for authenticated';
  END IF;
END $$;
RESET ROLE;

-- --------------------------------------------- server paths still work
SET LOCAL ROLE service_role;
DO $$
DECLARE _r jsonb; _bal int; _name text;
BEGIN
  -- Server (service role) can still grant credits.
  UPDATE public.profiles SET user_credits = user_credits + 1 WHERE id = 'aaaaaaaa-0000-4000-8000-000000000002';
  SELECT user_credits INTO _bal FROM public.profiles WHERE id = 'aaaaaaaa-0000-4000-8000-000000000002';
  IF _bal <> 101 THEN RAISE EXCEPTION 'service_role could not update user_credits (balance=%)', _bal; END IF;

  SELECT full_name INTO _name FROM public.profiles WHERE id = 'aaaaaaaa-0000-4000-8000-000000000001';
  IF _name <> 'CI Name' THEN RAISE EXCEPTION 'C1: full_name update did not persist (%)', _name; END IF;

  -- C4: a charged (successful) generation is not refundable.
  _r := public.refund_credits_by_ledger('bbbbbbbb-0000-4000-8000-000000000002', 'ci');
  IF (_r->>'ok')::boolean OR _r->>'error' <> 'not_refundable' THEN
    RAISE EXCEPTION 'C4: charged row was refundable: %', _r;
  END IF;
  SELECT user_credits INTO _bal FROM public.profiles WHERE id = 'aaaaaaaa-0000-4000-8000-000000000001';
  IF _bal <> 100 THEN RAISE EXCEPTION 'C4: balance changed after refusing a charged refund (%)', _bal; END IF;
  PERFORM 1 FROM public.credit_ledger WHERE id = 'bbbbbbbb-0000-4000-8000-000000000002' AND status = 'charged';
  IF NOT FOUND THEN RAISE EXCEPTION 'C4: charged row status changed'; END IF;

  -- C4: an open reservation is refunded to its source exactly once.
  _r := public.refund_credits_by_ledger('bbbbbbbb-0000-4000-8000-000000000001', 'ci');
  IF NOT (_r->>'ok')::boolean OR (_r->>'refunded')::int <> 7 THEN
    RAISE EXCEPTION 'C4: reserved row was not refunded: %', _r;
  END IF;
  SELECT user_credits INTO _bal FROM public.profiles WHERE id = 'aaaaaaaa-0000-4000-8000-000000000001';
  IF _bal <> 107 THEN RAISE EXCEPTION 'C4: reserved refund did not restore balance (%)', _bal; END IF;

  _r := public.refund_credits_by_ledger('bbbbbbbb-0000-4000-8000-000000000001', 'ci again');
  SELECT user_credits INTO _bal FROM public.profiles WHERE id = 'aaaaaaaa-0000-4000-8000-000000000001';
  IF _bal <> 107 OR NOT COALESCE((_r->>'reused')::boolean, false) THEN
    RAISE EXCEPTION 'C4: second refund was not an idempotent no-op (balance=%, r=%)', _bal, _r;
  END IF;
END $$;
RESET ROLE;

-- C3: the arbitrary-amount refund function is gone.
DO $$
BEGIN
  IF to_regprocedure('public.refund_credits(uuid, integer, uuid, text, text)') IS NOT NULL THEN
    RAISE EXCEPTION 'C3: public.refund_credits still exists';
  END IF;
END $$;

SELECT 'credit_integrity: all assertions passed' AS result;

ROLLBACK;
