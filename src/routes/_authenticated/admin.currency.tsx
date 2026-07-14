import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAccess } from "@/lib/access";
import {
  getExchangeRateAdmin,
  refreshExchangeRate,
  setManualFallbackRate,
  setManualOverride,
} from "@/lib/fx-rate.functions";
import { ArrowLeft, Coins, Loader2, RefreshCw, Wifi, Database as DbIcon, ShieldAlert, PenLine } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/currency")({
  component: CurrencyAdmin,
});

const SOURCE_LABEL: Record<string, { label: string; icon: React.ReactNode; tone: string }> = {
  live: { label: "Live (API)", icon: <Wifi className="w-3.5 h-3.5" />, tone: "text-emerald-300" },
  cached: { label: "Cached", icon: <DbIcon className="w-3.5 h-3.5" />, tone: "text-sky-300" },
  stale_cache: { label: "Stale cache", icon: <DbIcon className="w-3.5 h-3.5" />, tone: "text-amber-300" },
  manual: { label: "Manual fallback", icon: <PenLine className="w-3.5 h-3.5" />, tone: "text-purple-300" },
  error: { label: "Error", icon: <ShieldAlert className="w-3.5 h-3.5" />, tone: "text-rose-300" },
};

function CurrencyAdmin() {
  const { data: access, isLoading } = useAccess();
  const getAdmin = useServerFn(getExchangeRateAdmin);
  const refresh = useServerFn(refreshExchangeRate);
  const saveFallback = useServerFn(setManualFallbackRate);
  const saveOverride = useServerFn(setManualOverride);
  const qc = useQueryClient();

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["fx-admin"],
    queryFn: () => getAdmin(),
    enabled: !!access?.isAdmin,
  });

  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (data?.manualFallback && !draft) setDraft(String(data.manualFallback));
  }, [data?.manualFallback, draft]);

  if (isLoading) return <div className="glass rounded-2xl h-64 animate-pulse" />;
  if (!access?.isAdmin) return <Navigate to="/dashboard" />;

  async function handleSaveFallback() {
    const r = Number(draft);
    if (!Number.isFinite(r) || r <= 0) { toast.error("Enter a positive number"); return; }
    setSaving(true);
    try {
      await saveFallback({ data: { rate: r } });
      toast.success(`Manual fallback saved: ₹${r.toFixed(2)}`);
      await qc.invalidateQueries({ queryKey: ["fx-admin"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  async function handleForceRefresh() {
    setRefreshing(true);
    try {
      const r = await refresh();
      toast.success(`Refreshed from ${r.provider ?? "provider"} · ₹${r.rate.toFixed(2)}`);
      await qc.invalidateQueries({ queryKey: ["fx-admin"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed");
    } finally { setRefreshing(false); }
  }

  async function handleToggleOverride(next: boolean) {
    try {
      await saveOverride({ data: { enabled: next } });
      toast.success(next ? "Manual override ON" : "Manual override OFF");
      await qc.invalidateQueries({ queryKey: ["fx-admin"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  const resolved = data?.resolved;
  const src = resolved?.source ?? "manual";
  const badge = SOURCE_LABEL[src] ?? SOURCE_LABEL.manual;
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
              <Coins className="w-5 h-5 text-[color:var(--brand-orange)]" /> USD → INR exchange rate
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live rate fetched every 6 hours. Razorpay always charges in INR — this rate converts USD listings to INR paise.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => refetch()}
              className="text-xs glass rounded-lg px-3 py-2 hover:bg-white/10 inline-flex items-center gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Reload
            </button>
            <button onClick={handleForceRefresh} disabled={refreshing}
              className="text-xs rounded-lg gradient-primary text-white px-3 py-2 hover:opacity-90 inline-flex items-center gap-1.5 disabled:opacity-60">
              {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
              Fetch live now
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div className="glass rounded-xl p-4">
            <div className="text-xs text-muted-foreground">Effective rate</div>
            <div className="text-2xl font-bold gradient-text mt-1">₹{resolved?.rate?.toFixed(2) ?? "—"}</div>
            <div className="text-[11px] text-muted-foreground">per 1 USD</div>
          </div>
          <div className="glass rounded-xl p-4">
            <div className="text-xs text-muted-foreground">Source</div>
            <div className={`text-sm font-semibold mt-1 inline-flex items-center gap-1.5 ${badge.tone}`}>
              {badge.icon} {badge.label}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {resolved?.provider ?? "manual"}
            </div>
          </div>
          <div className="glass rounded-xl p-4">
            <div className="text-xs text-muted-foreground">Fetched at</div>
            <div className="text-sm font-semibold mt-1">
              {resolved?.fetchedAt ? new Date(resolved.fetchedAt).toLocaleString() : "—"}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {resolved?.nextRefreshAt
                ? `Next refresh: ${new Date(resolved.nextRefreshAt).toLocaleString()}`
                : "—"}
            </div>
          </div>
        </div>

        {resolved?.warning && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 inline-flex items-center gap-2">
            <ShieldAlert className="w-3.5 h-3.5" /> {resolved.warning}
          </div>
        )}

        <div className="rounded-xl border border-border/40 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Manual override</div>
              <div className="text-xs text-muted-foreground">
                Force checkout to use the manual fallback and ignore live/cached rates.
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!data?.manualOverrideEnabled}
                onChange={(e) => handleToggleOverride(e.target.checked)}
                className="w-4 h-4 accent-[color:var(--brand-orange)]"
              />
              {data?.manualOverrideEnabled ? "Enabled" : "Disabled"}
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Manual fallback rate (used when live + cache unavailable)
          </label>
          <div className="flex gap-2">
            <input
              type="number" step="0.01" min="0" value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 rounded-lg glass px-3 py-2 text-sm bg-black/20 border border-border/40"
              placeholder="e.g. 96.25"
            />
            <button onClick={handleSaveFallback} disabled={saving}
              className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-60">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save fallback
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Current fallback: ₹{data?.manualFallback?.toFixed(2) ?? "—"} · cache TTL: {data?.cacheTtlHours ?? "—"}h
          </p>
        </div>

        {validPreview && (
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Converted price preview (at effective rate)</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              {samples.map((usd) => (
                <div key={usd} className="glass rounded-lg px-3 py-2 flex items-center justify-between">
                  <span className="text-muted-foreground">${usd}</span>
                  <span className="font-semibold">₹{Math.round(usd * (resolved?.rate ?? preview)).toLocaleString("en-IN")}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
