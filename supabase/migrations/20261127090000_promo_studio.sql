-- Promo Studio v1: admin-only marketing creatives. Company spend, never user credits.
-- All writes go through server functions (service role) after has_role(). Clients: admin SELECT only.
-- Design: .claude/team/designs/promo-studio.md §3. No existing table is altered.

-- ---------- settings (singleton) ----------
CREATE TABLE IF NOT EXISTS public.promo_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT true,                 -- kill switch (§9)
  logo_path text,
  colors jsonb NOT NULL DEFAULT '{"primary":"#7C3AED","secondary":"#0EA5E9","accent":"#F59E0B","text":"#FFFFFF"}',
  app_url text NOT NULL DEFAULT 'https://creatorflowai.prodxstore.com',
  default_cta text NOT NULL DEFAULT 'Start free',
  offer_id uuid REFERENCES public.offers(id) ON DELETE SET NULL,
  -- money (SPK-approved defaults, admin-editable)
  monthly_cap_usd numeric(10,2) NOT NULL DEFAULT 10.00 CHECK (monthly_cap_usd >= 0 AND monthly_cap_usd <= 500),
  per_request_cap_usd numeric(10,2) NOT NULL DEFAULT 1.00 CHECK (per_request_cap_usd > 0 AND per_request_cap_usd <= 25),
  rate_10m integer NOT NULL DEFAULT 40 CHECK (rate_10m BETWEEN 1 AND 500),
  rate_24h integer NOT NULL DEFAULT 300 CHECK (rate_24h BETWEEN 1 AND 5000),
  bg_models text[] NOT NULL DEFAULT ARRAY['fal-ai/flux/schnell'],  -- server ALSO intersects with a code allowlist
  bg_max_megapixels numeric(4,2) NOT NULL DEFAULT 1.00 CHECK (bg_max_megapixels > 0 AND bg_max_megapixels <= 1.00),
  cap_alerted_month date,                                 -- first day of month an 80% alert was sent
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.promo_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ---------- screenshot library ----------
CREATE TABLE IF NOT EXISTS public.promo_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'screenshot' CHECK (kind IN ('screenshot')),   -- phase 2 adds 'recording'
  path text NOT NULL CHECK (path ~ '^[0-9a-f-]{36}/promo-studio/assets/[0-9a-f-]{36}\.(png|jpg|webp)$'),
  label text NOT NULL DEFAULT '' CHECK (char_length(label) <= 80),
  feature_tag text NOT NULL DEFAULT 'other' CHECK (feature_tag IN
    ('images','carousels','thumbnails','video','voice','captions','research','planner','pricing','other')),
  width integer, height integer,
  archived_at timestamptz,                                -- "delete from library" = soft delete (no data deletion)
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS promo_assets_tag_idx ON public.promo_assets (feature_tag, created_at DESC) WHERE archived_at IS NULL;

-- ---------- creatives ----------
CREATE TABLE IF NOT EXISTS public.promo_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  template text NOT NULL CHECK (template IN ('feature_spotlight','offer_festival','before_after')),
  format text NOT NULL CHECK (format IN ('image','carousel','story')),
  size text NOT NULL CHECK (size IN ('4:5','1:1','9:16')),
  language text NOT NULL CHECK (language IN ('en','te','hi')),
  variant_index smallint NOT NULL CHECK (variant_index BETWEEN 0 AND 3),
  hook text NOT NULL, headline text NOT NULL,
  slides jsonb NOT NULL DEFAULT '[]',                     -- [{title, body}] for carousel
  cta text NOT NULL, caption text NOT NULL, hashtags text[] NOT NULL DEFAULT '{}',
  copy_warnings jsonb NOT NULL DEFAULT '[]',              -- soft lint (§6.1), shown in drawer
  offer_id uuid REFERENCES public.offers(id) ON DELETE SET NULL,
  offer_code text, offer_label text, offer_ends_at timestamptz,   -- frozen snapshot
  asset_ids uuid[] NOT NULL DEFAULT '{}',
  before_path text,                                       -- before→after "before" upload (if not a library asset)
  background_path text,
  output_paths text[] NOT NULL DEFAULT '{}',              -- PNG per slide (download)
  publish_paths text[] NOT NULL DEFAULT '{}',             -- JPEG per slide (Instagram needs JPEG)
  render_version integer NOT NULL DEFAULT 0,
  text_version integer NOT NULL DEFAULT 1,                -- bumped on every text edit
  rendered_text_version integer,                          -- text_version the current output was rendered from
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','scheduled','posted','archived')),
  approved_by uuid REFERENCES auth.users(id), approved_at timestamptz,
  scheduled_post_ids uuid[] NOT NULL DEFAULT '{}',
  schedule_note text,                                     -- "Post failed: …" (G6)
  plan_item_id uuid REFERENCES public.content_plan_items(id) ON DELETE SET NULL,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (format <> 'story' OR size = '9:16'),
  CHECK (format <> 'carousel' OR jsonb_array_length(slides) BETWEEN 3 AND 7)
);
CREATE INDEX IF NOT EXISTS promo_creatives_list_idx ON public.promo_creatives (status, created_at DESC);
CREATE INDEX IF NOT EXISTS promo_creatives_batch_idx ON public.promo_creatives (batch_id);
CREATE INDEX IF NOT EXISTS promo_creatives_plan_idx ON public.promo_creatives (plan_item_id) WHERE plan_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS promo_creatives_sched_idx ON public.promo_creatives USING gin (scheduled_post_ids) WHERE status = 'scheduled';

