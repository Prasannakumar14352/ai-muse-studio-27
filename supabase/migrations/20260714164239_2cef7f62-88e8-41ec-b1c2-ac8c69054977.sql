
-- App settings (key/value) for admin-editable knobs like usd_to_inr_rate
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings public read" ON public.app_settings;
CREATE POLICY "app_settings public read" ON public.app_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "app_settings admin write" ON public.app_settings;
CREATE POLICY "app_settings admin write" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.tg_app_settings_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS app_settings_updated_at ON public.app_settings;
CREATE TRIGGER app_settings_updated_at BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_app_settings_updated_at();

-- Seed the default USD→INR rate if not set
INSERT INTO public.app_settings (key, value)
VALUES ('usd_to_inr_rate', '{"rate": 88.5}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Extend payments with INR audit fields (USD original, rate, INR paise)
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS price_usd_cents INTEGER,
  ADD COLUMN IF NOT EXISTS conversion_rate NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS amount_inr_paise INTEGER;
