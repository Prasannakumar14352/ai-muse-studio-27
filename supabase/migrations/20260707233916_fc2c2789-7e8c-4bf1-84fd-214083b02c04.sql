REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deduct_credits(uuid, integer, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_monthly_subscription_credits() FROM PUBLIC, anon, authenticated;

-- Keep role-check helpers available to signed-in users because existing access rules call them.
-- The helpers only evaluate the current signed-in user when used by those policies.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;