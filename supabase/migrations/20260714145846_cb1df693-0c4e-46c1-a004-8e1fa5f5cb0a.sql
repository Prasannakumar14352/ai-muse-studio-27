
REVOKE EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.refund_credits(uuid, integer, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits(uuid, integer, uuid, text, text) TO authenticated, service_role;
