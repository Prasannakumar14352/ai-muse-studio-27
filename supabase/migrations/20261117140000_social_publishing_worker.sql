-- Real social publishing: worker schedule, secret check, extra job columns.
--
-- * scheduled_posts gains title (YouTube/LinkedIn title) and provider_state
--   (e.g. an Instagram container still processing between worker runs).
-- * A random secret is kept in Supabase Vault. pg_cron calls the app's
--   /api/public/hooks/publish-scheduled endpoint every 5 minutes with that
--   secret; the endpoint checks it via verify_publish_cron_secret().
-- * The site URL the cron calls is also in Vault (publish_site_url). Change it
--   with:  select vault.update_secret(id, 'https://your-domain') from vault.secrets where name = 'publish_site_url';

CREATE EXTENSION IF NOT EXISTS pg_net;

ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS provider_state jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_scheduled_publishing
  ON public.scheduled_posts (status, updated_at) WHERE status = 'publishing';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'publish_cron_secret') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'publish_cron_secret', 'Shared secret for the publish-scheduled hook');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'publish_site_url') THEN
    PERFORM vault.create_secret('https://creatorflowai.prodxstore.com', 'publish_site_url', 'Base URL pg_cron calls for publishing');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.verify_publish_cron_secret(_secret text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(_secret, '') <> ''
     AND EXISTS (SELECT 1 FROM vault.decrypted_secrets
                 WHERE name = 'publish_cron_secret' AND decrypted_secret = _secret);
$$;
REVOKE ALL ON FUNCTION public.verify_publish_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_publish_cron_secret(text) TO service_role;

CREATE OR REPLACE FUNCTION public.trigger_publish_worker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _url text;
  _secret text;
BEGIN
  -- Skip the HTTP call when nothing is due.
  IF NOT EXISTS (
    SELECT 1 FROM public.scheduled_posts
    WHERE (status IN ('scheduled', 'ready') AND (scheduled_at IS NULL OR scheduled_at <= now()))
       OR (status = 'publishing' AND updated_at < now() - interval '2 minutes')
  ) THEN
    RETURN NULL;
  END IF;
  SELECT decrypted_secret INTO _url FROM vault.decrypted_secrets WHERE name = 'publish_site_url';
  SELECT decrypted_secret INTO _secret FROM vault.decrypted_secrets WHERE name = 'publish_cron_secret';
  RETURN net.http_post(
    url := rtrim(_url, '/') || '/api/public/hooks/publish-scheduled',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', _secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
END;
$$;
REVOKE ALL ON FUNCTION public.trigger_publish_worker() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('publish-scheduled-posts')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'publish-scheduled-posts');
SELECT cron.schedule('publish-scheduled-posts', '*/5 * * * *', $cron$SELECT public.trigger_publish_worker()$cron$);
