
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
