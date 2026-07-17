
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
