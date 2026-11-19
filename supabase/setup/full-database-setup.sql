-- =====================================================================
-- CreatorFlow AI / CreatorVault — full database setup for a NEW Supabase project
-- Generated from all 47 migrations in supabase/migrations (in order).
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
--   Run it ONCE on an empty project. It creates:
--     * all tables, indexes, the app_role enum
--     * Row Level Security policies
--     * credit functions (reserve_credits, finalize_credits, refund_credits_by_ledger,
--       deduct_credits, get_credit_summary, reset_monthly_subscription_credits, ...)
--     * the signup trigger that creates a profile + free credits for each new user
--     * seed data: pricing plans and credit packs
--     * storage buckets: renders (private), library (private), landing (public)
--
-- ADMIN: handle_new_user() makes prasannaskvd@gmail.com an admin automatically
-- when that email signs up. Change the email in that function if needed.
-- =====================================================================

-- Storage buckets (the original project created these in the dashboard)
INSERT INTO storage.buckets (id, name, public) VALUES
  ('renders', 'renders', false),
  ('library', 'library', false),
  ('landing', 'landing', true)
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------
-- 20260705014138_ace4ed4f-d601-4648-9415-c3f722a346e5.sql
-- ---------------------------------------------------------------------

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  brand_name TEXT,
  default_platform TEXT,
  default_tone TEXT,
  default_style TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content_type TEXT,
  topic TEXT,
  audience TEXT,
  platform TEXT,
  tone TEXT,
  style TEXT,
  voice TEXT,
  music TEXT,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own projects" ON public.projects FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Generated outputs
CREATE TABLE public.generated_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  hook TEXT,
  script TEXT,
  captions TEXT,
  hashtags TEXT[],
  scenes JSONB,
  image_prompts JSONB,
  thumbnail_ideas JSONB,
  video_url TEXT,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_outputs TO authenticated;
GRANT ALL ON public.generated_outputs TO service_role;
ALTER TABLE public.generated_outputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own outputs" ON public.generated_outputs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Assets
CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_type TEXT,
  file_url TEXT,
  prompt TEXT,
  style TEXT,
  aspect_ratio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT ALL ON public.assets TO service_role;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own assets" ON public.assets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Subscriptions
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);

-- Auto profile trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''), NEW.email);
  INSERT INTO public.subscriptions (user_id, plan_name, status) VALUES (NEW.id, 'free', 'active');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER set_projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- 20260705014206_8e3bc4da-f4d2-4957-9489-a7a263f2e476.sql
-- ---------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 20260705192402_10c1b0b1-dc7b-47b8-b5df-dee50a42f9b4.sql
-- ---------------------------------------------------------------------

-- 1. Profiles: add role + credits
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_credits integer NOT NULL DEFAULT 50;

-- 2. Subscriptions: add monthly credit tracking + unlimited flag
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS monthly_credit_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_credits_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unlimited_usage boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS renews_at timestamptz;

-- 3. Roles enum + user_roles table (source of truth for admin checks)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Security definer: safe to call in RLS
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(_user_id, 'admin'::public.app_role); $$;

