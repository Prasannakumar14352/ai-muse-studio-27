import { listVideoReconciliation } from "@/lib/video-reconciliation.functions";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { getFeatureReadinessFn, runReadinessCheckFn } from "@/lib/feature-readiness.functions";
import { listCapabilitiesFn } from "@/lib/providers/registry.functions";
import { CHECK_LABELS, FEATURE_LABELS, type FeatureId, type FeatureReadinessRow, type ReadinessCheck } from "@/lib/feature-readiness";

export const Route = createFileRoute("/_authenticated/admin/readiness")({
  component: ReadinessPage,
});

const CHECKS: ReadinessCheck[] = [
  "ui_implemented","backend_implemented","provider_configured","generation_tested",
  "credits_tested","preview_tested","download_tested","persistence_tested","retry_tested","no_production_mocks",
];

function ReadinessPage() {
  const get = useServerFn(getFeatureReadinessFn);
  const caps = useServerFn(listCapabilitiesFn);
  const run = useServerFn(runReadinessCheckFn);
  const reconcile = useServerFn(listVideoReconciliation);
  const videoQ = useQuery({
    queryKey: ["video-reconciliation"], queryFn: () => reconcile(), enabled: false,
  });
  const [runningFor, setRunningFor] = useState<string | null>(null);

  const rowsQ = useQuery({ queryKey: ["feature_readiness"], queryFn: () => get() });
  const capsQ = useQuery({ queryKey: ["capabilities"], queryFn: () => caps() });

  const runM = useMutation({
    mutationFn: async (fid?: FeatureId) => run({ data: { featureId: fid } }),
    onSuccess: () => { toast.success("Readiness updated"); rowsQ.refetch(); },
    onError: (e: Error) => toast.error(e.message || "Failed"),
    onSettled: () => setRunningFor(null),
  });

  const rows = (rowsQ.data ?? []) as FeatureReadinessRow[];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">Feature Readiness</h1>
          <p className="mt-1 text-sm text-white/60">
            The comparison table on the landing page reads its status from this data.
            A feature can only be marked <span className="font-medium text-emerald-300">Available</span> when every check passes.
          </p>
        </div>
        <button
          onClick={() => { setRunningFor("all"); runM.mutate(undefined); }}
          disabled={runM.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15 disabled:opacity-50"
        >
          {runM.isPending && runningFor === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Run readiness check
        </button>
      </div>

      <section className="rounded-2xl border border-border p-4 text-sm">
        <h2 className="font-semibold">Video generation reconciliation</h2>
        <p>Latest Veo and soundtrack records with their linked credit ledger state.</p>
        <button type="button" className="my-2 underline" disabled={videoQ.isFetching}
          onClick={() => void videoQ.refetch()}>Refresh reconciliation snapshot</button>
        {videoQ.isError && <p role="alert">Could not load video reconciliation.</p>}
        <ul className="max-h-80 space-y-2 overflow-auto">
          {videoQ.data?.map((item) => (
            <li key={item.id} className="rounded border border-border p-2">
              <div>{item.kind} · {item.state} · {item.assetStored ? "asset stored" : "no stored asset"}</div>
              <div className="break-all text-muted-foreground">Asset {item.id} · Provider request {item.providerRequestId ?? "unavailable"}</div>
              {item.requiresReconciliation && <div className="text-amber-300">Submission requires reconciliation</div>}
              {item.ledger ? <div>
                Ledger {item.ledger.status} · {item.ledger.credits_reserved} reserved · {item.ledger.credits_charged} finalized · {item.ledger.credits_refunded} refunded
              </div> : <div>Ledger record unavailable</div>}
            </li>
          ))}
        </ul>
      </section>

      {/* Provider registry snapshot */}
      <section className="rounded-2xl border border-border bg-white/[0.03] p-4">
        <h2 className="mb-3 text-sm font-semibold text-white/80">Provider capabilities</h2>
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          {(capsQ.data ?? []).map((c) => (
            <div key={c.capability} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
              {c.configured ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
              <div className="min-w-0">
                <div className="truncate text-white/90">{c.capability}</div>
                <div className="truncate text-xs text-white/50">{c.provider ?? c.reason ?? "not configured"}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        {rows.map((row) => (
          <div key={row.feature_id} className="rounded-2xl border border-border bg-white/[0.03] p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-base font-semibold text-white">{FEATURE_LABELS[row.feature_id as FeatureId] ?? row.feature_id}</div>
                <div className="text-xs text-white/50">Last verified: {row.last_verified_at ? new Date(row.last_verified_at).toLocaleString() : "never"}</div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={row.status} />
                <button
                  onClick={() => { setRunningFor(row.feature_id); runM.mutate(row.feature_id as FeatureId); }}
                  disabled={runM.isPending}
                  className="rounded-md bg-white/10 px-2.5 py-1.5 text-xs text-white hover:bg-white/15 disabled:opacity-50"
                >
                  {runM.isPending && runningFor === row.feature_id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Recheck"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3 md:grid-cols-5">
              {CHECKS.map((k) => {
                const ok = row[k];
                return (
                  <div key={k} className="flex items-center gap-2">
                    {ok
                      ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      : <XCircle className="h-4 w-4 shrink-0 text-red-400/80" />}
                    <span className={ok ? "text-white/85" : "text-white/50"}>{CHECK_LABELS[k]}</span>
                  </div>
                );
              })}
            </div>

            {row.blockers?.length > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-md bg-red-500/10 p-2 text-xs text-red-100">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="space-y-0.5">
                  <div className="font-medium">Blockers</div>
                  <ul className="list-disc pl-4">{row.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
                </div>
              </div>
            )}
            {row.notes && <div className="mt-2 text-xs text-white/50">{row.notes}</div>}
          </div>
        ))}
      </section>

      <p className="text-xs text-white/40">
        <Link to="/admin" className="underline">Back to Admin</Link>
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    available: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    beta: "bg-amber-500/15 text-amber-200 border-amber-500/30",
    coming_soon: "bg-sky-500/15 text-sky-200 border-sky-500/30",
    not_available: "bg-white/5 text-white/60 border-border",
  };
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[status] ?? map.not_available}`}>{status.replace("_", " ")}</span>;
}
