-- Landing lead magnet ("50 faceless video ideas"): visitors leave an email (and optionally
-- WhatsApp) to unlock the list. Additive only: one new table + one RPC. No existing table changes.
-- Writes only through submit_landing_lead() (service role, called by a server function);
-- clients can't read or write the table; admins can read it.

CREATE TABLE IF NOT EXISTS public.landing_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (char_length(email) BETWEEN 5 AND 254 AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name text CHECK (name IS NULL OR char_length(name) <= 80),
  whatsapp text CHECK (whatsapp IS NULL OR whatsapp ~ '^\+?[0-9 ]{8,16}$'),
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'te', 'hi', 'other')),
  source text NOT NULL DEFAULT 'video_ideas' CHECK (char_length(source) <= 40),
  utm jsonb NOT NULL DEFAULT '{}',
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS landing_leads_email_uidx ON public.landing_leads (lower(email));
CREATE INDEX IF NOT EXISTS landing_leads_time_idx ON public.landing_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS landing_leads_ip_idx ON public.landing_leads (ip_hash, created_at DESC);

ALTER TABLE public.landing_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.landing_leads FROM anon, authenticated;
GRANT SELECT ON public.landing_leads TO authenticated;
GRANT ALL ON public.landing_leads TO service_role;
DROP POLICY IF EXISTS "Admins read landing_leads" ON public.landing_leads;
CREATE POLICY "Admins read landing_leads" ON public.landing_leads
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Insert or refresh one lead. Max 5 new leads per IP hash per hour (spam guard).
-- Returns 'ok' | 'rate' | 'invalid'.
CREATE OR REPLACE FUNCTION public.submit_landing_lead(
  _email text, _name text, _whatsapp text, _language text, _source text, _utm jsonb, _ip_hash text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  IF _email IS NULL OR _email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(_email) > 254 THEN RETURN 'invalid'; END IF;
  IF _ip_hash IS NOT NULL THEN
    SELECT count(*) INTO _n FROM public.landing_leads
     WHERE ip_hash = _ip_hash AND created_at > now() - interval '1 hour';
    IF _n >= 5 THEN RETURN 'rate'; END IF;
  END IF;
  INSERT INTO public.landing_leads (email, name, whatsapp, language, source, utm, ip_hash)
  VALUES (lower(trim(_email)), nullif(left(trim(_name), 80), ''), nullif(trim(_whatsapp), ''),
          coalesce(_language, 'en'), coalesce(left(_source, 40), 'video_ideas'), coalesce(_utm, '{}'), _ip_hash)
  ON CONFLICT (lower(email)) DO UPDATE
    SET name = coalesce(EXCLUDED.name, landing_leads.name),
        whatsapp = coalesce(EXCLUDED.whatsapp, landing_leads.whatsapp),
        updated_at = now();
  RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION public.submit_landing_lead(text, text, text, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_landing_lead(text, text, text, text, text, jsonb, text) TO service_role;

-- Rollback (not run): DROP FUNCTION public.submit_landing_lead(text,text,text,text,text,jsonb,text); DROP TABLE public.landing_leads;