DROP POLICY IF EXISTS "Admins view all roles" ON public.user_roles;
CREATE POLICY "Admins view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 4. Usage history
CREATE TABLE IF NOT EXISTS public.usage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid,
  credits_used integer NOT NULL DEFAULT 0,
  description text,
  source text NOT NULL DEFAULT 'balance', -- 'balance' | 'subscription' | 'admin'
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.usage_history TO authenticated;
GRANT ALL ON public.usage_history TO service_role;
ALTER TABLE public.usage_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own usage" ON public.usage_history;
CREATE POLICY "Users view own usage" ON public.usage_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own usage" ON public.usage_history;
CREATE POLICY "Users insert own usage" ON public.usage_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins view all usage" ON public.usage_history;
CREATE POLICY "Admins view all usage" ON public.usage_history
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- 5. Admin RLS across existing user-owned tables
DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
CREATE POLICY "Admins view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Admins update all profiles" ON public.profiles;
CREATE POLICY "Admins update all profiles" ON public.profiles
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins view all projects" ON public.projects;
CREATE POLICY "Admins view all projects" ON public.projects
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins view all assets" ON public.assets;
CREATE POLICY "Admins view all assets" ON public.assets
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins view all outputs" ON public.generated_outputs;
CREATE POLICY "Admins view all outputs" ON public.generated_outputs
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins view all subscriptions" ON public.subscriptions;
CREATE POLICY "Admins view all subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Admins manage subscriptions" ON public.subscriptions;
CREATE POLICY "Admins manage subscriptions" ON public.subscriptions
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Users need to insert/update their own subscription rows (self-serve upgrades)
DROP POLICY IF EXISTS "Users insert own subscription" ON public.subscriptions;
CREATE POLICY "Users insert own subscription" ON public.subscriptions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own subscription" ON public.subscriptions;
CREATE POLICY "Users update own subscription" ON public.subscriptions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6. Updated signup trigger: seed profile, 50 credits, admin role for target email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _is_admin boolean := (NEW.email = 'prasannaskvd@gmail.com');
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, is_admin, user_credits)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    CASE WHEN _is_admin THEN 'admin' ELSE 'user' END,
    _is_admin,
    50
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        is_admin = EXCLUDED.is_admin,
        role = EXCLUDED.role;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN _is_admin THEN 'admin'::public.app_role ELSE 'user'::public.app_role END)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.subscriptions (user_id, plan_name, status, monthly_credit_limit, unlimited_usage)
  VALUES (
    NEW.id,
    CASE WHEN _is_admin THEN 'admin' ELSE 'free' END,
    'active',
    CASE WHEN _is_admin THEN 0 ELSE 0 END,
    _is_admin
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Attach trigger if missing
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Backfill existing rows
UPDATE public.profiles SET user_credits = 50 WHERE user_credits IS NULL OR user_credits = 0;

-- Promote target admin if account already exists
DO $$
DECLARE _uid uuid;
BEGIN
  SELECT id INTO _uid FROM auth.users WHERE email = 'prasannaskvd@gmail.com' LIMIT 1;
  IF _uid IS NOT NULL THEN
    UPDATE public.profiles SET is_admin = true, role = 'admin' WHERE id = _uid;
    INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.subscriptions (user_id, plan_name, status, unlimited_usage)
      VALUES (_uid, 'admin', 'active', true)
      ON CONFLICT DO NOTHING;
    UPDATE public.subscriptions SET unlimited_usage = true, plan_name = 'admin' WHERE user_id = _uid;
  END IF;
END $$;

-- 8. Backfill user roles for existing users
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'user'::public.app_role FROM auth.users
ON CONFLICT (user_id, role) DO NOTHING;

-- 9. Credit deduction helper (server-side, atomic)
CREATE OR REPLACE FUNCTION public.deduct_credits(
  _user_id uuid,
  _amount integer,
  _project_id uuid,
  _description text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _sub public.subscriptions%ROWTYPE;
  _profile public.profiles%ROWTYPE;
  _source text;
BEGIN
  -- Admin bypass
  IF public.is_admin(_user_id) THEN
    INSERT INTO public.usage_history (user_id, project_id, credits_used, description, source)
    VALUES (_user_id, _project_id, 0, _description, 'admin');
    RETURN jsonb_build_object('ok', true, 'source', 'admin', 'remaining', -1);
  END IF;

  SELECT * INTO _sub FROM public.subscriptions
    WHERE user_id = _user_id AND status = 'active'
    ORDER BY started_at DESC LIMIT 1
    FOR UPDATE;

  -- Try subscription bucket first
  IF _sub.id IS NOT NULL AND _sub.unlimited_usage THEN
    INSERT INTO public.usage_history (user_id, project_id, credits_used, description, source)
    VALUES (_user_id, _project_id, 0, _description, 'subscription');
    RETURN jsonb_build_object('ok', true, 'source', 'subscription', 'remaining', -1);
  END IF;

  IF _sub.id IS NOT NULL AND (_sub.monthly_credit_limit - _sub.monthly_credits_used) >= _amount THEN
    UPDATE public.subscriptions SET monthly_credits_used = monthly_credits_used + _amount
      WHERE id = _sub.id;
    INSERT INTO public.usage_history (user_id, project_id, credits_used, description, source)
    VALUES (_user_id, _project_id, _amount, _description, 'subscription');
    RETURN jsonb_build_object('ok', true, 'source', 'subscription',
      'remaining', _sub.monthly_credit_limit - _sub.monthly_credits_used - _amount);
  END IF;

  -- Fall back to profile balance
  SELECT * INTO _profile FROM public.profiles WHERE id = _user_id FOR UPDATE;
  IF _profile.user_credits >= _amount THEN
    UPDATE public.profiles SET user_credits = user_credits - _amount WHERE id = _user_id;
    INSERT INTO public.usage_history (user_id, project_id, credits_used, description, source)
    VALUES (_user_id, _project_id, _amount, _description, 'balance');
    RETURN jsonb_build_object('ok', true, 'source', 'balance', 'remaining', _profile.user_credits - _amount);
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'insufficient_credits',
    'balance', _profile.user_credits,
    'subscription_remaining', COALESCE(_sub.monthly_credit_limit - _sub.monthly_credits_used, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

-- 10. Monthly reset helper (called manually or via cron later)
CREATE OR REPLACE FUNCTION public.reset_monthly_subscription_credits()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.subscriptions SET monthly_credits_used = 0 WHERE status = 'active';
$$;
GRANT EXECUTE ON FUNCTION public.reset_monthly_subscription_credits() TO service_role;

-- ---------------------------------------------------------------------
-- 20260706072636_3268978b-3d1e-4aa9-829f-96006885a83e.sql
-- ---------------------------------------------------------------------

-- RLS policies for the "renders" private bucket. Files are stored under `<user_id>/<filename>`.
CREATE POLICY "Users can read own renders"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'renders' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own renders"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'renders' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own renders"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'renders' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own renders"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'renders' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ---------------------------------------------------------------------
-- 20260706075434_18ebf66f-2b6b-48e5-8420-61ebae779f94.sql
-- ---------------------------------------------------------------------
CREATE TABLE public.image_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  prompt text NOT NULL,
  style text,
  ratio text,
  full_prompt text,
  request jsonb NOT NULL DEFAULT '{}'::jsonb,
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  success_count int NOT NULL DEFAULT 0,
  failure_count int NOT NULL DEFAULT 0,
  duration_ms int NOT NULL DEFAULT 0
);

CREATE INDEX image_generations_user_created_idx
  ON public.image_generations (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.image_generations TO authenticated;
GRANT ALL ON public.image_generations TO service_role;

ALTER TABLE public.image_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own image_generations"
  ON public.image_generations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own image_generations"
  ON public.image_generations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own image_generations"
  ON public.image_generations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 20260706081708_9ade47ec-8afb-41d6-8a9c-c10d45c7ea32.sql
-- ---------------------------------------------------------------------
ALTER TABLE public.generated_outputs ADD COLUMN IF NOT EXISTS carousel_images jsonb;

-- ---------------------------------------------------------------------
-- 20260706082620_7fd34983-3ea1-4cc3-a1e4-73700002acc2.sql
-- ---------------------------------------------------------------------
ALTER TABLE public.generated_outputs ADD COLUMN IF NOT EXISTS render_diagnostics jsonb;

-- ---------------------------------------------------------------------
-- 20260706085849_45d42d3c-77e6-4f25-a814-3f73eb34923c.sql
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS public.image_generations CASCADE;
DROP TABLE IF EXISTS public.generated_outputs CASCADE;
DROP TABLE IF EXISTS public.assets CASCADE;

-- ---------------------------------------------------------------------
-- 20260706223309_df357a7d-f93c-437b-bf76-78c6bc185ca1.sql
-- ---------------------------------------------------------------------
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  razorpay_order_id TEXT NOT NULL UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  pack_id TEXT NOT NULL,
  credits INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending',
  receipt_number TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own payments"
  ON public.payments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_payments_updated
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_payments_user_created ON public.payments(user_id, created_at DESC);
CREATE INDEX idx_payments_status ON public.payments(status);

-- ---------------------------------------------------------------------
-- 20260706224808_bf0f2834-28eb-4f03-894c-57470c66b234.sql
-- ---------------------------------------------------------------------

CREATE TABLE public.razorpay_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT,
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  signature_verified BOOLEAN NOT NULL DEFAULT false,
  http_status INTEGER NOT NULL,
  error_message TEXT,
  raw_payload JSONB,
  headers JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.razorpay_webhook_events TO authenticated;
GRANT ALL ON public.razorpay_webhook_events TO service_role;

ALTER TABLE public.razorpay_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view webhook events"
  ON public.razorpay_webhook_events FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX razorpay_webhook_events_created_at_idx ON public.razorpay_webhook_events (created_at DESC);
CREATE INDEX razorpay_webhook_events_order_id_idx ON public.razorpay_webhook_events (razorpay_order_id);

-- Admin audit access to payments
CREATE POLICY "Admins can view all payments"
  ON public.payments FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 20260707152842_8704c7d2-29dc-4385-9e5e-95423e99fb5a.sql
-- ---------------------------------------------------------------------
-- Lock down SECURITY DEFINER helper functions so they are not callable by
-- anonymous visitors, and restrict privileged ones to service_role only.

-- has_role / is_admin: used inside RLS policies. Keep executable by
-- authenticated (RLS evaluates as the caller) and service_role. Revoke public/anon.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

-- deduct_credits: only server code (using service role via server functions) should call this.
REVOKE ALL ON FUNCTION public.deduct_credits(uuid, integer, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, uuid, text) TO service_role;

-- reset_monthly_subscription_credits: admin/cron only.
REVOKE ALL ON FUNCTION public.reset_monthly_subscription_credits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_monthly_subscription_credits() TO service_role;

-- ---------------------------------------------------------------------
-- 20260707233820_7d2ade8e-fca2-48fa-b0cd-42bc606e5ea4.sql
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_admin boolean := (NEW.email = 'prasannaskvd@gmail.com');
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, is_admin, user_credits)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    CASE WHEN _is_admin THEN 'admin' ELSE 'user' END,
    _is_admin,
    50
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        is_admin = EXCLUDED.is_admin,
        role = EXCLUDED.role;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN _is_admin THEN 'admin'::public.app_role ELSE 'user'::public.app_role END)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.subscriptions (user_id, plan_name, status, monthly_credit_limit, unlimited_usage)
  VALUES (
    NEW.id,
    CASE WHEN _is_admin THEN 'admin' ELSE 'free' END,
    'active',
    CASE WHEN _is_admin THEN 0 ELSE 0 END,
    _is_admin
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------
-- 20260707233916_fc2c2789-7e8c-4bf1-84fd-214083b02c04.sql
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deduct_credits(uuid, integer, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_monthly_subscription_credits() FROM PUBLIC, anon, authenticated;

-- Keep role-check helpers available to signed-in users because existing access rules call them.
-- The helpers only evaluate the current signed-in user when used by those policies.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 20260707234126_cb7502be-0d50-4b95-a09d-c91d2a3a1e86.sql
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 20260708162254_6729ef04-224a-4f3e-9904-e45553151a96.sql
-- ---------------------------------------------------------------------

-- Dedupe subscriptions per user, keep the most recently started
DELETE FROM public.subscriptions s
USING public.subscriptions s2
WHERE s.user_id = s2.user_id
  AND s.id <> s2.id
  AND (s.started_at, s.id) < (s2.started_at, s2.id);

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_user_id_unique;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _is_admin boolean := (NEW.email = 'prasannaskvd@gmail.com');
  _full_name text := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    ''
  );
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, full_name, email, role, is_admin, user_credits)
    VALUES (
      NEW.id, _full_name, NEW.email,
      CASE WHEN _is_admin THEN 'admin' ELSE 'user' END,
      _is_admin, 50
    )
    ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email,
          is_admin = EXCLUDED.is_admin,
          role = EXCLUDED.role;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user profiles insert failed for %: %', NEW.id, SQLERRM;
  END;

  BEGIN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, CASE WHEN _is_admin THEN 'admin'::public.app_role ELSE 'user'::public.app_role END)
    ON CONFLICT (user_id, role) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user user_roles insert failed for %: %', NEW.id, SQLERRM;
  END;

  BEGIN
    INSERT INTO public.subscriptions (user_id, plan_name, status, monthly_credit_limit, unlimited_usage)
    VALUES (
      NEW.id,
      CASE WHEN _is_admin THEN 'admin' ELSE 'free' END,
      'active',
      0,
      _is_admin
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user subscriptions insert failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- 20260708200225_bffb285b-7f88-4eb4-b007-043103e1a116.sql
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;

-- ---------------------------------------------------------------------
-- 20260710005012_f1253319-62b6-4424-9dfd-0b928d9c0c06.sql
-- ---------------------------------------------------------------------

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'long',
  ADD COLUMN IF NOT EXISTS distribution jsonb,
  ADD COLUMN IF NOT EXISTS quality_report jsonb;

-- ---------------------------------------------------------------------
-- 20260710013525_2873f437-ad0e-46c8-afe8-26e599a37f23.sql
-- ---------------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS poster_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS thumbnail_prompt text,
  ADD COLUMN IF NOT EXISTS thumbnail_generated_at timestamptz;

-- ---------------------------------------------------------------------
-- 20260710204120_af35ea55-c9bc-41f3-becf-03b12e48cf2a.sql
-- ---------------------------------------------------------------------

-- === Extend projects ===
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_name text,
  ADD COLUMN IF NOT EXISTS objective text,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS aspect_ratio text,
  ADD COLUMN IF NOT EXISTS duration_sec integer,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS cta text,
  ADD COLUMN IF NOT EXISTS output_url text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- === characters ===
CREATE TABLE IF NOT EXISTS public.characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  character_type text,
  character_lock jsonb NOT NULL DEFAULT '{}'::jsonb,
  reference_image_url text,
  seed text,
  style text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.characters TO authenticated;
GRANT ALL ON public.characters TO service_role;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "characters owner all" ON public.characters FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_characters_updated_at BEFORE UPDATE ON public.characters
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- === brand_kits ===
CREATE TABLE IF NOT EXISTS public.brand_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_name text NOT NULL,
  instagram_handle text,
  logo_url text,
  website text,
  primary_color text,
  palette jsonb NOT NULL DEFAULT '{}'::jsonb,
  heading_font text,
  body_font text,
  tone text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_kits TO authenticated;
GRANT ALL ON public.brand_kits TO service_role;
ALTER TABLE public.brand_kits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_kits owner all" ON public.brand_kits FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_brand_kits_updated_at BEFORE UPDATE ON public.brand_kits
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- === project_scenes ===
CREATE TABLE IF NOT EXISTS public.project_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scene_number integer NOT NULL,
  start_time numeric,
  end_time numeric,
  duration numeric,
  dialogue text,
  narration text,
  on_screen_text text,
  image_prompt text,
  negative_prompt text,
  motion_prompt text,
  image_url text,
  video_url text,
  audio_url text,
  caption_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  transition text,
  sound_effect text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, scene_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_scenes TO authenticated;
GRANT ALL ON public.project_scenes TO service_role;
ALTER TABLE public.project_scenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_scenes owner all" ON public.project_scenes FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_project_scenes_updated_at BEFORE UPDATE ON public.project_scenes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- === carousel_slides ===
CREATE TABLE IF NOT EXISTS public.carousel_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slide_number integer NOT NULL,
  slide_type text,
  background_type text,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  styles jsonb NOT NULL DEFAULT '{}'::jsonb,
  image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  html text,
  export_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, slide_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carousel_slides TO authenticated;
GRANT ALL ON public.carousel_slides TO service_role;
ALTER TABLE public.carousel_slides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carousel_slides owner all" ON public.carousel_slides FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_carousel_slides_updated_at BEFORE UPDATE ON public.carousel_slides
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- === render_jobs ===
CREATE TABLE IF NOT EXISTS public.render_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  provider text,
  status text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  current_step text,
  output_url text,
  error_code text,
  safe_error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.render_jobs TO authenticated;
GRANT ALL ON public.render_jobs TO service_role;
ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "render_jobs owner all" ON public.render_jobs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_render_jobs_updated_at BEFORE UPDATE ON public.render_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- === generated_assets ===
CREATE TABLE IF NOT EXISTS public.generated_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_id uuid REFERENCES public.project_scenes(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_type text NOT NULL,
  provider text,
  url text,
  storage_path text,
  prompt text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_assets TO authenticated;
GRANT ALL ON public.generated_assets TO service_role;
ALTER TABLE public.generated_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "generated_assets owner all" ON public.generated_assets FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_project_scenes_project ON public.project_scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_carousel_slides_project ON public.carousel_slides(project_id);
CREATE INDEX IF NOT EXISTS idx_render_jobs_project ON public.render_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_generated_assets_project ON public.generated_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_content_type ON public.projects(user_id, content_type);

-- ---------------------------------------------------------------------
-- 20260711001810_ad94966a-d3f7-413d-a155-fdd21d87ad32.sql
-- ---------------------------------------------------------------------

-- 1. Extend projects with publishing status columns
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS publish_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS manually_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS platform_urls jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. platform_connections
CREATE TABLE IF NOT EXISTS public.platform_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  account_label text,
  account_id text,
  scopes text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'connected',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, account_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_connections TO authenticated;
GRANT ALL ON public.platform_connections TO service_role;
ALTER TABLE public.platform_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own platform_connections" ON public.platform_connections
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER set_pc_updated_at BEFORE UPDATE ON public.platform_connections
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. scheduled_posts
CREATE TABLE IF NOT EXISTS public.scheduled_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  platform text NOT NULL,
  connection_id uuid REFERENCES public.platform_connections(id) ON DELETE SET NULL,
  caption text,
  hashtags text,
  media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'ready',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  external_post_url text,
  external_post_id text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_posts TO authenticated;
GRANT ALL ON public.scheduled_posts TO service_role;
ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own scheduled_posts" ON public.scheduled_posts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_due
  ON public.scheduled_posts (status, scheduled_at)
  WHERE status IN ('scheduled', 'ready');
CREATE TRIGGER set_sp_updated_at BEFORE UPDATE ON public.scheduled_posts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- 20260711003441_59f9de8a-a920-4db2-a72f-b240d5d562ce.sql
-- ---------------------------------------------------------------------

ALTER TABLE public.platform_connections
  ADD COLUMN IF NOT EXISTS access_token_encrypted text,
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted text,
  ADD COLUMN IF NOT EXISTS token_iv text,
  ADD COLUMN IF NOT EXISTS refresh_iv text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS profile_url text,
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE TABLE IF NOT EXISTS public.oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  redirect_to text,
  code_verifier text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oauth_states TO authenticated;
GRANT ALL ON public.oauth_states TO service_role;
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own oauth_states" ON public.oauth_states;
CREATE POLICY "own oauth_states" ON public.oauth_states FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 20260711004426_5be47561-6aa2-483a-bf66-3264909ab540.sql
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- 20260711004916_d26d8623-91a2-4ea6-b3e3-c28f00405214.sql
-- ---------------------------------------------------------------------

UPDATE public.usage_history SET project_id = NULL
  WHERE project_id IS NOT NULL AND project_id NOT IN (SELECT id FROM public.projects);
ALTER TABLE public.usage_history
  ADD CONSTRAINT usage_history_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 20260713182208_eac3b9d8-84b9-48d3-97f9-9239cc551557.sql
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refund_credits(
  _user_id uuid,
  _amount integer,
  _project_id uuid,
  _description text,
  _source text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _sub public.subscriptions%ROWTYPE;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  -- Admin refunds are no-ops (they never paid).
  IF public.is_admin(_user_id) OR _source = 'admin' THEN
    INSERT INTO public.usage_history (user_id, project_id, credits_used, description, source)
    VALUES (_user_id, _project_id, 0, COALESCE('Refund: ' || _description, 'Refund'), 'refund');
    RETURN jsonb_build_object('ok', true, 'source', 'admin');
  END IF;

  IF _source = 'subscription' THEN
    SELECT * INTO _sub FROM public.subscriptions
      WHERE user_id = _user_id AND status = 'active'
      ORDER BY started_at DESC LIMIT 1
      FOR UPDATE;
    IF _sub.id IS NOT NULL AND NOT _sub.unlimited_usage THEN
      UPDATE public.subscriptions
        SET monthly_credits_used = GREATEST(0, monthly_credits_used - _amount)
        WHERE id = _sub.id;
    END IF;
  ELSIF _source = 'balance' THEN
    UPDATE public.profiles
      SET user_credits = user_credits + _amount
      WHERE id = _user_id;
  ELSE
    -- Unknown source: default to wallet balance (safer for the user).
    UPDATE public.profiles
      SET user_credits = user_credits + _amount
      WHERE id = _user_id;
  END IF;

  INSERT INTO public.usage_history (user_id, project_id, credits_used, description, source)
  VALUES (_user_id, _project_id, -_amount, COALESCE('Refund: ' || _description, 'Refund'), 'refund');

  RETURN jsonb_build_object('ok', true, 'source', COALESCE(_source, 'balance'), 'refunded', _amount);
END;
$$;

REVOKE ALL ON FUNCTION public.refund_credits(uuid, integer, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_credits(uuid, integer, uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 20260713182237_851f9b83-edad-4f4f-9433-502bf5ed5083.sql
-- ---------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.refund_credits(uuid, integer, uuid, text, text) FROM authenticated;

-- ---------------------------------------------------------------------
-- 20260714145822_cb272015-c9f7-4aaf-9952-855cb823aa35.sql
-- ---------------------------------------------------------------------

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS lifetime_credits int NOT NULL DEFAULT 0;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS lifetime_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS included_credits int NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.pricing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  plan_type text NOT NULL CHECK (plan_type IN ('free','monthly','yearly','lifetime','enterprise')),
  price_usd numeric(10,2) NOT NULL DEFAULT 0,
  period_label text,
  monthly_credits int NOT NULL DEFAULT 0,
  included_credits int NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  featured boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  contact_sales boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pricing_plans TO anon, authenticated;
GRANT ALL ON public.pricing_plans TO service_role;
ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read active plans" ON public.pricing_plans FOR SELECT
  USING (active = true OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins manage plans" ON public.pricing_plans FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP TRIGGER IF EXISTS pricing_plans_updated ON public.pricing_plans;
CREATE TRIGGER pricing_plans_updated BEFORE UPDATE ON public.pricing_plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.credit_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  label text NOT NULL,
  credits int NOT NULL,
  price_usd numeric(10,2) NOT NULL,
  bonus text,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credit_packs TO anon, authenticated;
GRANT ALL ON public.credit_packs TO service_role;
ALTER TABLE public.credit_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read active packs" ON public.credit_packs FOR SELECT
  USING (active = true OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins manage packs" ON public.credit_packs FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP TRIGGER IF EXISTS credit_packs_updated ON public.credit_packs;
CREATE TRIGGER credit_packs_updated BEFORE UPDATE ON public.credit_packs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed monthly + lifetime plans
INSERT INTO public.pricing_plans (code, name, plan_type, price_usd, period_label, monthly_credits, included_credits, features, featured, sort_order, contact_sales) VALUES
  ('free',         'Free',             'free',       0,   'forever',        0,    50,   '["50 signup credits","All core modules","Community styles","Uses credit balance only"]'::jsonb,                                                                                       false, 10, false),
  ('starter',      'Starter',          'monthly',    9,   '/ month',        300,  0,    '["300 credits / month","All content types","Standard visual styles","Priority queue"]'::jsonb,                                                                                        false, 20, false),
  ('creator',      'Creator',          'monthly',    19,  '/ month',        1000, 0,    '["1,000 credits / month","Premium styles","Voice selection","Priority support"]'::jsonb,                                                                                              true,  30, false),
  ('pro',          'Pro',              'monthly',    39,  '/ month',        3000, 0,    '["3,000 credits / month","Advanced styles + presets","Brand kits","Priority rendering"]'::jsonb,                                                                                      false, 40, false),
  ('team',         'Team',             'enterprise', 0,   'contact sales',  0,    0,    '["Multi-seat workspace","Shared brand kits & presets","Custom monthly credit pool","Dedicated priority rendering","Onboarding & Slack support","Invoiced billing available"]'::jsonb, false, 50, true),
  ('starter_life', 'Starter Lifetime', 'lifetime',   35,  'one-time',       0,    500,  '["Lifetime account","All core modules","500 included credits","Commercial usage","Basic templates","Standard AI generation","Manual publishing","Download unlimited outputs","Buy additional credit packs","No recurring payments"]'::jsonb, false, 60, false),
  ('creator_life', 'Creator Lifetime', 'lifetime',   79,  'one-time',       0,    1500, '["Everything in Starter Lifetime","1,500 included credits","More templates","Higher usage limits","Larger storage"]'::jsonb,                                                          true,  70, false),
  ('pro_life',     'Pro Lifetime',     'lifetime',   149, 'one-time',       0,    5000, '["Everything in Creator Lifetime","5,000 included credits","Priority rendering","Premium templates","Priority support"]'::jsonb,                                                     false, 80, false)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, plan_type = EXCLUDED.plan_type, price_usd = EXCLUDED.price_usd,
      period_label = EXCLUDED.period_label, monthly_credits = EXCLUDED.monthly_credits,
      included_credits = EXCLUDED.included_credits, features = EXCLUDED.features,
      featured = EXCLUDED.featured, sort_order = EXCLUDED.sort_order,
      contact_sales = EXCLUDED.contact_sales, active = true;

INSERT INTO public.credit_packs (code, label, credits, price_usd, bonus, sort_order) VALUES
  ('pack_250',  'Starter Pack', 250,  7,   NULL,    10),
  ('pack_500',  'Creator Pack', 500,  12,  NULL,    20),
  ('pack_1000', 'Pro Pack',     1000, 20,  NULL,    30),
  ('pack_2500', 'Studio Pack',  2500, 45,  '+10%',  40),
  ('pack_5000', 'Mega Pack',    5000, 79,  '+20%',  50)
ON CONFLICT (code) DO UPDATE
  SET label = EXCLUDED.label, credits = EXCLUDED.credits, price_usd = EXCLUDED.price_usd,
      bonus = EXCLUDED.bonus, sort_order = EXCLUDED.sort_order, active = true;

-- Deactivate legacy packs no longer offered
UPDATE public.credit_packs SET active = false
  WHERE code IN ('pack_100','pack_1500') AND code NOT IN ('pack_250','pack_500','pack_1000','pack_2500','pack_5000');

-- Consumption order: monthly subscription → top-up (profiles.user_credits) → lifetime → admin
CREATE OR REPLACE FUNCTION public.deduct_credits(_user_id uuid, _amount integer, _project_id uuid, _description text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sub public.subscriptions%ROWTYPE;
  _profile public.profiles%ROWTYPE;
BEGIN
  IF public.is_admin(_user_id) THEN
    INSERT INTO public.usage_history (user_id, project_id, credits_used, description, source)
    VALUES (_user_id, _project_id, 0, _description, 'admin');
    RETURN jsonb_build_object('ok', true, 'source', 'admin', 'remaining', -1);
  END IF;

  SELECT * INTO _sub FROM public.subscriptions
    WHERE user_id = _user_id AND status = 'active'
    ORDER BY started_at DESC LIMIT 1 FOR UPDATE;

  IF _sub.id IS NOT NULL AND _sub.unlimited_usage THEN
    INSERT INTO public.usage_history (user_id, project_id, credits_used, description, source)
    VALUES (_user_id, _project_id, 0, _description, 'subscription');
    RETURN jsonb_build_object('ok', true, 'source', 'subscription', 'remaining', -1);
  END IF;

  IF _sub.id IS NOT NULL AND (_sub.monthly_credit_limit - _sub.monthly_credits_used) >= _amount THEN
    UPDATE public.subscriptions SET monthly_credits_used = monthly_credits_used + _amount WHERE id = _sub.id;
    INSERT INTO public.usage_history (user_id, project_id, credits_used, description, source)
    VALUES (_user_id, _project_id, _amount, _description, 'subscription');
    RETURN jsonb_build_object('ok', true, 'source', 'subscription',
      'remaining', _sub.monthly_credit_limit - _sub.monthly_credits_used - _amount);
  END IF;

  SELECT * INTO _profile FROM public.profiles WHERE id = _user_id FOR UPDATE;

  IF _profile.user_credits >= _amount THEN
    UPDATE public.profiles SET user_credits = user_credits - _amount WHERE id = _user_id;
    INSERT INTO public.usage_history (user_id, project_id, credits_used, description, source)
    VALUES (_user_id, _project_id, _amount, _description, 'balance');
    RETURN jsonb_build_object('ok', true, 'source', 'balance', 'remaining', _profile.user_credits - _amount);
  END IF;

  IF COALESCE(_profile.lifetime_credits, 0) >= _amount THEN
    UPDATE public.profiles SET lifetime_credits = lifetime_credits - _amount WHERE id = _user_id;
    INSERT INTO public.usage_history (user_id, project_id, credits_used, description, source)
    VALUES (_user_id, _project_id, _amount, _description, 'lifetime');
    RETURN jsonb_build_object('ok', true, 'source', 'lifetime',
      'remaining', COALESCE(_profile.lifetime_credits, 0) - _amount);
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'insufficient_credits',
    'balance', _profile.user_credits,
    'lifetime', COALESCE(_profile.lifetime_credits, 0),
    'subscription_remaining', COALESCE(_sub.monthly_credit_limit - _sub.monthly_credits_used, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_credits(_user_id uuid, _amount integer, _project_id uuid, _description text, _source text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sub public.subscriptions%ROWTYPE;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  IF public.is_admin(_user_id) OR _source = 'admin' THEN
    INSERT INTO public.usage_history (user_id, project_id, credits_used, description, source)
    VALUES (_user_id, _project_id, 0, COALESCE('Refund: ' || _description, 'Refund'), 'refund');
    RETURN jsonb_build_object('ok', true, 'source', 'admin');
  END IF;

  IF _source = 'subscription' THEN
    SELECT * INTO _sub FROM public.subscriptions
      WHERE user_id = _user_id AND status = 'active' ORDER BY started_at DESC LIMIT 1 FOR UPDATE;
    IF _sub.id IS NOT NULL AND NOT _sub.unlimited_usage THEN
      UPDATE public.subscriptions SET monthly_credits_used = GREATEST(0, monthly_credits_used - _amount) WHERE id = _sub.id;
    END IF;
  ELSIF _source = 'lifetime' THEN
    UPDATE public.profiles SET lifetime_credits = COALESCE(lifetime_credits, 0) + _amount WHERE id = _user_id;
  ELSE
    UPDATE public.profiles SET user_credits = user_credits + _amount WHERE id = _user_id;
  END IF;

  INSERT INTO public.usage_history (user_id, project_id, credits_used, description, source)
  VALUES (_user_id, _project_id, -_amount, COALESCE('Refund: ' || _description, 'Refund'), 'refund');

  RETURN jsonb_build_object('ok', true, 'source', COALESCE(_source, 'balance'), 'refunded', _amount);
END;
$$;

-- ---------------------------------------------------------------------
-- 20260714145846_cb1df693-0c4e-46c1-a004-8e1fa5f5cb0a.sql
-- ---------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.refund_credits(uuid, integer, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits(uuid, integer, uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 20260714154843_abd147ab-d187-4d5b-9c18-09b12f32d9ed.sql
-- ---------------------------------------------------------------------

-- Templates module
CREATE TABLE public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('short_video','long_video','product_promo','documentary','carousel','linkedin_post','image','thumbnail','seo_pack')),
  description TEXT NOT NULL DEFAULT '',
  preview_image_url TEXT,
  aspect_ratio TEXT,
  platform TEXT,
  style TEXT,
  default_prompt TEXT NOT NULL DEFAULT '',
  default_brief JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[] NOT NULL DEFAULT '{}',
  access_tier TEXT NOT NULL DEFAULT 'free' CHECK (access_tier IN ('free','starter','creator','pro')),
  featured BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.templates TO authenticated;
GRANT ALL ON public.templates TO service_role;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_active_templates" ON public.templates FOR SELECT TO authenticated USING (active = true OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin_write_templates_ins" ON public.templates FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin_write_templates_upd" ON public.templates FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin_write_templates_del" ON public.templates FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER templates_updated_at BEFORE UPDATE ON public.templates FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX templates_category_idx ON public.templates(category, sort_order);
CREATE INDEX templates_featured_idx ON public.templates(featured) WHERE featured = true;

CREATE TABLE public.template_favorites (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, template_id)
);
GRANT SELECT, INSERT, DELETE ON public.template_favorites TO authenticated;
GRANT ALL ON public.template_favorites TO service_role;
ALTER TABLE public.template_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_favorites_all" ON public.template_favorites FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Seed 27 templates (3 per category)
INSERT INTO public.templates (slug, name, category, description, aspect_ratio, platform, style, default_prompt, default_brief, tags, access_tier, featured, sort_order) VALUES
-- Short video / Reel
('reel-morning-habits','Morning Habits That Change Your Life','short_video','Punchy 30s vertical reel with hook, 3 tips, CTA.','9:16','instagram','cinematic','A high-energy 30-second reel about 3 morning habits that transform productivity and mood.', '{"tone":"Energetic","platform":"instagram","aspect_ratio":"9:16","duration":30,"scenes":[{"beat":"Hook: You have been mornings wrong","seconds":3},{"beat":"Habit 1: Cold water splash","seconds":8},{"beat":"Habit 2: 5-min journaling","seconds":8},{"beat":"Habit 3: Silent walk","seconds":8},{"beat":"CTA: Save this for tomorrow","seconds":3}]}', ARRAY['reel','viral','morning','habits'], 'free', true, 10),
('reel-ai-tools-3','3 AI Tools I Cannot Work Without','short_video','Fast-paced product-highlight reel.','9:16','tiktok','minimal','A 30s TikTok showcasing 3 AI tools with quick UI cutaways and voiceover.', '{"tone":"Viral","platform":"tiktok","aspect_ratio":"9:16","duration":30,"scenes":[{"beat":"Hook: Stop using ChatGPT wrong","seconds":3},{"beat":"Tool 1 demo","seconds":8},{"beat":"Tool 2 demo","seconds":8},{"beat":"Tool 3 demo","seconds":8},{"beat":"Follow for more","seconds":3}]}', ARRAY['ai','tools','reel'], 'starter', false, 20),
('reel-money-tip','One Money Habit That Made Me Rich','short_video','Cinematic finance hook reel.','9:16','instagram','cinematic','A cinematic 45s reel on one non-obvious money habit.', '{"tone":"Emotional","platform":"instagram","aspect_ratio":"9:16","duration":45,"scenes":[{"beat":"Cold open: Bank balance shot","seconds":5},{"beat":"The mistake everyone makes","seconds":10},{"beat":"The one habit","seconds":15},{"beat":"Proof / result","seconds":10},{"beat":"CTA","seconds":5}]}', ARRAY['finance','reel','viral'], 'creator', true, 30),

-- Long Video
('long-yt-explainer','YouTube Explainer (8 min)','long_video','Structured 8-minute educational YouTube video with chapters.','16:9','youtube','documentary','An 8-minute in-depth explainer with intro, 3 chapters, examples, and outro CTA.', '{"tone":"Educational","platform":"youtube","aspect_ratio":"16:9","duration":480,"scenes":[{"beat":"Hook + promise","seconds":30},{"beat":"Intro / channel","seconds":30},{"beat":"Chapter 1: Concept","seconds":120},{"beat":"Chapter 2: Example","seconds":120},{"beat":"Chapter 3: Application","seconds":120},{"beat":"Recap + CTA","seconds":60}]}', ARRAY['youtube','long','explainer'], 'starter', false, 10),
('long-yt-story','Narrative Story Video (10 min)','long_video','MagnatesMedia-style narrative deep dive.','16:9','youtube','cinematic','A 10-minute cinematic narrative video about a business/history story with reveals.', '{"tone":"Cinematic","platform":"youtube","aspect_ratio":"16:9","duration":600,"scenes":[{"beat":"Cold open teaser","seconds":45},{"beat":"Act 1: Setup","seconds":180},{"beat":"Act 2: Conflict","seconds":180},{"beat":"Act 3: Resolution","seconds":150},{"beat":"Lesson + CTA","seconds":45}]}', ARRAY['story','narrative','youtube'], 'creator', true, 20),
('long-yt-listicle','Top 10 Countdown Video','long_video','Retention-optimized listicle with rank reveals.','16:9','youtube','cinematic','A 12-minute Top 10 countdown with a strong #1 tease every 90s.', '{"tone":"Viral","platform":"youtube","aspect_ratio":"16:9","duration":720,"scenes":[{"beat":"Hook + #1 tease","seconds":45},{"beat":"#10 to #6","seconds":300},{"beat":"Mid-video re-tease","seconds":30},{"beat":"#5 to #2","seconds":240},{"beat":"#1 reveal","seconds":75},{"beat":"CTA","seconds":30}]}', ARRAY['listicle','top10','youtube'], 'pro', true, 30),

-- Product promo
('promo-saas-launch','SaaS Launch Spot (45s)','product_promo','Problem-solution-CTA launch video.','16:9','youtube','minimal','A 45s SaaS launch spot: problem, solution demo, benefits, CTA.', '{"tone":"Professional","platform":"youtube","aspect_ratio":"16:9","duration":45,"scenes":[{"beat":"Problem","seconds":8},{"beat":"Meet the product","seconds":10},{"beat":"Feature demo","seconds":15},{"beat":"Social proof","seconds":7},{"beat":"CTA","seconds":5}]}', ARRAY['saas','launch','promo'], 'starter', false, 10),
('promo-ecom-hero','E-commerce Product Hero','product_promo','30s cinematic hero shot for a physical product.','1:1','instagram','cinematic','A 30s cinematic product hero for Instagram: macro shots, lifestyle, CTA.', '{"tone":"Luxury","platform":"instagram","aspect_ratio":"1:1","duration":30,"scenes":[{"beat":"Macro reveal","seconds":6},{"beat":"Lifestyle in-use","seconds":10},{"beat":"Feature callouts","seconds":8},{"beat":"Price + CTA","seconds":6}]}', ARRAY['ecommerce','product','hero'], 'creator', true, 20),
('promo-app-download','Mobile App Download Ad','product_promo','15s app install ad optimized for stories.','9:16','instagram','anime','A 15s vertical app install ad with animated UI and CTA.', '{"tone":"Energetic","platform":"instagram","aspect_ratio":"9:16","duration":15,"scenes":[{"beat":"Hook: pain","seconds":4},{"beat":"App demo","seconds":7},{"beat":"Download CTA","seconds":4}]}', ARRAY['app','install','ad'], 'pro', false, 30),

-- Documentary
('doc-brand-story','Brand Origin Documentary (5 min)','documentary','Emotional founder-story documentary.','16:9','youtube','documentary','A 5-minute brand origin documentary in Nat Geo style.', '{"tone":"Cinematic","platform":"youtube","aspect_ratio":"16:9","duration":300,"scenes":[{"beat":"Opening scene","seconds":30},{"beat":"The problem","seconds":60},{"beat":"The journey","seconds":90},{"beat":"The breakthrough","seconds":60},{"beat":"Where we are now","seconds":45},{"beat":"CTA","seconds":15}]}', ARRAY['documentary','brand','story'], 'creator', true, 10),
('doc-mystery','Unsolved Mystery Deep Dive','documentary','Suspenseful investigative doc.','16:9','youtube','dark','A 6-minute unsolved mystery investigation with cliffhanger pacing.', '{"tone":"Cinematic","platform":"youtube","aspect_ratio":"16:9","duration":360,"scenes":[{"beat":"Cold open mystery","seconds":40},{"beat":"Background","seconds":80},{"beat":"Theory 1","seconds":80},{"beat":"Theory 2","seconds":80},{"beat":"What we know","seconds":60},{"beat":"You decide","seconds":20}]}', ARRAY['mystery','documentary','dark'], 'pro', true, 20),
('doc-tech-history','Tech History Explainer','documentary','How-it-was-built style tech history.','16:9','youtube','cinematic','A 7-minute tech history documentary on how a technology was built.', '{"tone":"Educational","platform":"youtube","aspect_ratio":"16:9","duration":420,"scenes":[{"beat":"Hook","seconds":30},{"beat":"Origin","seconds":90},{"beat":"Turning point","seconds":90},{"beat":"Rise","seconds":90},{"beat":"Today","seconds":90},{"beat":"CTA","seconds":30}]}', ARRAY['tech','history','documentary'], 'creator', false, 30),

-- Carousel
('carousel-5-tips','5 Tips Carousel','carousel','Classic Instagram 5-slide tips carousel.','1:1','instagram','minimal','A 7-slide Instagram carousel: cover + 5 tips + CTA.', '{"tone":"Educational","platform":"instagram","aspect_ratio":"1:1","slides":[{"title":"Cover: 5 tips that changed how I work","body":""},{"title":"Tip 1","body":"..."},{"title":"Tip 2","body":"..."},{"title":"Tip 3","body":"..."},{"title":"Tip 4","body":"..."},{"title":"Tip 5","body":"..."},{"title":"Save this + follow","body":""}]}', ARRAY['carousel','tips','instagram'], 'free', true, 10),
('carousel-mistakes','Common Mistakes Carousel','carousel','Mistake-fix pattern carousel.','1:1','instagram','minimal','A 6-slide carousel: cover + 4 mistakes + fixes + CTA.', '{"tone":"Educational","platform":"instagram","aspect_ratio":"1:1","slides":[{"title":"5 mistakes killing your growth","body":""},{"title":"Mistake 1","body":"Fix: ..."},{"title":"Mistake 2","body":"Fix: ..."},{"title":"Mistake 3","body":"Fix: ..."},{"title":"Mistake 4","body":"Fix: ..."},{"title":"Share this","body":""}]}', ARRAY['carousel','mistakes'], 'starter', false, 20),
('carousel-case-study','Case Study Carousel','carousel','Story-arc case study carousel.','1:1','instagram','cinematic','A 8-slide case study carousel with results.', '{"tone":"Professional","platform":"instagram","aspect_ratio":"1:1","slides":[{"title":"How we grew X to Y","body":""},{"title":"The starting point","body":""},{"title":"The strategy","body":""},{"title":"Step 1","body":""},{"title":"Step 2","body":""},{"title":"Step 3","body":""},{"title":"The result","body":""},{"title":"DM us to replicate","body":""}]}', ARRAY['carousel','case-study'], 'creator', true, 30),

-- LinkedIn post
('li-story-post','Story-Driven LinkedIn Post','linkedin_post','Hook-first personal story post.','1:1','linkedin','minimal','A LinkedIn story post: 1-line hook + 6-line story + lesson + CTA question.', '{"tone":"Professional","platform":"linkedin","format":"text","structure":["1-line hook","6-line story","lesson","question CTA"]}', ARRAY['linkedin','story','post'], 'free', true, 10),
('li-carousel-doc','LinkedIn Document Carousel','linkedin_post','9-slide LinkedIn PDF carousel.','4:5','linkedin','minimal','A 9-slide LinkedIn document carousel on a professional topic.', '{"tone":"Professional","platform":"linkedin","format":"carousel","slides":9}', ARRAY['linkedin','carousel','document'], 'starter', false, 20),
('li-thought-leader','Thought Leadership Post','linkedin_post','Contrarian opinion post with data.','1:1','linkedin','minimal','A contrarian thought-leadership LinkedIn post with a data point + CTA.', '{"tone":"Professional","platform":"linkedin","format":"text","structure":["contrarian hook","3 supporting points","data point","CTA"]}', ARRAY['linkedin','thought-leader'], 'creator', true, 30),

-- Single image
('img-quote-card','Quote Card','image','Typography-forward quote graphic.','1:1','instagram','minimal','A minimal quote card with bold typography on gradient background.', '{"tone":"Emotional","platform":"instagram","aspect_ratio":"1:1","style":"minimal"}', ARRAY['image','quote'], 'free', false, 10),
('img-cinematic-hero','Cinematic Hero Shot','image','16:9 cinematic hero image.','16:9','youtube','cinematic','A cinematic hero shot with teal-orange grade and depth of field.', '{"tone":"Cinematic","aspect_ratio":"16:9","style":"cinematic"}', ARRAY['image','cinematic','hero'], 'starter', true, 20),
('img-3d-product','3D Product Mockup','image','Stylized 3D render of a product on gradient.','1:1','instagram','3d','A stylized 3D product mockup on a soft gradient with subtle shadows.', '{"tone":"Luxury","aspect_ratio":"1:1","style":"3d"}', ARRAY['image','3d','product'], 'creator', false, 30),

-- Thumbnail
('thumb-shock-face','Shocked Face Thumbnail','thumbnail','MrBeast-style high-CTR thumbnail.','16:9','youtube','realistic','A high-CTR YouTube thumbnail with a shocked face, bold 3-word text, and vivid contrast.', '{"platform":"youtube","aspect_ratio":"16:9","style":"realistic","text":"THIS CHANGED EVERYTHING"}', ARRAY['thumbnail','youtube','viral'], 'free', true, 10),
('thumb-before-after','Before / After Thumbnail','thumbnail','Split-screen transformation thumbnail.','16:9','youtube','cinematic','A split-screen before/after transformation thumbnail with bold red arrow.', '{"platform":"youtube","aspect_ratio":"16:9","style":"cinematic","layout":"split"}', ARRAY['thumbnail','before-after'], 'starter', false, 20),
('thumb-luxury','Luxury Product Thumbnail','thumbnail','Premium teal-gold thumbnail.','16:9','youtube','cinematic','A luxury teal-gold thumbnail with elegant typography.', '{"platform":"youtube","aspect_ratio":"16:9","style":"cinematic","text":"THE $10,000 SECRET"}', ARRAY['thumbnail','luxury'], 'creator', true, 30),

-- SEO pack
('seo-blog-post','Blog Post SEO Pack','seo_pack','Full SEO pack for a blog post.','1:1','youtube','minimal','SEO pack for a blog post: title, meta description, 10 keywords, 5 H2s, FAQ.', '{"platform":"blog","components":["title","meta","keywords","h2s","faq"]}', ARRAY['seo','blog'], 'free', false, 10),
('seo-yt-pack','YouTube SEO Pack','seo_pack','Title, description, tags, chapters.','16:9','youtube','minimal','SEO pack for a YouTube video: 5 title options, description, 20 tags, 8 chapter timestamps.', '{"platform":"youtube","components":["titles","description","tags","chapters"]}', ARRAY['seo','youtube'], 'starter', true, 20),
('seo-product-page','Product Page SEO Pack','seo_pack','E-commerce product page SEO.','1:1','shopify','minimal','SEO pack for an e-commerce product page: title, meta, 5 bullet features, description, FAQ.', '{"platform":"shopify","components":["title","meta","bullets","description","faq"]}', ARRAY['seo','ecommerce'], 'pro', false, 30);

-- ---------------------------------------------------------------------
-- 20260714155752_488d71b9-dd4f-4a53-bcd4-322ca6cf2330.sql
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- 20260714160353_095f4795-ba60-480e-9fef-38ec078f11d0.sql
-- ---------------------------------------------------------------------

ALTER TABLE public.pricing_plans RENAME COLUMN price_monthly_inr TO price_monthly_usd;
ALTER TABLE public.pricing_plans RENAME COLUMN price_yearly_inr TO price_yearly_usd;
ALTER TABLE public.pricing_plans RENAME COLUMN price_lifetime_inr TO price_lifetime_usd;

UPDATE public.pricing_plans SET price_monthly_usd = 0,   price_yearly_usd = 0,   price_lifetime_usd = 0   WHERE code = 'free';
UPDATE public.pricing_plans SET price_monthly_usd = 5,   price_yearly_usd = 49,  price_lifetime_usd = 0   WHERE code = 'starter';
UPDATE public.pricing_plans SET price_monthly_usd = 15,  price_yearly_usd = 149, price_lifetime_usd = 0   WHERE code = 'pro';
UPDATE public.pricing_plans SET price_monthly_usd = 29,  price_yearly_usd = 289, price_lifetime_usd = 0   WHERE code = 'business';
UPDATE public.pricing_plans SET price_monthly_usd = 0,   price_yearly_usd = 0,   price_lifetime_usd = 0   WHERE code = 'enterprise';
UPDATE public.pricing_plans SET price_monthly_usd = 0,   price_yearly_usd = 0,   price_lifetime_usd = 149 WHERE code = 'lifetime';

-- ---------------------------------------------------------------------
-- 20260714160912_a9c1ee70-bcde-481b-a68b-0c79b88866a0.sql
-- ---------------------------------------------------------------------
-- Allow public (anon + authenticated) reads of active templates so the
-- catalog is visible via the server publishable-key client used by
-- listTemplatesFn. Admin write policies remain unchanged.
DROP POLICY IF EXISTS "auth_read_active_templates" ON public.templates;
CREATE POLICY "public_read_active_templates"
  ON public.templates FOR SELECT
  TO anon, authenticated
  USING (active = true OR public.has_role(auth.uid(), 'admin'::public.app_role));

GRANT SELECT ON public.templates TO anon;

-- ---------------------------------------------------------------------
-- 20260714162200_e5de6da0-3ffc-43d3-91dd-cf40571ecdfe.sql
-- ---------------------------------------------------------------------

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS preview_video_url text,
  ADD COLUMN IF NOT EXISTS poster_url text,
  ADD COLUMN IF NOT EXISTS preview_type text NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS alt_text text;

ALTER TABLE public.templates
  DROP CONSTRAINT IF EXISTS templates_preview_type_check;
ALTER TABLE public.templates
  ADD CONSTRAINT templates_preview_type_check
  CHECK (preview_type IN ('image', 'video'));

-- ---------------------------------------------------------------------
-- 20260714164239_2cef7f62-88e8-41ec-b1c2-ac8c69054977.sql
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- 20260714171045_60dc220c-7bbc-4684-97c9-5673cbb7f56d.sql
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- 20260714172212_4439b81f-d557-4e8f-9037-e5fbb0e5efad.sql
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- 20260715140844_5fe791ae-7fc9-4666-964d-7165e63183d0.sql
-- ---------------------------------------------------------------------
-- CreatorFlow AI — AI Content OS extension (additive)

-- 1) STRATEGIES
CREATE TABLE IF NOT EXISTS public.strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  promoting text,
  product text,
  audience text,
  goal text,
  primary_platform text,
  secondary_platforms text[] DEFAULT '{}',
  tone text,
  frequency text,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategies TO authenticated;
GRANT ALL ON public.strategies TO service_role;
ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;
CREATE POLICY strategies_owner ON public.strategies FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER strategies_updated_at BEFORE UPDATE ON public.strategies
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) RESEARCH REPORTS
CREATE TABLE IF NOT EXISTS public.research_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  topic text NOT NULL,
  niche text,
  platform text,
  findings jsonb NOT NULL DEFAULT '{}'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_reports TO authenticated;
GRANT ALL ON public.research_reports TO service_role;
ALTER TABLE public.research_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY research_owner ON public.research_reports FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3) BRAND KITS — extend existing table (skip existing columns)
ALTER TABLE public.brand_kits
  ADD COLUMN IF NOT EXISTS brand_voice text,
  ADD COLUMN IF NOT EXISTS default_cta text,
  ADD COLUMN IF NOT EXISTS watermark_url text,
  ADD COLUMN IF NOT EXISTS intro_url text,
  ADD COLUMN IF NOT EXISTS outro_url text,
  ADD COLUMN IF NOT EXISTS keywords text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- 4) PROJECT MEMORY (append-only)
CREATE TABLE IF NOT EXISTS public.project_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ref_url text,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_memory_project_idx ON public.project_memory(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_memory TO authenticated;
GRANT ALL ON public.project_memory TO service_role;
ALTER TABLE public.project_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_memory_owner ON public.project_memory FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5) QUALITY SCORES
CREATE TABLE IF NOT EXISTS public.quality_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  asset_type text NOT NULL,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quality_scores TO authenticated;
GRANT ALL ON public.quality_scores TO service_role;
ALTER TABLE public.quality_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY quality_scores_owner ON public.quality_scores FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6) AI EDITS
CREATE TABLE IF NOT EXISTS public.ai_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  target text NOT NULL,
  target_ref text,
  instruction text NOT NULL,
  before_text text,
  after_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_edits TO authenticated;
GRANT ALL ON public.ai_edits TO service_role;
ALTER TABLE public.ai_edits ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_edits_owner ON public.ai_edits FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 7) REPURPOSED ASSETS
CREATE TABLE IF NOT EXISTS public.repurposed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  format text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'ready',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repurposed_assets TO authenticated;
GRANT ALL ON public.repurposed_assets TO service_role;
ALTER TABLE public.repurposed_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY repurposed_owner ON public.repurposed_assets FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 8) ANALYTICS EVENTS
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_events_user_idx ON public.analytics_events(user_id, occurred_at DESC);
GRANT SELECT, INSERT ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY analytics_owner ON public.analytics_events FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 9) MARKETPLACE ITEMS
CREATE TABLE IF NOT EXISTS public.marketplace_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  preview_url text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  price_usd_cents int,
  tier text DEFAULT 'free',
  active boolean NOT NULL DEFAULT true,
  sort int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.marketplace_items TO authenticated;
GRANT ALL ON public.marketplace_items TO service_role;
ALTER TABLE public.marketplace_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY marketplace_read_active ON public.marketplace_items FOR SELECT TO authenticated
  USING (active = true OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY marketplace_admin_write ON public.marketplace_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER marketplace_updated_at BEFORE UPDATE ON public.marketplace_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 10) MARKETPLACE INSTALLS
CREATE TABLE IF NOT EXISTS public.marketplace_installs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.marketplace_items(id) ON DELETE CASCADE,
  installed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, item_id)
);
GRANT SELECT, INSERT, DELETE ON public.marketplace_installs TO authenticated;
GRANT ALL ON public.marketplace_installs TO service_role;
ALTER TABLE public.marketplace_installs ENABLE ROW LEVEL SECURITY;
CREATE POLICY marketplace_installs_owner ON public.marketplace_installs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 20260715163039_1d14a97e-5c85-4e1a-9c79-080bd19949ee.sql
-- ---------------------------------------------------------------------

