// Browser-side plan access: the user's tier, admin overrides, lock checks,
// and the shared upgrade dialog / upgrade screen.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Lock, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccess, type AccessInfo } from "@/lib/access";
import {
  PLAN_ACCESS_SETTINGS_KEY,
  TIER_LABEL,
  checkFeature,
  checkPath,
  parseOverrides,
  tierForPlan,
  type AccessCheck,
  type Tier,
  type TierOverrides,
} from "@/lib/plan-access";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function userTier(a: AccessInfo | null | undefined): Tier {
  if (!a) return "free";
  if (a.expiresAt && new Date(a.expiresAt).getTime() < Date.now()) return "free";
  return tierForPlan(a.plan);
}

export function usePlanOverrides() {
  return useQuery({
    queryKey: ["plan-access-overrides"],
    staleTime: 60_000,
    queryFn: async (): Promise<TierOverrides> => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", PLAN_ACCESS_SETTINGS_KEY)
        .maybeSingle();
      return parseOverrides((data as { value?: unknown } | null)?.value);
    },
  });
}

export function usePlanAccess() {
  const { data: access, isLoading: accessLoading } = useAccess();
  const { data: overrides, isLoading: overridesLoading } = usePlanOverrides();
  const tier = userTier(access);
  const isAdmin = !!access?.isAdmin;
  const ov = useMemo(() => overrides ?? {}, [overrides]);
  // While loading, report everything as allowed so pages don't flash a lock.
  const loading = accessLoading || overridesLoading;
  const canPath = useCallback(
    (path: string): AccessCheck =>
      loading ? { allowed: true } : checkPath(path, tier, isAdmin, ov),
    [loading, tier, isAdmin, ov],
  );
  const canFeature = useCallback(
    (id: string): AccessCheck =>
      loading ? { allowed: true } : checkFeature(id, tier, isAdmin, ov),
    [loading, tier, isAdmin, ov],
  );
  return { tier, isAdmin, loading, canPath, canFeature };
}

// ── Upgrade dialog (opened from locked sidebar items / locked models) ──

type UpgradeTarget = { label: string; required: Tier } | null;
const UpgradeCtx = createContext<(t: UpgradeTarget) => void>(() => {});

export function UpgradeDialogProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<UpgradeTarget>(null);
  return (
    <UpgradeCtx.Provider value={setTarget}>
      {children}
      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" /> {target?.label} is locked
            </DialogTitle>
            <DialogDescription>
              Available on the {target ? TIER_LABEL[target.required] : ""} plan and above (monthly,
              yearly or lifetime).
            </DialogDescription>
          </DialogHeader>
          <UpgradeActions onNavigate={() => setTarget(null)} required={target?.required} />
        </DialogContent>
      </Dialog>
    </UpgradeCtx.Provider>
  );
}

export function useUpgradeDialog() {
  return useContext(UpgradeCtx);
}

function UpgradeActions({ onNavigate, required }: { onNavigate?: () => void; required?: Tier }) {
  return (
    <div className="flex flex-wrap gap-2 pt-2">
      <Link
        to="/pricing"
        onClick={onNavigate}
        className="rounded-lg gradient-primary text-white px-5 py-2.5 text-sm font-medium inline-flex items-center gap-2"
      >
        <Sparkles className="h-4 w-4" /> Upgrade{required ? ` to ${TIER_LABEL[required]}` : ""}
      </Link>
      <Link
        to="/dashboard"
        onClick={onNavigate}
        className="rounded-lg glass border border-border px-5 py-2.5 text-sm"
      >
        Back to dashboard
      </Link>
    </div>
  );
}

/** Full-page screen shown instead of a locked page (e.g. opened by URL). */
export function UpgradeScreen({ label, required }: { label: string; required: Tier }) {
  return (
    <div className="max-w-lg mx-auto mt-16 glass rounded-2xl border border-border p-10 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl gradient-primary flex items-center justify-center">
        <Lock className="h-6 w-6 text-white" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold">{label} is locked</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Upgrade to the <span className="font-medium text-foreground">{TIER_LABEL[required]}</span>{" "}
        plan or above (monthly, yearly or lifetime) to use this.
      </p>
      <div className="mt-6 flex justify-center">
        <UpgradeActions required={required} />
      </div>
    </div>
  );
}

/** Renders children, or the upgrade screen when the current path is locked. */
export function PlanGate({ pathname, children }: { pathname: string; children: ReactNode }) {
  const { canPath } = usePlanAccess();
  const check = useMemo(() => canPath(pathname), [canPath, pathname]);
  if (!check.allowed)
    return <UpgradeScreen label={check.feature.label} required={check.required} />;
  return <>{children}</>;
}
