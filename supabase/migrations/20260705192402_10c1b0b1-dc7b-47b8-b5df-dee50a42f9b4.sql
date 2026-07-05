
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
