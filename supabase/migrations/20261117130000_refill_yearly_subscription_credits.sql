-- Monthly credit refill for yearly subscribers.
-- Yearly plans store a monthly credit limit; this resets the used counter on
-- the subscriber's monthly start day (clamped to month end, e.g. a sub started
-- on the 31st refills on Feb 28/29). Monthly plans refill when they pay again.
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS last_credit_refill_at timestamptz;

CREATE OR REPLACE FUNCTION public.refill_subscription_credits(_today date DEFAULT current_date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.subscriptions s
     SET monthly_credits_used = 0,
         last_credit_refill_at = now()
   WHERE s.status = 'active'
     AND s.plan_type = 'yearly'
     AND COALESCE(s.lifetime_access, false) = false
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

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('refill-yearly-credits', '30 0 * * *', $cron$SELECT public.refill_subscription_credits()$cron$);