-- Templates: negative prompt, credits, draft/published status
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS negative_prompt text,
  ADD COLUMN IF NOT EXISTS credits integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'templates_status_check') THEN
    ALTER TABLE public.templates ADD CONSTRAINT templates_status_check CHECK (status IN ('draft','published'));
  END IF;
END $$;

-- Template version history
CREATE TABLE IF NOT EXISTS public.template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);
GRANT SELECT ON public.template_versions TO authenticated;
GRANT ALL ON public.template_versions TO service_role;
ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='template_versions' AND policyname='Admins can read template versions') THEN
    CREATE POLICY "Admins can read template versions" ON public.template_versions
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- Brand kits: add legacy/UI-compat columns + default styles
ALTER TABLE public.brand_kits
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS secondary_color text,
  ADD COLUMN IF NOT EXISTS font_primary text,
  ADD COLUMN IF NOT EXISTS font_secondary text,
  ADD COLUMN IF NOT EXISTS default_styles jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ---------------------------------------------------------------------
-- 20260715164259_c78a4dea-2315-4974-b937-4547e9aad17b.sql
-- ---------------------------------------------------------------------

CREATE TABLE public.asset_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image','video','logo','voiceover','music','character','background','document')),
  title TEXT NOT NULL DEFAULT 'Untitled',
  description TEXT,
  url TEXT NOT NULL,
  storage_path TEXT,
  thumbnail_url TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  duration_seconds NUMERIC,
  width INTEGER,
  height INTEGER,
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  favorite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_library TO authenticated;
GRANT ALL ON public.asset_library TO service_role;

