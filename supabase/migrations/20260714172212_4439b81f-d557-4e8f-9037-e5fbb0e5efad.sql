
CREATE TABLE IF NOT EXISTS public.payment_provider_settings (
  provider text PRIMARY KEY,
  environment text NOT NULL DEFAULT 'test' CHECK (environment IN ('test','live')),
  enabled boolean NOT NULL DEFAULT false,
  key_id text,
  key_secret_cipher text,
  key_secret_iv text,
  webhook_secret_cipher text,
  webhook_secret_iv text,
  company_name text,
  logo_url text,
  theme_color text,
  currency text NOT NULL DEFAULT 'INR',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.payment_provider_settings TO service_role;
ALTER TABLE public.payment_provider_settings ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies: all reads/writes go through server functions
-- that use the service role after verifying the caller is an admin.

DROP TRIGGER IF EXISTS tg_pps_updated_at ON public.payment_provider_settings;
CREATE TRIGGER tg_pps_updated_at
  BEFORE UPDATE ON public.payment_provider_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.payment_provider_settings (provider, environment, enabled, currency)
VALUES ('razorpay', 'test', false, 'INR')
ON CONFLICT (provider) DO NOTHING;
