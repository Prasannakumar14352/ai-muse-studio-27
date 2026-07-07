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