
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
