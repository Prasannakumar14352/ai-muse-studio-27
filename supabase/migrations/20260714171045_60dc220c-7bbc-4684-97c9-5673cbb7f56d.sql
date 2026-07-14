
CREATE TABLE public.fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency text NOT NULL DEFAULT 'USD',
  quote_currency text NOT NULL DEFAULT 'INR',
  rate numeric(12,6) NOT NULL,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'live',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fx_rates_pair_fetched ON public.fx_rates (base_currency, quote_currency, fetched_at DESC);

GRANT SELECT ON public.fx_rates TO authenticated;
GRANT ALL ON public.fx_rates TO service_role;

ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read fx rates" ON public.fx_rates
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS exchange_rate_source text,
  ADD COLUMN IF NOT EXISTS exchange_rate_fetched_at timestamptz;

INSERT INTO public.app_settings (key, value)
VALUES
  ('usd_to_inr_manual_fallback', '{"rate": 96.25}'::jsonb),
  ('usd_to_inr_manual_override', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Bump stale seeded default from 88.5 to 96.25 if it is still the old default.
UPDATE public.app_settings
SET value = '{"rate": 96.25}'::jsonb, updated_at = now()
WHERE key = 'usd_to_inr_rate'
  AND (value->>'rate')::numeric = 88.5;