ALTER TABLE public.asset_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asset_library owner all" ON public.asset_library
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_asset_library_user_created ON public.asset_library (user_id, created_at DESC);
CREATE INDEX idx_asset_library_kind ON public.asset_library (user_id, kind);
CREATE INDEX idx_asset_library_tags ON public.asset_library USING GIN (tags);

CREATE TRIGGER trg_asset_library_updated_at
  BEFORE UPDATE ON public.asset_library
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Storage policies for the public 'library' bucket (auth users manage own folder)
CREATE POLICY "library_read_public" ON storage.objects FOR SELECT
  USING (bucket_id = 'library');
CREATE POLICY "library_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'library' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "library_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'library' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "library_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'library' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ---------------------------------------------------------------------
-- 20260715165258_e95da4d4-e420-4b44-a540-a1a276c48e10.sql
-- ---------------------------------------------------------------------

CREATE TABLE public.landing_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('testimonial','demo')),
  title text,
  subtitle text,
  country text,
  company text,
  quote text,
  review text,
  poster_url text,
  video_url text,
  video_type text CHECK (video_type IS NULL OR video_type IN ('mp4','webm','youtube','vimeo')),
  duration text,
  source text CHECK (source IS NULL OR source IN ('customer','sample','demo')),
  rating int CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.landing_media TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_media TO authenticated;
