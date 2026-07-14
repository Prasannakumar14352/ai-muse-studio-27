
-- Extend pricing_plans for INR-first monthly/yearly/lifetime pricing + admin CRUD
ALTER TABLE public.pricing_plans
  ADD COLUMN IF NOT EXISTS tier text,
  ADD COLUMN IF NOT EXISTS price_monthly_inr integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_yearly_inr  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_lifetime_inr integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_pct integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS badge text;

-- Relax plan_type check to include 'subscription' (kept old values for back-compat)
ALTER TABLE public.pricing_plans DROP CONSTRAINT IF EXISTS pricing_plans_plan_type_check;
ALTER TABLE public.pricing_plans ADD CONSTRAINT pricing_plans_plan_type_check
  CHECK (plan_type = ANY (ARRAY['free','monthly','yearly','subscription','lifetime','enterprise']));

-- Public (anon) can read active plans for the landing page
GRANT SELECT ON public.pricing_plans TO anon;
DROP POLICY IF EXISTS "Read active plans" ON public.pricing_plans;
CREATE POLICY "Read active plans" ON public.pricing_plans
  FOR SELECT
  USING (active = true OR has_role(auth.uid(), 'admin'::public.app_role));