-- ---------- cost log (append-only; single settle of a pending row) ----------
CREATE TABLE IF NOT EXISTS public.promo_cost_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  creative_id uuid REFERENCES public.promo_creatives(id) ON DELETE SET NULL,
  batch_id uuid,
  step text NOT NULL CHECK (step IN ('copy','background','video','voice','transcode')),
  provider text NOT NULL CHECK (provider IN ('openrouter','fal')),
  model text NOT NULL,
  units numeric, unit_type text CHECK (unit_type IN ('input_tokens+output_tokens','megapixels','images','characters','seconds')),
  est_usd numeric(12,6) NOT NULL CHECK (est_usd >= 0),
  actual_usd numeric(12,6),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','settled')),
  ok boolean, error text,
  provider_request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
CREATE INDEX IF NOT EXISTS promo_cost_log_admin_time_idx ON public.promo_cost_log (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS promo_cost_log_time_idx ON public.promo_cost_log (created_at DESC);
CREATE INDEX IF NOT EXISTS promo_cost_log_creative_idx ON public.promo_cost_log (creative_id) WHERE creative_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS promo_cost_log_batch_idx ON public.promo_cost_log (batch_id) WHERE batch_id IS NOT NULL;

-- ---------- audit (settings changes, status transitions) ----------
CREATE TABLE IF NOT EXISTS public.promo_audit (
  id bigserial PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,                                   -- 'settings.update','creative.transition','creative.edit',…
  target_id uuid,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS promo_audit_time_idx ON public.promo_audit (created_at DESC);

-- ---------- RLS and grants (all five tables) ----------
-- Admins may SELECT. There are no INSERT/UPDATE/DELETE policies and no write grants to
-- anon/authenticated, so every client write fails with 42501, admins included (A5).
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['promo_settings','promo_assets','promo_creatives','promo_cost_log','promo_audit'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins read %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Admins read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''admin''))', t);
  END LOOP;
END $$;
REVOKE USAGE, SELECT ON SEQUENCE public.promo_audit_id_seq FROM anon, authenticated;

-- ---------- guards (defence in depth: they hold even for the service role) ----------

-- promo_cost_log: no DELETE ever; UPDATE only to settle a pending row once, only settle columns.
-- No creative_id backfill branch: a batch's copy cost is split across its variants by batch_id
-- (see promo_refresh_creative_cost), so settled rows are never re-pointed.
CREATE OR REPLACE FUNCTION public.tg_promo_cost_log_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'promo_cost_log is append-only' USING ERRCODE = '42501'; END IF;
  IF OLD.state <> 'pending' OR NEW.state <> 'settled'
     OR (NEW.id, NEW.admin_id, NEW.batch_id, NEW.step, NEW.provider, NEW.model, NEW.est_usd, NEW.created_at)
        IS DISTINCT FROM (OLD.id, OLD.admin_id, OLD.batch_id, OLD.step, OLD.provider, OLD.model, OLD.est_usd, OLD.created_at)
     OR (OLD.creative_id IS NOT NULL AND NEW.creative_id IS DISTINCT FROM OLD.creative_id) THEN
    RAISE EXCEPTION 'promo_cost_log rows can only be settled once' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS promo_cost_log_guard ON public.promo_cost_log;
CREATE TRIGGER promo_cost_log_guard BEFORE UPDATE OR DELETE ON public.promo_cost_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_promo_cost_log_guard();

-- promo_creatives: status state machine (server fn gives friendly errors first; this is the backstop).
-- Posted rows are final, except for the FK actions ON DELETE SET NULL (offer_id, plan_item_id), so
-- deleting an offer or a plan item never fails because a posted creative points at it.
CREATE OR REPLACE FUNCTION public.tg_promo_creatives_transition() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'promo creatives are never deleted in v1' USING ERRCODE = '42501'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN RAISE EXCEPTION 'creatives are created as draft' USING ERRCODE = '42501'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'posted' THEN
    IF (to_jsonb(NEW) - 'offer_id' - 'plan_item_id' - 'updated_at')
       IS DISTINCT FROM (to_jsonb(OLD) - 'offer_id' - 'plan_item_id' - 'updated_at')
       OR (NEW.offer_id IS DISTINCT FROM OLD.offer_id AND NEW.offer_id IS NOT NULL)
       OR (NEW.plan_item_id IS DISTINCT FROM OLD.plan_item_id AND NEW.plan_item_id IS NOT NULL) THEN
      RAISE EXCEPTION 'posted creatives are final' USING ERRCODE = '42501';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT ((OLD.status, NEW.status) IN (
      ('draft','approved'), ('approved','draft'), ('approved','scheduled'), ('scheduled','approved'),
      ('scheduled','posted'), ('approved','posted'), ('draft','archived'), ('approved','archived'),
      ('archived','draft'))) THEN
    RAISE EXCEPTION 'Can''t move a % creative to %.', OLD.status, NEW.status USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'approved' AND OLD.status = 'draft'
     AND (cardinality(NEW.output_paths) = 0 OR NEW.rendered_text_version IS DISTINCT FROM NEW.text_version) THEN
    RAISE EXCEPTION 'Render the creative before approving it' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS promo_creatives_transition ON public.promo_creatives;
CREATE TRIGGER promo_creatives_transition BEFORE INSERT OR UPDATE OR DELETE ON public.promo_creatives
  FOR EACH ROW EXECUTE FUNCTION public.tg_promo_creatives_transition();

REVOKE ALL ON FUNCTION public.tg_promo_cost_log_guard(), public.tg_promo_creatives_transition()
  FROM PUBLIC, anon, authenticated;

-- ---------- budget + rate-limit RPCs (atomic) ----------
-- One global advisory lock serialises every Promo reservation, and the reservation inserts a
-- 'pending' row at its estimate, so a concurrent caller always sees it: the month total stays
-- <= cap at reservation time.
CREATE OR REPLACE FUNCTION public.promo_reserve_spend(
  _admin uuid, _step text, _provider text, _model text, _est numeric,
  _batch uuid, _creative uuid, _units numeric, _unit_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.promo_settings%ROWTYPE; _spent numeric; _n10 int; _n24 int; _oldest timestamptz; _id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('promo_studio_budget'));
  SELECT * INTO s FROM public.promo_settings WHERE id = 1;
  IF NOT FOUND OR NOT s.enabled THEN RETURN jsonb_build_object('ok', false, 'code', 'disabled'); END IF;
  IF _admin IS NULL OR NOT coalesce(public.has_role(_admin, 'admin'), false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF _est IS NULL OR _est < 0 THEN RETURN jsonb_build_object('ok', false, 'code', 'invalid'); END IF;
  -- One provider call can never cost more than a whole request is allowed to.
  IF _est > s.per_request_cap_usd THEN
    RETURN jsonb_build_object('ok', false, 'code', 'per_request', 'cap', s.per_request_cap_usd, 'est', _est);
  END IF;

  SELECT count(*) FILTER (WHERE created_at > now() - interval '10 minutes'),
         count(*),
         min(created_at) FILTER (WHERE created_at > now() - interval '10 minutes')
    INTO _n10, _n24, _oldest
    FROM public.promo_cost_log WHERE admin_id = _admin AND created_at > now() - interval '24 hours';
  IF _n10 >= s.rate_10m THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rate', 'retry_after_s',
      GREATEST(60, extract(epoch FROM (_oldest + interval '10 minutes' - now()))::int));
  END IF;
  IF _n24 >= s.rate_24h THEN RETURN jsonb_build_object('ok', false, 'code', 'rate', 'retry_after_s', 3600); END IF;

  -- Pending rows count at their estimate; settled rows at actual (fallback estimate).
  SELECT coalesce(sum(coalesce(actual_usd, est_usd)), 0) INTO _spent
    FROM public.promo_cost_log WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  IF _spent + _est > s.monthly_cap_usd THEN
    RETURN jsonb_build_object('ok', false, 'code', 'budget', 'cap', s.monthly_cap_usd, 'spent', _spent);
  END IF;

  INSERT INTO public.promo_cost_log (admin_id, creative_id, batch_id, step, provider, model, units, unit_type, est_usd)
  VALUES (_admin, _creative, _batch, _step, _provider, _model, _units, _unit_type, _est) RETURNING id INTO _id;
  RETURN jsonb_build_object('ok', true, 'id', _id, 'spent_after', _spent + _est, 'cap', s.monthly_cap_usd,
    'alert', (_spent + _est) >= 0.8 * s.monthly_cap_usd
             AND (s.cap_alerted_month IS NULL OR s.cap_alerted_month < date_trunc('month', now() AT TIME ZONE 'UTC')::date));
END $$;

CREATE OR REPLACE FUNCTION public.promo_settle_spend(
  _id uuid, _ok boolean, _actual numeric, _units numeric, _error text, _request_id text, _creative uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.promo_cost_log
     SET state = 'settled', ok = _ok, actual_usd = _actual, units = coalesce(_units, units),
         error = left(_error, 500), provider_request_id = _request_id,
         creative_id = coalesce(creative_id, _creative), settled_at = now()
   WHERE id = _id AND state = 'pending';
$$;

-- Claim the once-a-month 80% alert (returns true for exactly one caller, NULL otherwise).
CREATE OR REPLACE FUNCTION public.promo_claim_cap_alert() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.promo_settings SET cap_alerted_month = date_trunc('month', now() AT TIME ZONE 'UTC')::date
   WHERE id = 1 AND (cap_alerted_month IS NULL OR cap_alerted_month < date_trunc('month', now() AT TIME ZONE 'UTC')::date)
  RETURNING true;
$$;

-- Recompute a creative's cost (I2): its own log rows, plus an even share of its batch's copy
-- rows (the copy call runs before creatives exist, so those rows have creative_id NULL).
CREATE OR REPLACE FUNCTION public.promo_refresh_creative_cost(_creative uuid) RETURNS numeric LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.promo_creatives c SET cost_usd = round(
      coalesce((SELECT sum(coalesce(l.actual_usd, l.est_usd)) FROM public.promo_cost_log l
                 WHERE l.creative_id = c.id), 0)
    + coalesce((SELECT sum(coalesce(l.actual_usd, l.est_usd)) FROM public.promo_cost_log l
                 WHERE l.step = 'copy' AND l.creative_id IS NULL AND l.batch_id = c.batch_id), 0)
      / GREATEST(1, (SELECT count(*) FROM public.promo_creatives b WHERE b.batch_id = c.batch_id)),
    6)
  WHERE c.id = _creative RETURNING c.cost_usd;
$$;

REVOKE ALL ON FUNCTION public.promo_reserve_spend(uuid,text,text,text,numeric,uuid,uuid,numeric,text),
                       public.promo_settle_spend(uuid,boolean,numeric,numeric,text,text,uuid),
                       public.promo_claim_cap_alert(), public.promo_refresh_creative_cost(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promo_reserve_spend(uuid,text,text,text,numeric,uuid,uuid,numeric,text),
                          public.promo_settle_spend(uuid,boolean,numeric,numeric,text,text,uuid),
                          public.promo_claim_cap_alert(), public.promo_refresh_creative_cost(uuid)
  TO service_role;

-- Rollback (kept for the PR description, not run):
--   DROP FUNCTION public.promo_refresh_creative_cost(uuid), public.promo_claim_cap_alert(),
--     public.promo_settle_spend(uuid,boolean,numeric,numeric,text,text,uuid),
--     public.promo_reserve_spend(uuid,text,text,text,numeric,uuid,uuid,numeric,text);
--   DROP TABLE public.promo_audit, public.promo_cost_log, public.promo_creatives, public.promo_assets, public.promo_settings;
--   DROP FUNCTION public.tg_promo_creatives_transition(), public.tg_promo_cost_log_guard();
