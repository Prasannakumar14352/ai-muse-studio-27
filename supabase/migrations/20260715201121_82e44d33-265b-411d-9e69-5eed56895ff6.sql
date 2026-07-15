
-- 1) Ledger table
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  project_id UUID,
  render_job_id UUID,
  credits_estimated INTEGER NOT NULL DEFAULT 0,
  credits_reserved  INTEGER NOT NULL DEFAULT 0,
  credits_charged   INTEGER NOT NULL DEFAULT 0,
  credits_refunded  INTEGER NOT NULL DEFAULT 0,
  balance_before    INTEGER NOT NULL DEFAULT 0,
  balance_after     INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'balance',   -- subscription | balance | lifetime | admin
  status TEXT NOT NULL DEFAULT 'reserved',  -- reserved | charged | refunded | failed
  idempotency_key TEXT NOT NULL,
  description TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS credit_ledger_user_created_idx
  ON public.credit_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS credit_ledger_status_idx
  ON public.credit_ledger(status);

GRANT SELECT ON public.credit_ledger TO authenticated;
GRANT ALL    ON public.credit_ledger TO service_role;

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own ledger" ON public.credit_ledger;
CREATE POLICY "Users read own ledger"
  ON public.credit_ledger
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Writes happen exclusively via SECURITY DEFINER RPCs (service_role owns).
-- No INSERT/UPDATE/DELETE policy for authenticated: client cannot bypass RPCs.

DROP TRIGGER IF EXISTS trg_credit_ledger_updated_at ON public.credit_ledger;
CREATE TRIGGER trg_credit_ledger_updated_at
  BEFORE UPDATE ON public.credit_ledger
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


