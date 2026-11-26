import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Function middleware: the caller must be signed in (requireSupabaseAuth runs first and throws
 * "Unauthorized: …") and have the 'admin' role in user_roles, checked with has_role() through the
 * service role, so it doesn't depend on the has_role EXECUTE grant to `authenticated`.
 *
 * Never profiles.is_admin, never ADMIN_EMAIL, never anything from the request body.
 * Adds `adminId` to the context; handlers use it as the actor.
 */
export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error) throw new Error("Admin check failed");
    if (data !== true) throw new Error("Forbidden: admin only");
    return next({ context: { adminId: context.userId } });
  });
