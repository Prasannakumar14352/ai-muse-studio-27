-- Agent HQ: settings, tasks/approvals, run log, Telegram support agent.
-- Everything here is admin-only: the server reads/writes with the service
-- role; admins read through server functions that check has_role(admin).

-- Singleton settings row (id = 1).
CREATE TABLE IF NOT EXISTS public.agent_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  telegram_enabled boolean NOT NULL DEFAULT false,
  telegram_bot_token_cipher text,
  telegram_bot_token_iv text,
  telegram_bot_username text,
  telegram_webhook_secret text,
  telegram_group_ids bigint[] NOT NULL DEFAULT '{}',
  auto_reply boolean NOT NULL DEFAULT true,
  reply_in_group boolean NOT NULL DEFAULT true,
  monthly_budget_usd numeric(10,2) NOT NULL DEFAULT 10,
  scheduled_agents_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.agent_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE public.agent_settings ENABLE ROW LEVEL SECURITY;

-- Work items for every agent: tickets, approvals, reports.
CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent text NOT NULL,                 -- support | product_manager | qa | ops
  kind text NOT NULL,                  -- question | bug | billing | feature | report | alert
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo','in_progress','waiting_approval','done','rejected')),
  priority smallint NOT NULL DEFAULT 2, -- 1 high, 2 normal, 3 low
  draft_reply text,
  source text,                          -- telegram | schedule
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS agent_tasks_status_idx ON public.agent_tasks (status, created_at DESC);
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;

-- Every agent run: what it saw, what it did, what it cost.
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent text NOT NULL,
  trigger text NOT NULL,               -- telegram | schedule | manual
  summary text NOT NULL DEFAULT '',
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  ok boolean NOT NULL DEFAULT true,
  error text,
  cost_usd numeric(10,5) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_runs_created_idx ON public.agent_runs (created_at DESC);
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

-- Messages seen in the buyers' Telegram group(s).
CREATE TABLE IF NOT EXISTS public.telegram_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id bigint NOT NULL,
  message_id bigint NOT NULL,
  from_id bigint,
  from_name text,
  text text NOT NULL DEFAULT '',
  category text,                       -- question | bug | billing | feature | chat
  reply_text text,
  reply_message_id bigint,
  handled_by text,                     -- agent | admin | ignored | pending
  task_id uuid REFERENCES public.agent_tasks(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chat_id, message_id)
);
CREATE INDEX IF NOT EXISTS telegram_messages_created_idx ON public.telegram_messages (created_at DESC);
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;

-- Telegram account ↔ CreatorFlow account, made with /link <code>.
CREATE TABLE IF NOT EXISTS public.telegram_links (
  telegram_user_id bigint PRIMARY KEY,
  user_id uuid NOT NULL,
  telegram_username text,
  linked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telegram_links_user_idx ON public.telegram_links (user_id);
ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.telegram_link_codes (
  code text PRIMARY KEY,
  user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes'
);
ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;

-- A user can see whether their own Telegram is linked.
DROP POLICY IF EXISTS "own telegram link" ON public.telegram_links;
CREATE POLICY "own telegram link" ON public.telegram_links FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Daily scheduled agents (PM weekly / QA daily / ops daily) share one cron
-- hook, guarded by the same secret as the publishing worker.
CREATE OR REPLACE FUNCTION public.trigger_agent_scheduler()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  _secret text;
  _site text;
BEGIN
  SELECT decrypted_secret INTO _secret FROM vault.decrypted_secrets WHERE name = 'publish_cron_secret' LIMIT 1;
  SELECT decrypted_secret INTO _site FROM vault.decrypted_secrets WHERE name = 'publish_site_url' LIMIT 1;
  IF _secret IS NULL OR _site IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := rtrim(_site, '/') || '/api/public/hooks/agents-scheduler',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', _secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;
REVOKE ALL ON FUNCTION public.trigger_agent_scheduler() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('agents-scheduler');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
-- 02:40 UTC = 08:10 IST, every day.
SELECT cron.schedule('agents-scheduler', '40 2 * * *', 'SELECT public.trigger_agent_scheduler()');
