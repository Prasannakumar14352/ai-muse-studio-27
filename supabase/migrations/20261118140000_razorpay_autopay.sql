-- Razorpay Subscriptions (auto-debit) for monthly / yearly plans.
--
-- * subscriptions gains razorpay_subscription_id, auto_renew and payment_issue.
-- * razorpay_subscriptions tracks each checkout → Razorpay subscription.
-- * razorpay_plan_map caches the Razorpay plan ids (looked up by name, e.g.
--   "CreatorFlow Pro Monthly") per environment, with their INR amounts.
-- * refill_subscription_credits() also returns expired cancelled plans to Free.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id text,
  ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_issue text;
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_razorpay_subscription_id_key
  ON public.subscriptions (razorpay_subscription_id) WHERE razorpay_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.razorpay_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code text NOT NULL,
  cycle text NOT NULL CHECK (cycle IN ('monthly', 'yearly')),
  razorpay_subscription_id text NOT NULL UNIQUE,
  razorpay_plan_id text NOT NULL,
  amount_paise integer NOT NULL,
  status text NOT NULL DEFAULT 'created',
  current_end timestamptz,
  environment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rzp_subs_user ON public.razorpay_subscriptions (user_id, created_at DESC);
ALTER TABLE public.razorpay_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own razorpay subscriptions" ON public.razorpay_subscriptions;
CREATE POLICY "own razorpay subscriptions" ON public.razorpay_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.razorpay_plan_map (
  plan_code text NOT NULL,
  cycle text NOT NULL CHECK (cycle IN ('monthly', 'yearly')),
  environment text NOT NULL,
  razorpay_plan_id text NOT NULL,
  amount_paise integer NOT NULL,
  plan_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_code, cycle, environment)
);
ALTER TABLE public.razorpay_plan_map ENABLE ROW LEVEL SECURITY; -- service role only

CREATE OR REPLACE FUNCTION public.refill_subscription_credits(_today date DEFAULT current_date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  -- Paid plans that were cancelled and have run out go back to Free.
  UPDATE public.subscriptions
     SET plan_name = 'free', plan_type = 'free', monthly_credit_limit = 0, monthly_credits_used = 0,
         renews_at = NULL, expires_at = NULL, auto_renew = false, razorpay_subscription_id = NULL,
         started_at = now()
   WHERE status = 'active'
     AND plan_type IN ('monthly', 'yearly')
     AND COALESCE(unlimited_usage, false) = false
     AND expires_at IS NOT NULL
     AND expires_at < now();

  -- Yearly plans and lifetime plans with a monthly bonus refill on the
  -- buyer's monthly start day (clamped to month end). Monthly plans refill
  -- when they are charged again. Unused monthly credits do not carry over.
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
