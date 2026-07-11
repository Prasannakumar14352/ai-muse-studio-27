
CREATE TABLE IF NOT EXISTS public.oauth_provider_configs (
  provider text PRIMARY KEY,
  client_id text,
  client_secret_encrypted text,
  client_secret_iv text,
  enabled boolean NOT NULL DEFAULT false,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oauth_provider_configs TO authenticated;
GRANT ALL ON public.oauth_provider_configs TO service_role;
ALTER TABLE public.oauth_provider_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage oauth configs" ON public.oauth_provider_configs;
CREATE POLICY "admins manage oauth configs" ON public.oauth_provider_configs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO public.oauth_provider_configs (provider, enabled) VALUES
  ('meta', false), ('google', false), ('linkedin', false)
ON CONFLICT (provider) DO NOTHING;