-- 2) Summary function (plan-aware modal reads this)
CREATE OR REPLACE FUNCTION public.get_credit_summary(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sub public.subscriptions%ROWTYPE;
  _profile public.profiles%ROWTYPE;
  _is_admin BOOLEAN;
  _monthly_remaining INTEGER := 0;
  _balance INTEGER := 0;
  _lifetime INTEGER := 0;
  _plan_type TEXT := 'free';
BEGIN
  _is_admin := public.is_admin(_user_id);

  SELECT * INTO _profile FROM public.profiles WHERE id = _user_id;
  SELECT * INTO _sub FROM public.subscriptions
    WHERE user_id = _user_id AND status = 'active'
    ORDER BY started_at DESC LIMIT 1;

  _balance  := COALESCE(_profile.user_credits, 0);
  _lifetime := COALESCE(_profile.lifetime_credits, 0);

  IF _sub.id IS NOT NULL THEN
    _monthly_remaining := GREATEST(0, COALESCE(_sub.monthly_credit_limit,0) - COALESCE(_sub.monthly_credits_used,0));
    _plan_type := COALESCE(_sub.plan_name, 'free');
  END IF;

  RETURN jsonb_build_object(
    'unlimited', _is_admin OR COALESCE(_sub.unlimited_usage, false),
    'plan_type', CASE WHEN _is_admin THEN 'admin' ELSE _plan_type END,
    'monthly_remaining', _monthly_remaining,
    'balance', _balance,
    'lifetime', _lifetime,
    'available', _monthly_remaining + _balance + _lifetime,
    'can_buy_topups', true  -- top-ups are available on every plan
  );
END;
$$;


-- 3) reserve_credits — atomic hold + idempotent
CREATE OR REPLACE FUNCTION public.reserve_credits(
  _user_id UUID,
  _amount INTEGER,
  _action TEXT,
  _project_id UUID,
  _idempotency_key TEXT,
  _description TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing public.credit_ledger%ROWTYPE;
  _sub public.subscriptions%ROWTYPE;
  _profile public.profiles%ROWTYPE;
  _is_admin BOOLEAN;
  _monthly_remaining INTEGER := 0;
  _available INTEGER := 0;
  _source TEXT := 'balance';
  _bal_before INTEGER := 0;
  _bal_after  INTEGER := 0;
  _new_id UUID;
BEGIN
  IF _amount IS NULL OR _amount < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  -- Idempotency short-circuit
  SELECT * INTO _existing FROM public.credit_ledger
    WHERE user_id = _user_id AND idempotency_key = _idempotency_key
    FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'ledger_id', _existing.id,
      'source', _existing.source,
      'reused', true,
      'status', _existing.status,
      'balance_before', _existing.balance_before,
      'balance_after',  _existing.balance_after
    );
  END IF;

  _is_admin := public.is_admin(_user_id);

  SELECT * INTO _profile FROM public.profiles WHERE id = _user_id FOR UPDATE;
  SELECT * INTO _sub FROM public.subscriptions
    WHERE user_id = _user_id AND status = 'active'
    ORDER BY started_at DESC LIMIT 1 FOR UPDATE;

  -- Admin / unlimited: audit-only zero-cost row
  IF _is_admin OR COALESCE(_sub.unlimited_usage, false) THEN
    INSERT INTO public.credit_ledger(user_id, action, project_id, credits_estimated,
      credits_reserved, credits_charged, source, status, idempotency_key, description,
      balance_before, balance_after)
    VALUES (_user_id, _action, _project_id, _amount, 0, 0,
      CASE WHEN _is_admin THEN 'admin' ELSE 'subscription' END,
      'reserved', _idempotency_key, _description, 0, 0)
    RETURNING id INTO _new_id;
    RETURN jsonb_build_object('ok', true, 'ledger_id', _new_id,
      'source', CASE WHEN _is_admin THEN 'admin' ELSE 'subscription' END,
      'unlimited', true, 'balance_before', 0, 'balance_after', 0);
  END IF;

  IF _sub.id IS NOT NULL THEN
    _monthly_remaining := GREATEST(0, COALESCE(_sub.monthly_credit_limit,0) - COALESCE(_sub.monthly_credits_used,0));
  END IF;
  _available := _monthly_remaining + COALESCE(_profile.user_credits,0) + COALESCE(_profile.lifetime_credits,0);

  IF _amount > _available THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_credits',
      'required', _amount,
      'available', _available,
      'shortage', _amount - _available,
      'monthly_remaining', _monthly_remaining,
      'balance', COALESCE(_profile.user_credits,0),
      'lifetime', COALESCE(_profile.lifetime_credits,0),
      'plan_type', COALESCE(_sub.plan_name, 'free')
    );
  END IF;

  _bal_before := _available;

  -- Consumption order: monthly → balance → lifetime
  IF _monthly_remaining >= _amount THEN
    UPDATE public.subscriptions SET monthly_credits_used = monthly_credits_used + _amount WHERE id = _sub.id;
    _source := 'subscription';
  ELSIF _monthly_remaining > 0 THEN
    -- split
    UPDATE public.subscriptions SET monthly_credits_used = monthly_credits_used + _monthly_remaining WHERE id = _sub.id;
    DECLARE _rem INTEGER := _amount - _monthly_remaining;
    BEGIN
      IF COALESCE(_profile.user_credits,0) >= _rem THEN
        UPDATE public.profiles SET user_credits = user_credits - _rem WHERE id = _user_id;
        _source := 'subscription';  -- primary source label
      ELSE
        DECLARE _rem2 INTEGER := _rem - COALESCE(_profile.user_credits,0);
        BEGIN
          UPDATE public.profiles SET user_credits = 0 WHERE id = _user_id;
          UPDATE public.profiles SET lifetime_credits = lifetime_credits - _rem2 WHERE id = _user_id;
          _source := 'subscription';
        END;
      END IF;
    END;
  ELSIF COALESCE(_profile.user_credits,0) >= _amount THEN
    UPDATE public.profiles SET user_credits = user_credits - _amount WHERE id = _user_id;
    _source := 'balance';
  ELSIF COALESCE(_profile.user_credits,0) > 0 THEN
    DECLARE _rem INTEGER := _amount - COALESCE(_profile.user_credits,0);
    BEGIN
      UPDATE public.profiles SET user_credits = 0 WHERE id = _user_id;
      UPDATE public.profiles SET lifetime_credits = lifetime_credits - _rem WHERE id = _user_id;
      _source := 'balance';
    END;
  ELSE
    UPDATE public.profiles SET lifetime_credits = lifetime_credits - _amount WHERE id = _user_id;
    _source := 'lifetime';
  END IF;

  _bal_after := _bal_before - _amount;

  INSERT INTO public.credit_ledger(user_id, action, project_id, credits_estimated,
    credits_reserved, source, status, idempotency_key, description,
    balance_before, balance_after)
  VALUES (_user_id, _action, _project_id, _amount, _amount, _source,
    'reserved', _idempotency_key, _description, _bal_before, _bal_after)
  RETURNING id INTO _new_id;

  RETURN jsonb_build_object('ok', true, 'ledger_id', _new_id, 'source', _source,
    'balance_before', _bal_before, 'balance_after', _bal_after);
