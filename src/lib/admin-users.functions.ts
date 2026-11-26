// Admin → Users actions. These used to write profiles / user_roles /
// subscriptions straight from the browser; since 2026-11-26 (audit C1/C2)
// users can't write credits, admin flags or subscriptions, so the admin panel
// goes through these server functions, which check user_roles and use the
// service role.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { userId: string };

async function adminDb(context: Ctx) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (isAdmin !== true) throw new Error("Forbidden: admin only");
  return supabaseAdmin;
}

/** Add credits to a user's top-up balance (profiles.user_credits). */
export const adminAddCreditsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), amount: z.number().int().min(1).max(1_000_000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await adminDb(context as unknown as Ctx);
    // Same read-then-write the panel did before (see audit H8 for making grants atomic).
    const { data: cur, error: readErr } = await db.from("profiles").select("user_credits").eq("id", data.userId).maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!cur) throw new Error("User not found");
    const next = (cur.user_credits ?? 0) + data.amount;
    const { error } = await db.from("profiles").update({ user_credits: next }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    console.info(`[admin] ${(context as unknown as Ctx).userId} added ${data.amount} credits to ${data.userId}`);
    return { ok: true, balance: next };
  });

/** Grant or remove the admin role (user_roles is the source of truth; profiles mirrors it for display). */
export const adminSetAdminRoleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid(), makeAdmin: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await adminDb(context as unknown as Ctx);
    const { error: pErr } = await db.from("profiles")
      .update({ is_admin: data.makeAdmin, role: data.makeAdmin ? "admin" : "user" })
      .eq("id", data.userId);
    if (pErr) throw new Error(pErr.message);
    if (data.makeAdmin) {
      const { error } = await db.from("user_roles")
        .upsert({ user_id: data.userId, role: "admin" }, { onConflict: "user_id,role", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("user_roles").delete().eq("user_id", data.userId).eq("role", "admin");
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/** Cancel a user's active subscription. */
export const adminCancelSubscriptionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await adminDb(context as unknown as Ctx);
    const { error } = await db.from("subscriptions")
      .update({ status: "cancelled" })
      .eq("user_id", data.userId)
      .eq("status", "active");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