GRANT ALL ON public.landing_media TO service_role;

ALTER TABLE public.landing_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published landing media" ON public.landing_media
  FOR SELECT TO anon, authenticated USING (status = 'published');

CREATE POLICY "Admins can view all landing media" ON public.landing_media
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can insert landing media" ON public.landing_media
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update landing media" ON public.landing_media
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete landing media" ON public.landing_media
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_landing_media_updated_at BEFORE UPDATE ON public.landing_media
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_landing_media_kind_status_order ON public.landing_media (kind, status, display_order);

-- Storage policies for 'landing' bucket: public read, admin write
CREATE POLICY "Public read landing bucket" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'landing');

CREATE POLICY "Admins upload to landing" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'landing' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins update landing" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'landing' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins delete landing" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'landing' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- ---------------------------------------------------------------------
-- 20260715185507_4c9c7300-266e-494b-93ec-88b527378fb6.sql
-- ---------------------------------------------------------------------

ALTER TABLE public.landing_media
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS consent_confirmed BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------
-- 20260715201121_82e44d33-265b-411d-9e69-5eed56895ff6.sql
-- ---------------------------------------------------------------------

-- 1) Ledger table
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  project_id UUID,
  render_job_id UUID,
  credits_estimated INTEGER NOT NULL DEFAULT 0,
  credits_reserved  INTEGER NOT NULL DEFAULT 0,
  credits_charged   INTEGER NOT NULL DEFAULT 0,
  credits_refunded  INTEGER NOT NULL DEFAULT 0,
  balance_before    INTEGER NOT NULL DEFAULT 0,
  balance_after     INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'balance',   -- subscription | balance | lifetime | admin
  status TEXT NOT NULL DEFAULT 'reserved',  -- reserved | charged | refunded | failed
  idempotency_key TEXT NOT NULL,
  description TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS credit_ledger_user_created_idx
  ON public.credit_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS credit_ledger_status_idx
  ON public.credit_ledger(status);

GRANT SELECT ON public.credit_ledger TO authenticated;
GRANT ALL    ON public.credit_ledger TO service_role;

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own ledger" ON public.credit_ledger;
CREATE POLICY "Users read own ledger"
  ON public.credit_ledger
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Writes happen exclusively via SECURITY DEFINER RPCs (service_role owns).
-- No INSERT/UPDATE/DELETE policy for authenticated: client cannot bypass RPCs.

DROP TRIGGER IF EXISTS trg_credit_ledger_updated_at ON public.credit_ledger;
CREATE TRIGGER trg_credit_ledger_updated_at
  BEFORE UPDATE ON public.credit_ledger
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


-- 2) Summary function (plan-aware modal reads this)
CREATE OR REPLACE FUNCTION public.get_credit_summary(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sub public.subscriptions%ROWTYPE;
  _profile public.profiles%ROWTYPE;
  _is_admin BOOLEAN;
  _monthly_remaining INTEGER := 0;
  _balance INTEGER := 0;
  _lifetime INTEGER := 0;
  _plan_type TEXT := 'free';
BEGIN
  _is_admin := public.is_admin(_user_id);

  SELECT * INTO _profile FROM public.profiles WHERE id = _user_id;
  SELECT * INTO _sub FROM public.subscriptions
    WHERE user_id = _user_id AND status = 'active'
    ORDER BY started_at DESC LIMIT 1;

  _balance  := COALESCE(_profile.user_credits, 0);
  _lifetime := COALESCE(_profile.lifetime_credits, 0);

  IF _sub.id IS NOT NULL THEN
    _monthly_remaining := GREATEST(0, COALESCE(_sub.monthly_credit_limit,0) - COALESCE(_sub.monthly_credits_used,0));
    _plan_type := COALESCE(_sub.plan_name, 'free');
  END IF;

  RETURN jsonb_build_object(
    'unlimited', _is_admin OR COALESCE(_sub.unlimited_usage, false),
    'plan_type', CASE WHEN _is_admin THEN 'admin' ELSE _plan_type END,
    'monthly_remaining', _monthly_remaining,
    'balance', _balance,
    'lifetime', _lifetime,
    'available', _monthly_remaining + _balance + _lifetime,
    'can_buy_topups', true  -- top-ups are available on every plan
  );
END;
$$;


-- 3) reserve_credits — atomic hold + idempotent
CREATE OR REPLACE FUNCTION public.reserve_credits(
  _user_id UUID,
  _amount INTEGER,
  _action TEXT,
  _project_id UUID,
  _idempotency_key TEXT,
  _description TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing public.credit_ledger%ROWTYPE;
  _sub public.subscriptions%ROWTYPE;
  _profile public.profiles%ROWTYPE;
  _is_admin BOOLEAN;
  _monthly_remaining INTEGER := 0;
  _available INTEGER := 0;
  _source TEXT := 'balance';
  _bal_before INTEGER := 0;
  _bal_after  INTEGER := 0;
  _new_id UUID;
BEGIN
  IF _amount IS NULL OR _amount < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  -- Idempotency short-circuit
  SELECT * INTO _existing FROM public.credit_ledger
    WHERE user_id = _user_id AND idempotency_key = _idempotency_key
    FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'ledger_id', _existing.id,
      'source', _existing.source,
      'reused', true,
      'status', _existing.status,
      'balance_before', _existing.balance_before,
      'balance_after',  _existing.balance_after
    );
  END IF;

  _is_admin := public.is_admin(_user_id);

  SELECT * INTO _profile FROM public.profiles WHERE id = _user_id FOR UPDATE;
  SELECT * INTO _sub FROM public.subscriptions
    WHERE user_id = _user_id AND status = 'active'
    ORDER BY started_at DESC LIMIT 1 FOR UPDATE;

  -- Admin / unlimited: audit-only zero-cost row
  IF _is_admin OR COALESCE(_sub.unlimited_usage, false) THEN
    INSERT INTO public.credit_ledger(user_id, action, project_id, credits_estimated,
      credits_reserved, credits_charged, source, status, idempotency_key, description,
      balance_before, balance_after)
    VALUES (_user_id, _action, _project_id, _amount, 0, 0,
      CASE WHEN _is_admin THEN 'admin' ELSE 'subscription' END,
      'reserved', _idempotency_key, _description, 0, 0)
    RETURNING id INTO _new_id;
    RETURN jsonb_build_object('ok', true, 'ledger_id', _new_id,
      'source', CASE WHEN _is_admin THEN 'admin' ELSE 'subscription' END,
      'unlimited', true, 'balance_before', 0, 'balance_after', 0);
  END IF;

  IF _sub.id IS NOT NULL THEN
    _monthly_remaining := GREATEST(0, COALESCE(_sub.monthly_credit_limit,0) - COALESCE(_sub.monthly_credits_used,0));
  END IF;
  _available := _monthly_remaining + COALESCE(_profile.user_credits,0) + COALESCE(_profile.lifetime_credits,0);

  IF _amount > _available THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_credits',
      'required', _amount,
      'available', _available,
      'shortage', _amount - _available,
      'monthly_remaining', _monthly_remaining,
      'balance', COALESCE(_profile.user_credits,0),
      'lifetime', COALESCE(_profile.lifetime_credits,0),
      'plan_type', COALESCE(_sub.plan_name, 'free')
    );
  END IF;

  _bal_before := _available;

  -- Consumption order: monthly → balance → lifetime
  IF _monthly_remaining >= _amount THEN
    UPDATE public.subscriptions SET monthly_credits_used = monthly_credits_used + _amount WHERE id = _sub.id;
    _source := 'subscription';
  ELSIF _monthly_remaining > 0 THEN
    -- split
    UPDATE public.subscriptions SET monthly_credits_used = monthly_credits_used + _monthly_remaining WHERE id = _sub.id;
    DECLARE _rem INTEGER := _amount - _monthly_remaining;
    BEGIN
      IF COALESCE(_profile.user_credits,0) >= _rem THEN
        UPDATE public.profiles SET user_credits = user_credits - _rem WHERE id = _user_id;
        _source := 'subscription';  -- primary source label
      ELSE
        DECLARE _rem2 INTEGER := _rem - COALESCE(_profile.user_credits,0);
        BEGIN
          UPDATE public.profiles SET user_credits = 0 WHERE id = _user_id;
          UPDATE public.profiles SET lifetime_credits = lifetime_credits - _rem2 WHERE id = _user_id;
          _source := 'subscription';
        END;
      END IF;
    END;
  ELSIF COALESCE(_profile.user_credits,0) >= _amount THEN
    UPDATE public.profiles SET user_credits = user_credits - _amount WHERE id = _user_id;
    _source := 'balance';
  ELSIF COALESCE(_profile.user_credits,0) > 0 THEN
    DECLARE _rem INTEGER := _amount - COALESCE(_profile.user_credits,0);
    BEGIN
      UPDATE public.profiles SET user_credits = 0 WHERE id = _user_id;
      UPDATE public.profiles SET lifetime_credits = lifetime_credits - _rem WHERE id = _user_id;
      _source := 'balance';
    END;
  ELSE
    UPDATE public.profiles SET lifetime_credits = lifetime_credits - _amount WHERE id = _user_id;
    _source := 'lifetime';
  END IF;

  _bal_after := _bal_before - _amount;

  INSERT INTO public.credit_ledger(user_id, action, project_id, credits_estimated,
    credits_reserved, source, status, idempotency_key, description,
    balance_before, balance_after)
  VALUES (_user_id, _action, _project_id, _amount, _amount, _source,
    'reserved', _idempotency_key, _description, _bal_before, _bal_after)
  RETURNING id INTO _new_id;

  RETURN jsonb_build_object('ok', true, 'ledger_id', _new_id, 'source', _source,
    'balance_before', _bal_before, 'balance_after', _bal_after);
END;
$$;