END;
$$;


-- 4) finalize_credits — mark reserved row as charged
CREATE OR REPLACE FUNCTION public.finalize_credits(_ledger_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _row public.credit_ledger%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.credit_ledger WHERE id = _ledger_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF _row.status = 'charged' THEN RETURN jsonb_build_object('ok', true, 'reused', true); END IF;
  IF _row.status <> 'reserved' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', _row.status);
  END IF;
  UPDATE public.credit_ledger SET status = 'charged', credits_charged = credits_reserved
    WHERE id = _ledger_id;

  -- Mirror into legacy usage_history for existing analytics
  INSERT INTO public.usage_history (user_id, project_id, credits_used, description, source)
  VALUES (_row.user_id, _row.project_id, _row.credits_reserved, COALESCE(_row.description, _row.action), _row.source);

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- 5) refund_credits_by_ledger — restore to same source, mark refunded
CREATE OR REPLACE FUNCTION public.refund_credits_by_ledger(_ledger_id UUID, _reason TEXT)
RETURNS JSONB
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
  IF _row.status IN ('refunded','failed') THEN
    RETURN jsonb_build_object('ok', true, 'reused', true);
  END IF;
  IF _row.credits_reserved <= 0 THEN
    UPDATE public.credit_ledger SET status = 'failed', error = _reason WHERE id = _ledger_id;
    RETURN jsonb_build_object('ok', true, 'noop', true);
  END IF;

  IF _row.source = 'subscription' THEN
    SELECT * INTO _sub FROM public.subscriptions
      WHERE user_id = _row.user_id AND status = 'active'
      ORDER BY started_at DESC LIMIT 1 FOR UPDATE;
    IF _sub.id IS NOT NULL AND NOT COALESCE(_sub.unlimited_usage,false) THEN
      UPDATE public.subscriptions SET monthly_credits_used = GREATEST(0, monthly_credits_used - _row.credits_reserved)
        WHERE id = _sub.id;
    END IF;
  ELSIF _row.source = 'lifetime' THEN
    UPDATE public.profiles SET lifetime_credits = COALESCE(lifetime_credits,0) + _row.credits_reserved
      WHERE id = _row.user_id;
  ELSIF _row.source = 'balance' THEN
    UPDATE public.profiles SET user_credits = COALESCE(user_credits,0) + _row.credits_reserved
      WHERE id = _row.user_id;
  END IF;

  UPDATE public.credit_ledger
    SET status = 'refunded', credits_refunded = _row.credits_reserved, error = _reason
    WHERE id = _ledger_id;

  RETURN jsonb_build_object('ok', true, 'refunded', _row.credits_reserved, 'source', _row.source);
END;
$$;
