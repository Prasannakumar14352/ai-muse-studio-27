-- Credit integrity lockdown (audit 2026-11-26, findings C1-C4).
--
-- C1  profiles: users could UPDATE user_credits / lifetime_credits / is_admin /
--     role / plan on their own row (table-wide UPDATE grant, no WITH CHECK).
-- C2  subscriptions: users could INSERT/UPDATE their own subscription
--     (plan_name, unlimited_usage, monthly_credit_limit ...).
-- C3  refund_credits(): mints an arbitrary amount; only caller was the
--     client-callable refundCreditsFn, which is deleted in the same change.
-- C4  refund_credits_by_ledger() refunded rows already 'charged' (successful
--     generations); generation_jobs.ledger_id was user-writable.
--
-- Idempotent: safe to run more than once. Writes no user data.

------------------------------------------------------------------------------
-- C1. profiles: only the Settings fields are user-writable
------------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles FROM anon, authenticated;
-- Column-level grant: the only columns Settings writes (src/routes/_authenticated/settings.tsx).
GRANT UPDATE (full_name, brand_name, default_platform, default_tone, default_style)
  ON public.profiles TO authenticated;

-- Profiles are created by the SECURITY DEFINER signup trigger handle_new_user();
-- no client code inserts them.
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;

-- Re-create the self-update policy with a WITH CHECK so a row can't be moved to another id.
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Defence in depth: even if a future migration re-grants UPDATE, API roles
-- (anon / authenticated) can never change money, plan or admin fields.
-- Server code (service_role) and SECURITY DEFINER functions (owner role) are unaffected.
CREATE OR REPLACE FUNCTION public.tg_profiles_protect_privileged()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'profiles: rows are created by the server only'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.id               IS DISTINCT FROM OLD.id
    OR NEW.email            IS DISTINCT FROM OLD.email
    OR NEW.user_credits     IS DISTINCT FROM OLD.user_credits
    OR NEW.lifetime_credits IS DISTINCT FROM OLD.lifetime_credits
    OR NEW.is_admin         IS DISTINCT FROM OLD.is_admin
    OR NEW.role             IS DISTINCT FROM OLD.role
    OR NEW.plan             IS DISTINCT FROM OLD.plan THEN
      RAISE EXCEPTION 'profiles: credits, plan and admin fields can only be changed by the server'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_privileged ON public.profiles;
CREATE TRIGGER profiles_protect_privileged
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_protect_privileged();

------------------------------------------------------------------------------
-- C2. subscriptions: read-only for users; billing writes with the service role
------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users insert own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users update own subscription" ON public.subscriptions;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.subscriptions FROM anon, authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;

------------------------------------------------------------------------------
-- C3. refund_credits(): arbitrary-amount refund, no remaining callers
------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.refund_credits(uuid, integer, uuid, text, text);

------------------------------------------------------------------------------
-- C4. Only an open reservation can be refunded
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_credits_by_ledger(_ledger_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.credit_ledger%ROWTYPE;
  _sub public.subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.credit_ledger WHERE id = _ledger_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  -- Already settled as refunded/failed: idempotent no-op (unchanged behaviour).
  IF _row.status IN ('refunded', 'failed') THEN
    RETURN jsonb_build_object('ok', true, 'reused', true);
  END IF;

  -- A finalized ('charged') generation succeeded and is never refundable here.
  IF _row.status <> 'reserved' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_refundable', 'status', _row.status);
  END IF;

  IF _row.credits_reserved <= 0 THEN
    UPDATE public.credit_ledger SET status = 'failed', error = _reason WHERE id = _ledger_id;
    RETURN jsonb_build_object('ok', true, 'noop', true);
  END IF;

  IF _row.source = 'subscription' THEN
    SELECT * INTO _sub FROM public.subscriptions
      WHERE user_id = _row.user_id AND status = 'active'
      ORDER BY started_at DESC LIMIT 1 FOR UPDATE;
    IF _sub.id IS NOT NULL AND NOT COALESCE(_sub.unlimited_usage, false) THEN
      UPDATE public.subscriptions SET monthly_credits_used = GREATEST(0, monthly_credits_used - _row.credits_reserved)
        WHERE id = _sub.id;
    END IF;
  ELSIF _row.source = 'lifetime' THEN
    UPDATE public.profiles SET lifetime_credits = COALESCE(lifetime_credits, 0) + _row.credits_reserved
      WHERE id = _row.user_id;
  ELSIF _row.source = 'balance' THEN
    UPDATE public.profiles SET user_credits = COALESCE(user_credits, 0) + _row.credits_reserved
      WHERE id = _row.user_id;
  END IF;

  UPDATE public.credit_ledger
    SET status = 'refunded', credits_refunded = _row.credits_reserved, error = _reason
    WHERE id = _ledger_id;

  RETURN jsonb_build_object('ok', true, 'refunded', _row.credits_reserved, 'source', _row.source);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refund_credits_by_ledger(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_credits_by_ledger(uuid, text) TO service_role;

-- generation_jobs: every write goes through server functions (service role).
-- Users keep SELECT on their own jobs but can no longer rewrite ledger_id,
-- credits_* or status.
DROP POLICY IF EXISTS jobs_owner_insert ON public.generation_jobs;
DROP POLICY IF EXISTS jobs_owner_update ON public.generation_jobs;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.generation_jobs FROM anon, authenticated;
GRANT SELECT ON public.generation_jobs TO authenticated;

-- credit_ledger: already has no write policies; make the grants match.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.credit_ledger FROM anon, authenticated;
GRANT SELECT ON public.credit_ledger TO authenticated;
