import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/lib/access";
import { getUsdInrRate, setUsdInrRate } from "@/lib/razorpay.functions";
import { ArrowLeft, Coins, Loader2, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/currency")({
  component: CurrencyAdmin,
});

type Setting = { rate: number; updatedAt: string | null; source: "db" | "default" };

function CurrencyAdmin() {
  const { data: access, isLoading } = useAccess();
  const getRate = useServerFn(getUsdInrRate);
  const saveRate = useServerFn(setUsdInrRate);
  const qc = useQueryClient();

  const { data, refetch, isFetching } = useQuery<Setting>({
    queryKey: ["usd-inr-rate"],
    queryFn: () => getRate() as Promise<Setting>,
    enabled: !!access?.isAdmin,
  });

  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.rate && !draft) setDraft(String(data.rate));
  }, [data?.rate, draft]);

  if (isLoading) return <div className="glass rounded-2xl h-64 animate-pulse" />;
  if (!access?.isAdmin) return <Navigate to="/dashboard" />;

  async function handleSave() {
    const r = Number(draft);
    if (!Number.isFinite(r) || r <= 0) {
      toast.error("Enter a positive number");
      return;
    }
    setSaving(true);
    try {
      await saveRate({ data: { rate: r } });
      toast.success(`USD → INR rate saved: ₹${r.toFixed(2)}`);
      await qc.invalidateQueries({ queryKey: ["usd-inr-rate"] });
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const preview = Number(draft);
  const validPreview = Number.isFinite(preview) && preview > 0;
  const samples = [5, 12, 15, 29, 79, 149];

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <Link to="/admin" className="text-xs glass rounded-lg px-3 py-2 hover:bg-white/10 inline-flex items-center gap-1.5">
          <ArrowLeft className="w-3.5 h-3.5" /> Admin
        </Link>
      </div>

      <div className="glass rounded-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <Coins className="w-5 h-5 text-[color:var(--brand-orange)]" /> Currency & exchange rate
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Public pricing stays in USD. Razorpay checkout is always billed in INR — converted using this rate.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="text-xs glass rounded-lg px-3 py-2 hover:bg-white/10 inline-flex items-center gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div className="glass rounded-xl p-4">
            <div className="text-xs text-muted-foreground">Current rate</div>
            <div className="text-2xl font-bold gradient-text mt-1">
              ₹{data?.rate?.toFixed(2) ?? "—"}
            </div>
            <div className="text-[11px] text-muted-foreground">per 1 USD</div>
          </div>
          <div className="glass rounded-xl p-4">
            <div className="text-xs text-muted-foreground">Source</div>
            <div className="text-sm font-semibold mt-1">
              {data?.source === "db" ? "Admin setting" : "Fallback default"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {data?.source === "default" && "No override saved yet"}
            </div>
          </div>
          <div className="glass rounded-xl p-4">
            <div className="text-xs text-muted-foreground">Last updated</div>
            <div className="text-sm font-semibold mt-1">
              {data?.updatedAt ? new Date(data.updatedAt).toLocaleString() : "—"}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Manual override (1 USD = ₹?)</label>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 rounded-lg glass px-3 py-2 text-sm bg-black/20 border border-border/40"
              placeholder="e.g. 88.50"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-60">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save rate
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Applies to every new Razorpay order. Existing payments keep the rate they were charged at.
          </p>
        </div>

        {validPreview && (
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Converted price preview</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              {samples.map((usd) => (
                <div key={usd} className="glass rounded-lg px-3 py-2 flex items-center justify-between">
                  <span className="text-muted-foreground">${usd}</span>
                  <span className="font-semibold">₹{Math.round(usd * preview).toLocaleString("en-IN")}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
