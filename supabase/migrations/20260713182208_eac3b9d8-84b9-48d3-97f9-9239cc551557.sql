
CREATE OR REPLACE FUNCTION public.refund_credits(
  _user_id uuid,
  _amount integer,
  _project_id uuid,
  _description text,
  _source text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _sub public.subscriptions%ROWTYPE;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  -- Admin refunds are no-ops (they never paid).
  IF public.is_admin(_user_id) OR _source = 'admin' THEN
    INSERT INTO public.usage_history (user_id, project_id, credits_used, description, source)
    VALUES (_user_id, _project_id, 0, COALESCE('Refund: ' || _description, 'Refund'), 'refund');
    RETURN jsonb_build_object('ok', true, 'source', 'admin');
  END IF;

  IF _source = 'subscription' THEN
    SELECT * INTO _sub FROM public.subscriptions
      WHERE user_id = _user_id AND status = 'active'
      ORDER BY started_at DESC LIMIT 1
      FOR UPDATE;
    IF _sub.id IS NOT NULL AND NOT _sub.unlimited_usage THEN
      UPDATE public.subscriptions
        SET monthly_credits_used = GREATEST(0, monthly_credits_used - _amount)
        WHERE id = _sub.id;
    END IF;
  ELSIF _source = 'balance' THEN
    UPDATE public.profiles
      SET user_credits = user_credits + _amount
      WHERE id = _user_id;
  ELSE
    -- Unknown source: default to wallet balance (safer for the user).
    UPDATE public.profiles
      SET user_credits = user_credits + _amount
      WHERE id = _user_id;
  END IF;

  INSERT INTO public.usage_history (user_id, project_id, credits_used, description, source)
  VALUES (_user_id, _project_id, -_amount, COALESCE('Refund: ' || _description, 'Refund'), 'refund');

  RETURN jsonb_build_object('ok', true, 'source', COALESCE(_source, 'balance'), 'refunded', _amount);
END;
$$;

REVOKE ALL ON FUNCTION public.refund_credits(uuid, integer, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_credits(uuid, integer, uuid, text, text) TO authenticated, service_role;
