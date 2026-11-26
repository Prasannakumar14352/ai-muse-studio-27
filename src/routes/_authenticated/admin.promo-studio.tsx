import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { getPromoAdminGate } from "@/lib/promo-studio.functions";

export const Route = createFileRoute("/_authenticated/admin/promo-studio")({
  head: () => ({ meta: [{ title: "Promo Studio — CreatorFlow AI" }] }),
  beforeLoad: async () => {
    const { isAdmin } = await getPromoAdminGate();
    if (!isAdmin) throw redirect({ to: "/dashboard", replace: true });
  },
  component: lazyRouteComponent(() => import("@/components/promo-studio/PromoStudioPage")),
});