-- 4) finalize_credits — mark reserved row as charged
CREATE OR REPLACE FUNCTION public.finalize_credits(_ledger_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _row public.credit_ledger%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.credit_ledger WHERE id = _ledger_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF _row.status = 'charged' THEN RETURN jsonb_build_object('ok', true, 'reused', true); END IF;
  IF _row.status <> 'reserved' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', _row.status);
  END IF;
  UPDATE public.credit_ledger SET status = 'charged', credits_charged = credits_reserved
    WHERE id = _ledger_id;

  -- Mirror into legacy usage_history for existing analytics
  INSERT INTO public.usage_history (user_id, project_id, credits_used, description, source)
  VALUES (_row.user_id, _row.project_id, _row.credits_reserved, COALESCE(_row.description, _row.action), _row.source);

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- 5) refund_credits_by_ledger — restore to same source, mark refunded
CREATE OR REPLACE FUNCTION public.refund_credits_by_ledger(_ledger_id UUID, _reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.credit_ledger%ROWTYPE;
  _sub public.subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.credit_ledger WHERE id = _ledger_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF _row.status IN ('refunded','failed') THEN
    RETURN jsonb_build_object('ok', true, 'reused', true);
  END IF;
  IF _row.credits_reserved <= 0 THEN
    UPDATE public.credit_ledger SET status = 'failed', error = _reason WHERE id = _ledger_id;
    RETURN jsonb_build_object('ok', true, 'noop', true);
  END IF;

  IF _row.source = 'subscription' THEN
    SELECT * INTO _sub FROM public.subscriptions
      WHERE user_id = _row.user_id AND status = 'active'
      ORDER BY started_at DESC LIMIT 1 FOR UPDATE;
    IF _sub.id IS NOT NULL AND NOT COALESCE(_sub.unlimited_usage,false) THEN
      UPDATE public.subscriptions SET monthly_credits_used = GREATEST(0, monthly_credits_used - _row.credits_reserved)
        WHERE id = _sub.id;
    END IF;
  ELSIF _row.source = 'lifetime' THEN
    UPDATE public.profiles SET lifetime_credits = COALESCE(lifetime_credits,0) + _row.credits_reserved
      WHERE id = _row.user_id;
  ELSIF _row.source = 'balance' THEN
    UPDATE public.profiles SET user_credits = COALESCE(user_credits,0) + _row.credits_reserved
      WHERE id = _row.user_id;
  END IF;

  UPDATE public.credit_ledger
    SET status = 'refunded', credits_refunded = _row.credits_reserved, error = _reason
    WHERE id = _ledger_id;

  RETURN jsonb_build_object('ok', true, 'refunded', _row.credits_reserved, 'source', _row.source);
END;
$$;

-- ---------------------------------------------------------------------
-- 20260715201158_fbf2e0e8-ddeb-4d35-b7df-39b0676bf214.sql
-- ---------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.reserve_credits(UUID, INTEGER, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_credits(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_credits_by_ledger(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_credit_summary(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_credits(UUID, INTEGER, TEXT, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_credits(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits_by_ledger(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_credit_summary(UUID) TO service_role;

-- ---------------------------------------------------------------------
-- 20260717173201_3ba01da7-f4ab-4837-bd46-f9ad513aa29c.sql
-- ---------------------------------------------------------------------

-- 1. app_settings: remove public read, restrict to authenticated
DROP POLICY IF EXISTS "app_settings public read" ON public.app_settings;
CREATE POLICY "app_settings authenticated read" ON public.app_settings
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.app_settings FROM anon;

-- 2. library storage: only owner may read their folder
DROP POLICY IF EXISTS "library_read_public" ON storage.objects;
CREATE POLICY "library_read_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'library' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 3. Lock down privileged SECURITY DEFINER functions to service_role only.
-- has_role / is_admin remain callable by authenticated because RLS policies
-- and server user-context checks depend on them.
REVOKE EXECUTE ON FUNCTION public.reserve_credits(uuid, integer, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_credits(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_credits_by_ledger(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_credits(uuid, integer, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_credit_summary(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_monthly_subscription_credits() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_credits(uuid, integer, text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_credits(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits_by_ledger(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits(uuid, integer, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_credit_summary(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_monthly_subscription_credits() TO service_role;

-- ---------------------------------------------------------------------
-- 20260717191542_1bab8b47-f35a-4071-97e1-ab2e27d9d7da.sql
-- ---------------------------------------------------------------------

-- Phase A: shared generation jobs + feature readiness tracking

-- 1) generation_jobs: unified job record for every AI module
CREATE TABLE IF NOT EXISTS public.generation_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  module_type TEXT NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','validating','processing','rendering','uploading','completed','failed','cancelled')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  current_step TEXT,
  provider TEXT,
  provider_job_id TEXT,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  credits_reserved INTEGER NOT NULL DEFAULT 0,
  credits_charged INTEGER NOT NULL DEFAULT 0,
  ledger_id UUID,
  idempotency_key TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_id ON public.generation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_project_id ON public.generation_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON public.generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_created_at ON public.generation_jobs(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_generation_jobs_user_idem ON public.generation_jobs(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.generation_jobs TO authenticated;
GRANT ALL ON public.generation_jobs TO service_role;

ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='generation_jobs' AND policyname='jobs_owner_select') THEN
    CREATE POLICY jobs_owner_select ON public.generation_jobs FOR SELECT
      TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='generation_jobs' AND policyname='jobs_owner_insert') THEN
    CREATE POLICY jobs_owner_insert ON public.generation_jobs FOR INSERT
      TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='generation_jobs' AND policyname='jobs_owner_update') THEN
    CREATE POLICY jobs_owner_update ON public.generation_jobs FOR UPDATE
      TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_generation_jobs_updated_at ON public.generation_jobs;
CREATE TRIGGER trg_generation_jobs_updated_at BEFORE UPDATE ON public.generation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) Link credit ledger rows to jobs so polling never double-charges
ALTER TABLE public.credit_ledger ADD COLUMN IF NOT EXISTS job_id UUID
  REFERENCES public.generation_jobs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_credit_ledger_job_id ON public.credit_ledger(job_id);

-- 3) feature_readiness: source of truth for landing comparison + admin dashboard
CREATE TABLE IF NOT EXISTS public.feature_readiness (
  feature_id TEXT NOT NULL PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'beta'
    CHECK (status IN ('available','beta','coming_soon','not_available')),
  ui_implemented BOOLEAN NOT NULL DEFAULT false,
  backend_implemented BOOLEAN NOT NULL DEFAULT false,
  provider_configured BOOLEAN NOT NULL DEFAULT false,
  generation_tested BOOLEAN NOT NULL DEFAULT false,
  credits_tested BOOLEAN NOT NULL DEFAULT false,
  preview_tested BOOLEAN NOT NULL DEFAULT false,
  download_tested BOOLEAN NOT NULL DEFAULT false,
  persistence_tested BOOLEAN NOT NULL DEFAULT false,
  retry_tested BOOLEAN NOT NULL DEFAULT false,
  no_production_mocks BOOLEAN NOT NULL DEFAULT false,
  blockers TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.feature_readiness TO authenticated, anon;
GRANT ALL ON public.feature_readiness TO service_role;

ALTER TABLE public.feature_readiness ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='feature_readiness' AND policyname='readiness_public_read') THEN
    CREATE POLICY readiness_public_read ON public.feature_readiness FOR SELECT
      TO anon, authenticated USING (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_feature_readiness_updated_at ON public.feature_readiness;
CREATE TRIGGER trg_feature_readiness_updated_at BEFORE UPDATE ON public.feature_readiness
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed feature rows (conservative defaults; app updates via runReadinessCheck)
INSERT INTO public.feature_readiness (feature_id, status, ui_implemented, backend_implemented, provider_configured, no_production_mocks, blockers, notes)
VALUES
  ('seo_package',    'beta', true,  true,  true,  true,  '{}',                                                'Structured multi-section generator, no fake SEO metrics.'),
  ('image_editing',  'beta', true,  true,  true,  true,  '{}',                                                'Browser edits + Gemini generative edits via LOVABLE_API_KEY.'),
  ('voiceover',      'beta', true,  false, false, true,  '{"No production TTS provider configured"}',        'Awaiting ElevenLabs/OpenAI TTS key.'),
  ('ai_video',       'beta', true,  false, false, true,  '{"No production video-render provider configured"}','Awaiting hosted render worker (Shotstack/Remotion Lambda).'),
  ('short_video',    'beta', true,  false, false, true,  '{"No production video-render provider configured"}','Same blocker as ai_video.'),
  ('long_video',     'beta', true,  false, false, true,  '{"No production video-render provider configured"}','Same blocker as ai_video.')
ON CONFLICT (feature_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 20260720162940_f90870e5-b803-4e8d-bb17-0c9ff9130ccf.sql
-- ---------------------------------------------------------------------

-- 1. Extend characters
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS voice_id text,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS age_range text,
  ADD COLUMN IF NOT EXISTS outfit text,
  ADD COLUMN IF NOT EXISTS description text;

-- 2. dialogue_lines
CREATE TABLE IF NOT EXISTS public.dialogue_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_id text,
  speaker_id uuid REFERENCES public.characters(id) ON DELETE SET NULL,
  speaker_name text,
  speech_type text NOT NULL DEFAULT 'narration', -- narration | dialogue | thought | vo
  text text NOT NULL DEFAULT '',
  emotion text DEFAULT 'neutral',
  voice_id text,
  language text,
  start_time numeric,
  end_time numeric,
  lip_sync_required boolean NOT NULL DEFAULT false,
  audio_url text,
  status text NOT NULL DEFAULT 'pending', -- pending | voice_ready | lip_sync_processing | lip_sync_complete | failed
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dialogue_lines TO authenticated;
GRANT ALL ON public.dialogue_lines TO service_role;
ALTER TABLE public.dialogue_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dialogue_lines owner all" ON public.dialogue_lines
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_lines_project ON public.dialogue_lines(project_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_lines_user ON public.dialogue_lines(user_id);
CREATE TRIGGER trg_dialogue_lines_updated_at BEFORE UPDATE ON public.dialogue_lines
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. lip_sync_jobs
CREATE TABLE IF NOT EXISTS public.lip_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  dialogue_line_id uuid REFERENCES public.dialogue_lines(id) ON DELETE CASCADE,
  character_id uuid REFERENCES public.characters(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'mock',
  mode text NOT NULL DEFAULT 'mock', -- mock | production
  status text NOT NULL DEFAULT 'pending', -- pending | processing | complete | failed
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_url text,
  duration_sec numeric,
  error text,
  credits_charged integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lip_sync_jobs TO authenticated;
GRANT ALL ON public.lip_sync_jobs TO service_role;
ALTER TABLE public.lip_sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lip_sync_jobs owner all" ON public.lip_sync_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_lip_sync_jobs_project ON public.lip_sync_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_lip_sync_jobs_dialogue ON public.lip_sync_jobs(dialogue_line_id);
CREATE TRIGGER trg_lip_sync_jobs_updated_at BEFORE UPDATE ON public.lip_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 4. provider_status
CREATE TABLE IF NOT EXISTS public.provider_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL, -- lipsync | voice | face_detection
  provider text NOT NULL,
  available boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'mock',
  supported_languages text[] NOT NULL DEFAULT ARRAY[]::text[],
  max_duration_sec integer,
  notes text,
  last_checked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, provider)
);

GRANT SELECT ON public.provider_status TO authenticated;
GRANT ALL ON public.provider_status TO service_role;
ALTER TABLE public.provider_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "provider_status read all signed in" ON public.provider_status
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "provider_status admin write" ON public.provider_status
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER trg_provider_status_updated_at BEFORE UPDATE ON public.provider_status
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed the mock lip-sync provider so the UI has something to show.
INSERT INTO public.provider_status (kind, provider, available, mode, supported_languages, max_duration_sec, notes, last_checked_at)
VALUES
  ('lipsync', 'mock', true, 'mock', ARRAY['en','hi','te','ta','kn','ml','mr','bn'], 60, 'Development mock — labels output as Mock Preview. No real lip-sync.', now()),
  ('lipsync', 'sync_so', false, 'production', ARRAY['en','hi'], 60, 'Not configured. Add SYNC_API_KEY to enable.', now())
ON CONFLICT (kind, provider) DO NOTHING;

-- ---------------------------------------------------------------------
-- 20260720173942_17cc8a0e-a89d-4d5d-bff9-6f10c70e553d.sql
-- ---------------------------------------------------------------------
-- Post-Generation Studio: raw master + versioned narration/subtitles/exports.
-- Additive only; preserves legacy videos (no raw_master rows for older projects).

CREATE TABLE public.raw_video_outputs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NULL,
  blueprint_id TEXT NULL,
  video_url TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'webm',
  duration_sec NUMERIC NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  version INTEGER NOT NULL DEFAULT 1,
  scene_manifest JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.raw_video_outputs TO authenticated;
GRANT ALL ON public.raw_video_outputs TO service_role;
ALTER TABLE public.raw_video_outputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "raw_video_outputs owner all" ON public.raw_video_outputs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX raw_video_outputs_user_idx ON public.raw_video_outputs(user_id, created_at DESC);
CREATE INDEX raw_video_outputs_project_idx ON public.raw_video_outputs(project_id);

CREATE TABLE public.narration_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_video_id UUID NOT NULL REFERENCES public.raw_video_outputs(id) ON DELETE CASCADE,
  label TEXT NULL,
  voice_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'lovable-tts',
  language TEXT NULL,
  style TEXT NULL,
  speed NUMERIC NOT NULL DEFAULT 1,
  pitch NUMERIC NOT NULL DEFAULT 1,
  volume NUMERIC NOT NULL DEFAULT 1,
  script JSONB NOT NULL DEFAULT '[]'::jsonb,
  audio_url TEXT NULL,
  duration_sec NUMERIC NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.narration_versions TO authenticated;
GRANT ALL ON public.narration_versions TO service_role;
ALTER TABLE public.narration_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "narration_versions owner all" ON public.narration_versions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX narration_versions_raw_idx ON public.narration_versions(raw_video_id, created_at DESC);

CREATE TABLE public.subtitle_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_video_id UUID NOT NULL REFERENCES public.raw_video_outputs(id) ON DELETE CASCADE,
  label TEXT NULL,
  style_preset TEXT NOT NULL DEFAULT 'clean-minimal',
  style JSONB NOT NULL DEFAULT '{}'::jsonb,
  cues JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subtitle_versions TO authenticated;
GRANT ALL ON public.subtitle_versions TO service_role;
ALTER TABLE public.subtitle_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subtitle_versions owner all" ON public.subtitle_versions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX subtitle_versions_raw_idx ON public.subtitle_versions(raw_video_id, created_at DESC);

CREATE TABLE public.final_video_exports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_video_id UUID NOT NULL REFERENCES public.raw_video_outputs(id) ON DELETE CASCADE,
  narration_version_id UUID NULL REFERENCES public.narration_versions(id) ON DELETE SET NULL,
  subtitle_version_id UUID NULL REFERENCES public.subtitle_versions(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Export',
  music JSONB NULL,
  branding JSONB NULL,
  audio_mix JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolution TEXT NULL,
  format TEXT NOT NULL DEFAULT 'webm',
  video_url TEXT NULL,
  duration_sec NUMERIC NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  error TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.final_video_exports TO authenticated;
GRANT ALL ON public.final_video_exports TO service_role;
ALTER TABLE public.final_video_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "final_video_exports owner all" ON public.final_video_exports
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX final_video_exports_raw_idx ON public.final_video_exports(raw_video_id, created_at DESC);
CREATE INDEX final_video_exports_user_idx ON public.final_video_exports(user_id, created_at DESC);

CREATE TRIGGER raw_video_outputs_touch BEFORE UPDATE ON public.raw_video_outputs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER narration_versions_touch BEFORE UPDATE ON public.narration_versions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER subtitle_versions_touch BEFORE UPDATE ON public.subtitle_versions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER final_video_exports_touch BEFORE UPDATE ON public.final_video_exports
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- 20261117120000_model_studio_generations.sql
-- ---------------------------------------------------------------------
-- Model Studio: one row per third-party model run (Seedance, FLUX, ElevenLabs…).
-- Credits are reserved on submit and finalized/refunded when the job ends,
-- using the existing reserve_credits / finalize_credits / refund_credits_by_ledger RPCs.
CREATE TABLE IF NOT EXISTS public.model_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('video', 'image', 'audio')),
  prompt text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  credits integer NOT NULL CHECK (credits >= 0),
  provider_cost_usd numeric(10, 4) NOT NULL DEFAULT 0,
  ledger_id text,
  provider_request_id text,
  status_url text,
  response_url text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'completed', 'failed')),
  output_url text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS model_generations_user_created_idx
  ON public.model_generations (user_id, created_at DESC);

ALTER TABLE public.model_generations ENABLE ROW LEVEL SECURITY;

-- Users may read their own runs. All writes go through server functions
-- using the service role, so there are no insert/update/delete policies.
CREATE POLICY "model_generations_select_own"
  ON public.model_generations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER model_generations_set_updated_at
  BEFORE UPDATE ON public.model_generations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- FINAL: correct plan prices (USD)
-- The migrations above leave some plans at $0 on a fresh database (Creator
-- monthly and every lifetime plan), because a later migration updated plan
-- codes that no longer exist. These are the prices from the original seed
-- (price_usd). Yearly = 10x monthly, matching the "Save 17%" label on the
-- pricing page. Edit any of these later in Admin -> Pricing.
-- ---------------------------------------------------------------------
UPDATE public.pricing_plans SET price_monthly_usd = 0,  price_yearly_usd = 0,   price_lifetime_usd = 0   WHERE code = 'free';
UPDATE public.pricing_plans SET price_monthly_usd = 9,  price_yearly_usd = 90,  price_lifetime_usd = 0   WHERE code = 'starter';
UPDATE public.pricing_plans SET price_monthly_usd = 19, price_yearly_usd = 190, price_lifetime_usd = 0   WHERE code = 'creator';
UPDATE public.pricing_plans SET price_monthly_usd = 39, price_yearly_usd = 390, price_lifetime_usd = 0   WHERE code = 'pro';
UPDATE public.pricing_plans SET price_monthly_usd = 0,  price_yearly_usd = 0,   price_lifetime_usd = 0   WHERE code = 'team';
UPDATE public.pricing_plans SET price_monthly_usd = 0,  price_yearly_usd = 0,   price_lifetime_usd = 35  WHERE code = 'starter_life';
UPDATE public.pricing_plans SET price_monthly_usd = 0,  price_yearly_usd = 0,   price_lifetime_usd = 79  WHERE code = 'creator_life';
UPDATE public.pricing_plans SET price_monthly_usd = 0,  price_yearly_usd = 0,   price_lifetime_usd = 149 WHERE code = 'pro_life';

-- Plan credits (Nov 2026): sized so each plan stays profitable at full use.
UPDATE public.pricing_plans SET monthly_credits = 500,
  features = '["500 credits / month","All content types","Standard visual styles","Priority queue"]'::jsonb WHERE code = 'starter';
UPDATE public.pricing_plans SET monthly_credits = 1200,
  features = '["1,200 credits / month","Premium styles","Voice selection","Priority support"]'::jsonb WHERE code = 'creator';
UPDATE public.pricing_plans SET included_credits = 1500,
  features = '["Lifetime account","All core modules","1,500 included credits","Commercial usage","Basic templates","Standard AI generation","Manual publishing","Download unlimited outputs","Buy additional credit packs","No recurring payments"]'::jsonb WHERE code = 'starter_life';
UPDATE public.pricing_plans SET included_credits = 4000,
  features = '["Everything in Starter Lifetime","4,000 included credits","More templates","Higher usage limits","Larger storage"]'::jsonb WHERE code = 'creator_life';
UPDATE public.pricing_plans SET included_credits = 9000,
  features = '["Everything in Creator Lifetime","9,000 included credits","Priority rendering","Premium templates","Priority support"]'::jsonb WHERE code = 'pro_life';

-- ---------------------------------------------------------------------
-- Daily refill of monthly credits for yearly subscribers (needs pg_cron)
-- ---------------------------------------------------------------------
-- Monthly credit refill for yearly subscribers.
-- Yearly plans store a monthly credit limit; this resets the used counter on
-- the subscriber's monthly start day (clamped to month end, e.g. a sub started
-- on the 31st refills on Feb 28/29). Monthly plans refill when they pay again.
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS last_credit_refill_at timestamptz;

CREATE OR REPLACE FUNCTION public.refill_subscription_credits(_today date DEFAULT current_date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.subscriptions s
     SET monthly_credits_used = 0,
         last_credit_refill_at = now()
   WHERE s.status = 'active'
     AND s.plan_type = 'yearly'
     AND COALESCE(s.lifetime_access, false) = false
     AND (s.expires_at IS NULL OR s.expires_at > now())
     AND s.started_at::date < _today
     AND (s.last_credit_refill_at IS NULL OR s.last_credit_refill_at::date < _today)
     AND LEAST(
           EXTRACT(day FROM s.started_at)::int,
           EXTRACT(day FROM (date_trunc('month', _today) + interval '1 month - 1 day'))::int
         ) = EXTRACT(day FROM _today)::int;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.refill_subscription_credits(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refill_subscription_credits(date) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('refill-yearly-credits', '30 0 * * *', $cron$SELECT public.refill_subscription_credits()$cron$);

-- ---------------------------------------------------------------------
-- 20261117140000_social_publishing_worker.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 20261118120000_lifetime_monthly_bonus.sql
-- ---------------------------------------------------------------------
-- Lifetime plans: one-time credits + a small monthly bonus that does not roll over.
--   Starter Lifetime  1,500 one-time + 75 / month
--   Creator Lifetime  4,000 one-time + 150 / month
--   Pro Lifetime      9,000 one-time + 300 / month
-- The bonus lives in subscriptions.monthly_credit_limit (set from
-- pricing_plans.monthly_credits at purchase) and is spent before the one-time
-- credits. refill_subscription_credits() now resets it monthly for lifetime
-- buyers too, on their purchase day of the month.

UPDATE public.pricing_plans SET monthly_credits = 75,
  features = to_jsonb(ARRAY['Lifetime account','All core modules','1,500 included credits','+75 bonus credits every month','Commercial usage','Basic templates','Standard AI generation','Manual publishing','Download unlimited outputs','Buy additional credit packs','No recurring payments'])
  WHERE code = 'starter_life';
UPDATE public.pricing_plans SET monthly_credits = 150,
  features = to_jsonb(ARRAY['Everything in Starter Lifetime','4,000 included credits','+150 bonus credits every month','More templates','Higher usage limits','Larger storage'])
  WHERE code = 'creator_life';
UPDATE public.pricing_plans SET monthly_credits = 300,
  features = to_jsonb(ARRAY['Everything in Creator Lifetime','9,000 included credits','+300 bonus credits every month','Priority rendering','Premium templates','Priority support'])
  WHERE code = 'pro_life';

-- Existing lifetime buyers (if any) get the bonus too.
UPDATE public.subscriptions s
   SET monthly_credit_limit = p.monthly_credits
  FROM public.pricing_plans p
 WHERE s.plan_name = p.code
   AND s.plan_type = 'lifetime'
   AND s.status = 'active'
   AND p.monthly_credits > 0;

CREATE OR REPLACE FUNCTION public.refill_subscription_credits(_today date DEFAULT current_date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  -- Yearly plans and lifetime plans with a monthly bonus refill on the
  -- buyer's monthly start day (clamped to month end). Monthly plans refill
  -- when they pay again. Unused monthly credits do not carry over.
  UPDATE public.subscriptions s
     SET monthly_credits_used = 0,
         last_credit_refill_at = now()
   WHERE s.status = 'active'
     AND (
           (s.plan_type = 'yearly' AND COALESCE(s.lifetime_access, false) = false)
        OR (s.plan_type = 'lifetime' AND COALESCE(s.monthly_credit_limit, 0) > 0)
         )
     AND (s.expires_at IS NULL OR s.expires_at > now())
     AND s.started_at::date < _today
     AND (s.last_credit_refill_at IS NULL OR s.last_credit_refill_at::date < _today)
     AND LEAST(
           EXTRACT(day FROM s.started_at)::int,
           EXTRACT(day FROM (date_trunc('month', _today) + interval '1 month - 1 day'))::int
         ) = EXTRACT(day FROM _today)::int;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.refill_subscription_credits(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refill_subscription_credits(date) TO service_role;

-- ---------------------------------------------------------------------
-- 20261118140000_razorpay_autopay.sql
-- ---------------------------------------------------------------------
-- Razorpay Subscriptions (auto-debit) for monthly / yearly plans.
--
-- * subscriptions gains razorpay_subscription_id, auto_renew and payment_issue.
-- * razorpay_subscriptions tracks each checkout → Razorpay subscription.
-- * razorpay_plan_map caches the Razorpay plan ids (looked up by name, e.g.
--   "CreatorFlow Pro Monthly") per environment, with their INR amounts.
-- * refill_subscription_credits() also returns expired cancelled plans to Free.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id text,
  ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_issue text;
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_razorpay_subscription_id_key
  ON public.subscriptions (razorpay_subscription_id) WHERE razorpay_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.razorpay_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code text NOT NULL,
  cycle text NOT NULL CHECK (cycle IN ('monthly', 'yearly')),
  razorpay_subscription_id text NOT NULL UNIQUE,
  razorpay_plan_id text NOT NULL,
  amount_paise integer NOT NULL,
  status text NOT NULL DEFAULT 'created',
  current_end timestamptz,
  environment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rzp_subs_user ON public.razorpay_subscriptions (user_id, created_at DESC);
ALTER TABLE public.razorpay_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own razorpay subscriptions" ON public.razorpay_subscriptions;
CREATE POLICY "own razorpay subscriptions" ON public.razorpay_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.razorpay_plan_map (
  plan_code text NOT NULL,
  cycle text NOT NULL CHECK (cycle IN ('monthly', 'yearly')),
  environment text NOT NULL,
  razorpay_plan_id text NOT NULL,
  amount_paise integer NOT NULL,
  plan_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_code, cycle, environment)
);
ALTER TABLE public.razorpay_plan_map ENABLE ROW LEVEL SECURITY; -- service role only

CREATE OR REPLACE FUNCTION public.refill_subscription_credits(_today date DEFAULT current_date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  -- Paid plans that were cancelled and have run out go back to Free.
  UPDATE public.subscriptions
     SET plan_name = 'free', plan_type = 'free', monthly_credit_limit = 0, monthly_credits_used = 0,
         renews_at = NULL, expires_at = NULL, auto_renew = false, razorpay_subscription_id = NULL,
         started_at = now()
   WHERE status = 'active'
     AND plan_type IN ('monthly', 'yearly')
     AND COALESCE(unlimited_usage, false) = false
     AND expires_at IS NOT NULL
     AND expires_at < now();

  -- Yearly plans and lifetime plans with a monthly bonus refill on the
  -- buyer's monthly start day (clamped to month end). Monthly plans refill
  -- when they are charged again. Unused monthly credits do not carry over.
  UPDATE public.subscriptions s
     SET monthly_credits_used = 0,
         last_credit_refill_at = now()
   WHERE s.status = 'active'
     AND (
           (s.plan_type = 'yearly' AND COALESCE(s.lifetime_access, false) = false)
        OR (s.plan_type = 'lifetime' AND COALESCE(s.monthly_credit_limit, 0) > 0)
         )
     AND (s.expires_at IS NULL OR s.expires_at > now())
     AND s.started_at::date < _today
     AND (s.last_credit_refill_at IS NULL OR s.last_credit_refill_at::date < _today)
     AND LEAST(
           EXTRACT(day FROM s.started_at)::int,
           EXTRACT(day FROM (date_trunc('month', _today) + interval '1 month - 1 day'))::int
         ) = EXTRACT(day FROM _today)::int;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.refill_subscription_credits(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refill_subscription_credits(date) TO service_role;


-- ===== 20261118200000_agent_hq.sql =====
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


-- ===== 20261118230000_support_chat.sql =====
-- In-app support chat (bottom-right widget). One running thread per user.
-- The server writes every row with the service role; users can only read
-- their own thread.
CREATE TABLE IF NOT EXISTS public.support_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant','admin')),
  text text NOT NULL,
  category text,                         -- question | bug | billing | feature | chat
  page text,                             -- the app page the user was on
  task_id uuid REFERENCES public.agent_tasks(id) ON DELETE SET NULL,
  seen_by_user boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_chat_user_idx ON public.support_chat_messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_chat_created_idx ON public.support_chat_messages (created_at DESC);
ALTER TABLE public.support_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own support chat" ON public.support_chat_messages;
CREATE POLICY "own support chat" ON public.support_chat_messages FOR SELECT TO authenticated
  USING (user_id = auth.uid());


-- ===== 20261118240000_hq_dashboard.sql =====
-- HQ dashboard (hq.prodxstore.com): signup attribution + one admin-only
-- read function that returns every number the dashboard shows.
-- The dashboard holds no secret keys: it calls hq_metrics() with the signed-in
-- admin's session, and the function refuses everyone who isn't an admin.

-- Where each user came from (first touch), recorded once after sign-in.
CREATE TABLE IF NOT EXISTS public.signup_attribution (
  user_id uuid PRIMARY KEY,
  source text,            -- instagram | youtube | facebook | google | meta_ads | referral | direct | <utm_source>
  medium text,
  campaign text,
  referrer text,
  landing_path text,
  country text,
  region text,
  city text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.signup_attribution ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS analytics_events_event_idx ON public.analytics_events (event, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.hq_metrics(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _days int := LEAST(GREATEST(COALESCE(p_days, 30), 7), 365);
  _tz text := 'Asia/Kolkata';
  _today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  _from date := _today - (_days - 1);
  _fx numeric;
  _cost_per_credit_usd numeric := 0.0054;   -- provider cost of one credit
  _result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin only' USING ERRCODE = '42501';
  END IF;

  SELECT rate INTO _fx FROM fx_rates WHERE base_currency = 'USD' AND quote_currency = 'INR' ORDER BY fetched_at DESC LIMIT 1;
  _fx := COALESCE(_fx, 85);

  WITH
  pay AS (
    SELECT p.user_id, p.created_at, (p.created_at AT TIME ZONE _tz)::date AS d,
      COALESCE(p.amount_inr_paise, CASE WHEN upper(p.currency) = 'INR' THEN p.amount_cents END,
               round(p.amount_cents * _fx))::numeric / 100 AS inr,
      p.status, p.pack_id
    FROM payments p
  ),
  paid AS (SELECT * FROM pay WHERE status IN ('success', 'captured', 'paid')),
  led AS (
    SELECT l.user_id, l.action, l.status, l.source, l.created_at, (l.created_at AT TIME ZONE _tz)::date AS d,
      extract(hour FROM l.created_at AT TIME ZONE _tz)::int AS h,
      COALESCE(l.credits_charged, 0) AS charged,
      COALESCE(l.credits_refunded, 0) AS refunded,
      CASE WHEN l.status = 'charged' THEN GREATEST(COALESCE(l.credits_charged, 0), COALESCE(l.credits_estimated, 0)) ELSE 0 END AS consumed
    FROM credit_ledger l
  ),
  days AS (SELECT generate_series(_from, _today, interval '1 day')::date AS d),
  daily AS (
    SELECT dd.d,
      (SELECT count(*) FROM profiles pr WHERE (pr.created_at AT TIME ZONE _tz)::date = dd.d) AS signups,
      (SELECT COALESCE(sum(inr), 0) FROM paid WHERE paid.d = dd.d) AS revenue,
      (SELECT count(*) FROM led WHERE led.d = dd.d AND led.status = 'charged') AS generations,
      (SELECT COALESCE(sum(consumed), 0) FROM led WHERE led.d = dd.d) AS credits
    FROM days dd
  ),
  day_kpi AS (
    SELECT x.label, x.d,
      (SELECT count(*) FROM profiles pr WHERE (pr.created_at AT TIME ZONE _tz)::date = x.d) AS signups,
      (SELECT COALESCE(sum(inr), 0) FROM paid WHERE paid.d = x.d) AS revenue,
      (SELECT count(*) FROM led WHERE led.d = x.d AND led.status = 'charged') AS generations,
      (SELECT count(*) FROM paid WHERE paid.d = x.d) AS payments
    FROM (VALUES ('today', _today), ('yesterday', _today - 1), ('last_week', _today - 7), ('last_week_yesterday', _today - 8)) AS x(label, d)
  ),
  paid_by_user AS (SELECT user_id, sum(inr) AS total, max(created_at) AS last_paid FROM paid GROUP BY user_id),
  last_active AS (SELECT user_id, max(created_at) AS at FROM credit_ledger GROUP BY user_id),
  features AS (
    SELECT action,
      count(*) FILTER (WHERE status = 'charged') AS runs,
      count(*) FILTER (WHERE status IN ('failed', 'refunded')) AS failures,
      sum(charged) AS credits_charged,
      sum(consumed) AS credits_consumed,
      sum(refunded) AS credits_refunded
    -- Customers only: your own (admin) test runs would distort the unit economics.
    FROM led WHERE d >= _from AND COALESCE(source, '') <> 'admin' GROUP BY action
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'days', _days,
    'fx_usd_inr', _fx,
    'cost_per_credit_inr', round(_cost_per_credit_usd * _fx, 4),

    'kpis', (SELECT jsonb_object_agg(label, jsonb_build_object('date', d, 'signups', signups, 'revenue', revenue, 'generations', generations, 'payments', payments)) FROM day_kpi),

    'totals', jsonb_build_object(
      'users', (SELECT count(*) FROM profiles),
      'paying_users', (SELECT count(*) FROM paid_by_user),
      'revenue_all_time', (SELECT COALESCE(sum(inr), 0) FROM paid),
      'revenue_range', (SELECT COALESCE(sum(inr), 0) FROM paid WHERE d >= _from),
      'ai_cost_range', (SELECT round(COALESCE(sum(consumed), 0) * _cost_per_credit_usd * _fx, 2) FROM led WHERE d >= _from),
      'credits_range', (SELECT COALESCE(sum(consumed), 0) FROM led WHERE d >= _from),
      'admin_ai_cost_range', (SELECT round(COALESCE(sum(consumed), 0) * _cost_per_credit_usd * _fx, 2) FROM led WHERE d >= _from AND source = 'admin'),
      'active_subscriptions', (SELECT count(*) FROM subscriptions WHERE status = 'active' AND COALESCE(plan_type, 'free') <> 'free'),
      'mtd_revenue', (SELECT COALESCE(sum(inr), 0) FROM paid WHERE d >= date_trunc('month', _today)::date),
      'mtd_ai_cost', (SELECT round(COALESCE(sum(consumed), 0) * _cost_per_credit_usd * _fx, 2) FROM led WHERE d >= date_trunc('month', _today)::date),
      'day_of_month', extract(day FROM _today)::int,
      'days_in_month', extract(day FROM (date_trunc('month', _today) + interval '1 month - 1 day'))::int
    ),

    'daily', (SELECT jsonb_agg(jsonb_build_object(
        'date', d, 'signups', signups, 'revenue', revenue, 'generations', generations,
        'ai_cost', round(credits * _cost_per_credit_usd * _fx, 2)) ORDER BY d) FROM daily),

    'features', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'action', action, 'runs', runs, 'failures', failures,
        'credits_charged', credits_charged, 'credits_consumed', credits_consumed, 'credits_refunded', credits_refunded,
        -- What users paid for those credits, at the average credit-pack list price.
        'revenue_inr', round(credits_charged * COALESCE((SELECT avg(pk.price_usd / NULLIF(pk.credits, 0)) * _fx
              FROM credit_packs pk WHERE pk.active), 0), 2),
        'cost_inr', round(credits_consumed * _cost_per_credit_usd * _fx, 2)
      ) ORDER BY credits_consumed DESC), '[]'::jsonb) FROM features),

    -- People most likely to buy now: active in the last 14 days and low on credits.
    'hot_leads', (SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.credits ASC), '[]'::jsonb) FROM (
        SELECT pr.email, COALESCE(pr.plan, 'free') AS plan, COALESCE(pr.user_credits, 0) AS credits,
          la.at AS last_active, COALESCE(pb.total, 0) AS paid_total,
          CASE WHEN pb.user_id IS NULL THEN 'free user almost out' ELSE 'paid user running low' END AS reason
        FROM profiles pr
        JOIN last_active la ON la.user_id = pr.id
        LEFT JOIN paid_by_user pb ON pb.user_id = pr.id
        WHERE NOT COALESCE(pr.is_admin, false)
          AND la.at > now() - interval '14 days'
          AND COALESCE(pr.user_credits, 0) <= CASE WHEN pb.user_id IS NULL THEN 15 ELSE 50 END
        ORDER BY COALESCE(pr.user_credits, 0) ASC LIMIT 25) t),

    'churn_risk', (SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) FROM (
        SELECT pr.email, s.plan_name, s.status, s.renews_at, s.expires_at, s.auto_renew, s.payment_issue,
          CASE WHEN COALESCE(s.payment_issue, '') <> '' THEN 'payment problem'
               WHEN s.auto_renew = false THEN 'auto-renew off'
               ELSE 'renews within 7 days' END AS reason
        FROM subscriptions s JOIN profiles pr ON pr.id = s.user_id
        WHERE COALESCE(s.plan_type, 'free') <> 'free' AND NOT COALESCE(pr.is_admin, false)
          AND (COALESCE(s.payment_issue, '') <> ''
               OR (s.status = 'active' AND s.auto_renew = false)
               OR (s.status = 'active' AND COALESCE(s.renews_at, s.expires_at) BETWEEN now() AND now() + interval '7 days'))
        ORDER BY COALESCE(s.renews_at, s.expires_at) NULLS LAST LIMIT 25) t),

    -- Failed or refunded generations, last 14 days, by feature × hour (IST).
    'failures', (SELECT COALESCE(jsonb_agg(jsonb_build_object('action', action, 'hour', h, 'count', c)), '[]'::jsonb) FROM (
        SELECT action, h, count(*) AS c FROM led
        WHERE status IN ('failed', 'refunded') AND created_at > now() - interval '14 days'
        GROUP BY action, h) t),
    'failure_errors', (SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) FROM (
        SELECT action, left(COALESCE(error, 'unknown'), 120) AS error, count(*) AS c, max(created_at) AS last_at
        FROM credit_ledger WHERE status IN ('failed', 'refunded') AND created_at > now() - interval '14 days'
        GROUP BY 1, 2 ORDER BY c DESC LIMIT 8) t),

    'payments_health', jsonb_build_object(
      'success', (SELECT count(*) FROM pay WHERE d >= _from AND status IN ('success', 'captured', 'paid')),
      'pending', (SELECT count(*) FROM pay WHERE d >= _from AND status IN ('pending', 'created')),
      'failed', (SELECT count(*) FROM pay WHERE d >= _from AND status IN ('failed', 'cancelled')),
      'stuck', (SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) FROM (
          SELECT pr.email, p.pack_id, p.inr, p.created_at FROM pay p LEFT JOIN profiles pr ON pr.id = p.user_id
          WHERE p.status IN ('pending', 'created') AND p.created_at < now() - interval '1 hour' AND p.created_at > now() - interval '7 days'
          ORDER BY p.created_at DESC LIMIT 10) t),
      'webhook_total', (SELECT count(*) FROM razorpay_webhook_events WHERE created_at > now() - make_interval(days => _days)),
      'webhook_errors', (SELECT count(*) FROM razorpay_webhook_events WHERE created_at > now() - make_interval(days => _days)
          AND (COALESCE(http_status, 200) >= 400 OR signature_verified = false)),
      'webhook_recent_errors', (SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) FROM (
          SELECT event_type, http_status, left(COALESCE(error_message, ''), 120) AS error, created_at
          FROM razorpay_webhook_events WHERE created_at > now() - make_interval(days => _days)
            AND (COALESCE(http_status, 200) >= 400 OR signature_verified = false)
          ORDER BY created_at DESC LIMIT 5) t)
    ),

    'support', jsonb_build_object(
      'telegram', (SELECT COALESCE(jsonb_object_agg(k, c), '{}'::jsonb) FROM (
          SELECT COALESCE(category, 'pending') AS k, count(*) AS c FROM telegram_messages
          WHERE created_at > now() - make_interval(days => _days) GROUP BY 1) t),
      'in_app', (SELECT COALESCE(jsonb_object_agg(k, c), '{}'::jsonb) FROM (
          SELECT COALESCE(category, 'pending') AS k, count(*) AS c FROM support_chat_messages
          WHERE role = 'user' AND created_at > now() - make_interval(days => _days) GROUP BY 1) t),
      'answered_by_agent', (SELECT count(*) FROM telegram_messages WHERE handled_by = 'agent' AND created_at > now() - make_interval(days => _days))
        + (SELECT count(*) FROM support_chat_messages m WHERE m.role = 'assistant' AND m.task_id IS NULL AND COALESCE(m.category, '') <> 'chat'
             AND m.created_at > now() - make_interval(days => _days)),
      'sent_to_admin', (SELECT count(*) FROM agent_tasks WHERE agent = 'support' AND source IN ('telegram', 'in_app')
          AND created_at > now() - make_interval(days => _days) AND (status = 'waiting_approval' OR draft_reply IS NOT NULL)),
      'waiting_now', (SELECT count(*) FROM agent_tasks WHERE status = 'waiting_approval'),
      'open_bugs', (SELECT count(*) FROM agent_tasks WHERE kind = 'bug' AND status IN ('todo', 'in_progress')),
      'agent_cost_usd_month', (SELECT round(COALESCE(sum(cost_usd), 0), 3) FROM agent_runs WHERE created_at >= date_trunc('month', now())),
      'top_questions', (SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) FROM (
          SELECT text, created_at, 'telegram' AS channel FROM telegram_messages
            WHERE category IN ('question', 'bug', 'billing', 'feature') AND created_at > now() - interval '7 days'
          UNION ALL
          SELECT text, created_at, 'in-app' FROM support_chat_messages
            WHERE role = 'user' AND COALESCE(category, '') <> 'chat' AND created_at > now() - interval '7 days'
          ORDER BY created_at DESC LIMIT 8) t)
    ),

    -- Funnel since tracking started (all users).
    'funnel', jsonb_build_object(
      'signed_up', (SELECT count(*) FROM profiles WHERE NOT COALESCE(is_admin, false)),
      'first_generation', (SELECT count(DISTINCT l.user_id) FROM credit_ledger l JOIN profiles pr ON pr.id = l.user_id WHERE NOT COALESCE(pr.is_admin, false)),
      'ran_out', (SELECT count(*) FROM profiles pr WHERE NOT COALESCE(pr.is_admin, false) AND (
          COALESCE(pr.user_credits, 0) <= 0
          OR EXISTS (SELECT 1 FROM analytics_events e WHERE e.user_id = pr.id AND e.event = 'credits_exhausted'))),
      'opened_pricing', (SELECT count(DISTINCT e.user_id) FROM analytics_events e JOIN profiles pr ON pr.id = e.user_id
          WHERE e.event = 'pricing_view' AND NOT COALESCE(pr.is_admin, false)),
      'paid', (SELECT count(*) FROM paid_by_user pb JOIN profiles pr ON pr.id = pb.user_id WHERE NOT COALESCE(pr.is_admin, false)),
      'tracking_since', (SELECT min(created_at) FROM signup_attribution)
    ),

    'sources', (SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.signups DESC), '[]'::jsonb) FROM (
        SELECT COALESCE(sa.source, 'unknown') AS source, count(*) AS signups,
          count(pb.user_id) AS paying, COALESCE(sum(pb.total), 0) AS revenue
        FROM signup_attribution sa LEFT JOIN paid_by_user pb ON pb.user_id = sa.user_id
        GROUP BY 1) t)
  ) INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.hq_metrics(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hq_metrics(integer) TO authenticated;
