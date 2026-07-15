
REVOKE EXECUTE ON FUNCTION public.reserve_credits(UUID, INTEGER, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_credits(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_credits_by_ledger(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_credit_summary(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_credits(UUID, INTEGER, TEXT, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_credits(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits_by_ledger(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_credit_summary(UUID) TO service_role;
