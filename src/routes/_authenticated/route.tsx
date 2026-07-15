import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { GlobalCreditGate } from "@/components/global-credit-gate";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Wait for Supabase to finish parsing OAuth tokens from the URL
    // (INITIAL_SESSION fires once auth is fully initialized).
    const session = await new Promise<import("@supabase/supabase-js").Session | null>((resolve) => {
      let settled = false;
      const done = (s: import("@supabase/supabase-js").Session | null) => {
        if (settled) return;
        settled = true;
        sub.data.subscription.unsubscribe();
        resolve(s);
      };
      const sub = supabase.auth.onAuthStateChange((event, s) => {
        if (event === "INITIAL_SESSION" || s) done(s);
      });
      // Safety: if getSession already has a value, resolve immediately.
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) done(data.session);
      });
      // Hard timeout so we don't hang forever.
      setTimeout(() => done(null), 3000);
    });

    if (!session?.user) {
      const next = `${location.pathname}${location.searchStr || ""}${location.hash || ""}`;
      throw redirect({ to: "/auth", search: { next } });
    }
    return { user: session.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
