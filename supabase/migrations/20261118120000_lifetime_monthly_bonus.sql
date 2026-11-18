-- Lifetime plans: one-time credits + a small monthly bonus that does not roll over.
--   Starter Lifetime  1,500 one-time + 75 / month
--   Creator Lifetime  4,000 one-time + 150 / month
--   Pro Lifetime      9,000 one-time + 300 / month
-- The bonus lives in subscriptions.monthly_credit_limit (set from
-- pricing_plans.monthly_credits at purchase) and is spent before the one-time
-- credits. refill_subscription_credits() now resets it monthly for lifetime
-- buyers too, on their purchase day of the month.

UPDATE public.pricing_plans SET monthly_credits = 75,
  features = to_jsonb(ARRAY['Lifetime account','All core modules','1,500 included credits','+75 bonus credits every month','Commercial usage','Basic templates','Standard AI generation','Manual publishing','Download unlimited outputs','Buy additional credit packs','No recurring payments'])
  WHERE code = 'starter_life';
UPDATE public.pricing_plans SET monthly_credits = 150,
  features = to_jsonb(ARRAY['Everything in Starter Lifetime','4,000 included credits','+150 bonus credits every month','More templates','Higher usage limits','Larger storage'])
  WHERE code = 'creator_life';
UPDATE public.pricing_plans SET monthly_credits = 300,
  features = to_jsonb(ARRAY['Everything in Creator Lifetime','9,000 included credits','+300 bonus credits every month','Priority rendering','Premium templates','Priority support'])
  WHERE code = 'pro_life';

-- Existing lifetime buyers (if any) get the bonus too.
UPDATE public.subscriptions s
   SET monthly_credit_limit = p.monthly_credits
  FROM public.pricing_plans p
 WHERE s.plan_name = p.code
   AND s.plan_type = 'lifetime'
   AND s.status = 'active'
   AND p.monthly_credits > 0;

CREATE OR REPLACE FUNCTION public.refill_subscription_credits(_today date DEFAULT current_date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  -- Yearly plans and lifetime plans with a monthly bonus refill on the
  -- buyer's monthly start day (clamped to month end). Monthly plans refill
  -- when they pay again. Unused monthly credits do not carry over.
  UPDATE public.subscriptions s
     SET monthly_credits_used = 0,
         last_credit_refill_at = now()
   WHERE s.status = 'active'
     AND (
           (s.plan_type = 'yearly' AND COALESCE(s.lifetime_access, false) = false)
        OR (s.plan_type = 'lifetime' AND COALESCE(s.monthly_credit_limit, 0) > 0)
         )
     AND (s.expires_at IS NULL OR s.expires_at > now())
     AND s.started_at::date < _today
     AND (s.last_credit_refill_at IS NULL OR s.last_credit_refill_at::date < _today)
     AND LEAST(
           EXTRACT(day FROM s.started_at)::int,
           EXTRACT(day FROM (date_trunc('month', _today) + interval '1 month - 1 day'))::int
         ) = EXTRACT(day FROM _today)::int;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.refill_subscription_credits(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refill_subscription_credits(date) TO service_role;
