-- Auto DM (Instagram + Facebook Page) — comment-to-DM and DM keyword replies.
--
-- Flow: Meta webhook → /api/public/webhooks/meta (signature-checked) →
-- dm_events (deduped) → matching dm_rules → dm_sends (queue) → sent by the
-- webhook immediately when possible, otherwise by the auto-dm worker that
-- pg_cron calls every minute (only when something is queued).
--
-- Platform rules enforced in code: one private reply per comment, within
-- 7 days of the comment; free-form DMs only inside 24 h of the person's last
-- message; per-account hourly caps under Meta's rate limits.

-- OAuth: remember why a login was started (publishing vs auto DM scopes).
ALTER TABLE public.oauth_states
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'publish';

-- Per connected account: is Auto DM switched on / subscribed to webhooks.
ALTER TABLE public.platform_connections
  ADD COLUMN IF NOT EXISTS dm_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dm_subscribed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_platform_connections_account
  ON public.platform_connections (platform, account_id) WHERE dm_enabled;

-- Webhook events are routed by (platform, account_id, dm_enabled). Those
-- columns must only be set by the server (OAuth callback / setDmEnabled run as
-- service_role); otherwise a user could point their own row at someone else's
-- account and receive that account's commenters. Browser (authenticated)
-- writes can never change them.
CREATE OR REPLACE FUNCTION public.tg_platform_connections_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.dm_enabled := false;
      NEW.dm_subscribed_at := NULL;
    ELSE
      IF NEW.platform IS DISTINCT FROM OLD.platform
         OR NEW.account_id IS DISTINCT FROM OLD.account_id
         OR NEW.dm_enabled IS DISTINCT FROM OLD.dm_enabled
         OR NEW.dm_subscribed_at IS DISTINCT FROM OLD.dm_subscribed_at THEN
        RAISE EXCEPTION 'platform, account_id and Auto DM fields can only be changed by the server'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS platform_connections_guard ON public.platform_connections;
CREATE TRIGGER platform_connections_guard
  BEFORE INSERT OR UPDATE ON public.platform_connections
  FOR EACH ROW EXECUTE FUNCTION public.tg_platform_connections_guard();

-- Rules ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dm_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.platform_connections(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled rule',
  trigger text NOT NULL CHECK (trigger IN ('comment_keyword', 'any_comment', 'dm_keyword')),
  media_id text,                       -- null = every post / reel
  keywords text[] NOT NULL DEFAULT '{}',
  match_mode text NOT NULL DEFAULT 'contains' CHECK (match_mode IN ('contains', 'exact')),
  dm_text text NOT NULL CHECK (char_length(dm_text) BETWEEN 1 AND 1000),
  link_url text CHECK (link_url IS NULL OR link_url ~* '^https://'),
  public_replies text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dm_rules_connection ON public.dm_rules (connection_id) WHERE active;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dm_rules TO authenticated;
GRANT ALL ON public.dm_rules TO service_role;
ALTER TABLE public.dm_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own dm_rules" ON public.dm_rules;
CREATE POLICY "own dm_rules" ON public.dm_rules
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.platform_connections c
                WHERE c.id = connection_id AND c.user_id = auth.uid())
  );
DROP TRIGGER IF EXISTS set_dm_rules_updated_at ON public.dm_rules;
CREATE TRIGGER set_dm_rules_updated_at BEFORE UPDATE ON public.dm_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- People who messaged / commented (for the 24 h window) ------------------
CREATE TABLE IF NOT EXISTS public.dm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.platform_connections(id) ON DELETE CASCADE,
  platform_user_id text NOT NULL,      -- IGSID / PSID
  username text,
  last_inbound_at timestamptz,
  opted_out boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, platform_user_id)
);
GRANT SELECT ON public.dm_contacts TO authenticated;
GRANT ALL ON public.dm_contacts TO service_role;
ALTER TABLE public.dm_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own dm_contacts read" ON public.dm_contacts;
CREATE POLICY "own dm_contacts read" ON public.dm_contacts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Raw webhook events (dedupe + audit) -------------------------------------
CREATE TABLE IF NOT EXISTS public.dm_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,      -- comment id / message mid
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.platform_connections(id) ON DELETE CASCADE,
  kind text NOT NULL,                  -- comment | message
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dm_events_user ON public.dm_events (user_id, received_at DESC);
GRANT SELECT ON public.dm_events TO authenticated;
GRANT ALL ON public.dm_events TO service_role;
ALTER TABLE public.dm_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own dm_events read" ON public.dm_events;
CREATE POLICY "own dm_events read" ON public.dm_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Outgoing messages (queue + log) -----------------------------------------
CREATE TABLE IF NOT EXISTS public.dm_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.platform_connections(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.dm_rules(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('private_reply', 'dm', 'public_reply')),
  comment_id text,
  recipient_id text,
  recipient_name text,
  text text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped')),
  error text,
  attempts int NOT NULL DEFAULT 0,
  source_at timestamptz NOT NULL DEFAULT now(),   -- when the comment / message happened
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Meta allows ONE private reply per comment; one public reply per comment from us.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dm_sends_comment_kind
  ON public.dm_sends (connection_id, comment_id, kind) WHERE comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dm_sends_due ON public.dm_sends (next_attempt_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_dm_sends_rate ON public.dm_sends (connection_id, kind, sent_at) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS idx_dm_sends_user ON public.dm_sends (user_id, created_at DESC);
GRANT SELECT ON public.dm_sends TO authenticated;
GRANT ALL ON public.dm_sends TO service_role;
ALTER TABLE public.dm_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own dm_sends read" ON public.dm_sends;
CREATE POLICY "own dm_sends read" ON public.dm_sends
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP TRIGGER IF EXISTS set_dm_sends_updated_at ON public.dm_sends;
CREATE TRIGGER set_dm_sends_updated_at BEFORE UPDATE ON public.dm_sends
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Worker: pg_cron → /api/public/hooks/auto-dm every minute, only when queued.
-- Reuses the publish worker's Vault secret + site URL.
CREATE OR REPLACE FUNCTION public.trigger_auto_dm_worker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _url text;
  _secret text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.dm_sends
    WHERE (status = 'queued' AND next_attempt_at <= now())
  ) THEN
    RETURN NULL;
  END IF;
  SELECT decrypted_secret INTO _url FROM vault.decrypted_secrets WHERE name = 'publish_site_url';
  SELECT decrypted_secret INTO _secret FROM vault.decrypted_secrets WHERE name = 'publish_cron_secret';
  RETURN net.http_post(
    url := rtrim(_url, '/') || '/api/public/hooks/auto-dm',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', _secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;
REVOKE ALL ON FUNCTION public.trigger_auto_dm_worker() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('auto-dm-worker')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-dm-worker');
SELECT cron.schedule('auto-dm-worker', '* * * * *', $cron$SELECT public.trigger_auto_dm_worker()$cron$);
