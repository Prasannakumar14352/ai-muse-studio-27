// Admin → Plan Access: choose the minimum plan for each locked page and
// Model Studio model. Saved to app_settings ("plan_access"); both the
// sidebar locks and the server checks read it, so changes apply right away.
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Lock, RotateCcw, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/lib/access";
import { usePlanOverrides } from "@/lib/use-plan-access";
import {
  FEATURES,
  PLAN_ACCESS_SETTINGS_KEY,
  TIERS,
  TIER_LABEL,
  type Tier,
  type TierOverrides,
} from "@/lib/plan-access";

export const Route = createFileRoute("/_authenticated/admin/plan-access")({
  component: PlanAccessAdmin,
});

function PlanAccessAdmin() {
  const { data: access, isLoading } = useAccess();
  const { data: saved } = usePlanOverrides();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<TierOverrides>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (saved) setDraft(saved);
  }, [saved]);

  if (isLoading) return null;
  if (!access?.isAdmin) return <Navigate to="/dashboard" />;

  const tierOf = (id: string, fallback: Tier) => draft[id] ?? fallback;

  async function save() {
    setSaving(true);
    // Store only values that differ from the defaults.
    const features: TierOverrides = {};
    for (const f of FEATURES) {
      const t = draft[f.id];
      if (t && t !== f.defaultTier) features[f.id] = t;
    }
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: PLAN_ACCESS_SETTINGS_KEY, value: { features } }, { onConflict: "key" });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Plan access saved");
    qc.invalidateQueries({ queryKey: ["plan-access-overrides"] });
  }

  const groups: Array<{ title: string; group: "page" | "model" }> = [
    { title: "Pages", group: "page" },
    { title: "Model Studio models", group: "model" },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-2">
            <Lock className="h-6 w-6 text-primary" /> Plan Access
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Choose the lowest plan that unlocks each feature. Yearly and lifetime plans unlock the
            same as their monthly tier. Pages not listed here (Dashboard, Captions, Images,
            Carousels, LinkedIn, Templates, Media Library, Model Studio images) are open to
            everyone.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setDraft({})}
            className="rounded-lg glass border border-border px-3 py-2 text-sm inline-flex items-center gap-2"
          >
            <RotateCcw className="h-4 w-4" /> Defaults
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium inline-flex items-center gap-2 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{" "}
            Save
          </button>
        </div>
      </div>

      {groups.map(({ title, group }) => (
        <section key={group} className="glass rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
            {title}
          </div>
          {FEATURES.filter((f) => f.group === group).map((f) => {
            const current = tierOf(f.id, f.defaultTier);
            return (
              <div
                key={f.id}
                className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border/50 last:border-0"
              >
                <div>
                  <div className="text-sm font-medium">
                    {f.label.replace("Model Studio · ", "")}
                  </div>
                  {current !== f.defaultTier && (
                    <div className="text-xs text-muted-foreground">
                      Default: {TIER_LABEL[f.defaultTier]}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  {TIERS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setDraft((d) => ({ ...d, [f.id]: t }))}
                      className={`px-3 py-1.5 rounded-full text-xs border ${current === t ? "gradient-primary text-white border-transparent" : "glass border-border"}`}
                    >
                      {TIER_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
