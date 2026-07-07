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
