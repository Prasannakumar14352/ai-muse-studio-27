import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/lib/access";
import { runRazorpayDiagnostic, createRazorpayCheckoutProbe } from "@/lib/razorpay-settings.functions";
import { ArrowLeft, ShieldCheck, ShieldAlert, RefreshCw, ChevronDown, ChevronRight, Activity, AlertTriangle, CheckCircle2, XCircle, Loader2, Info, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/webhooks")({ component: AdminWebhooksPage });

function AdminWebhooksPage() {
  const { data: access, isLoading } = useAccess();
  if (isLoading) return <div className="glass rounded-2xl h-40 animate-pulse" />;
  if (!access?.isAdmin) return <Navigate to="/dashboard" />;
  return <Inner />;
}

function Inner() {
  const events = useQuery({
    queryKey: ["admin-webhook-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("razorpay_webhook_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15_000,
  });

  const payments = useQuery({
    queryKey: ["admin-all-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15_000,
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <div className="flex items-center justify-between gap-3">
        <Link to="/admin" className="inline-flex items-center gap-2 rounded-lg glass hover:bg-white/10 px-3 py-2 text-sm">
          <ArrowLeft className="w-4 h-4" /> Back to Admin
        </Link>
        <button
          onClick={() => { events.refetch(); payments.refetch(); }}
          className="inline-flex items-center gap-2 rounded-lg glass hover:bg-white/10 px-3 py-2 text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Razorpay <span className="gradient-text">Debugger</span></h1>
        <p className="text-muted-foreground text-sm mt-1">Live webhook events + payment attempts. Refreshes every 15s.</p>
      </div>

      <DiagnosticPanel />

      <section className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Webhook events</h2>
          <span className="text-xs text-muted-foreground">{events.data?.length ?? 0} recent</span>
        </div>
        {events.isLoading ? (
          <div className="h-24 animate-pulse bg-white/5 rounded-lg" />
        ) : (events.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No webhook events received yet.</p>
        ) : (
          <div className="space-y-2">
            {events.data!.map((e) => <EventRow key={e.id} e={e} />)}
          </div>
        )}
      </section>

      <section className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Payment attempts</h2>
          <span className="text-xs text-muted-foreground">{payments.data?.length ?? 0} recent</span>
        </div>
        {payments.isLoading ? (
          <div className="h-24 animate-pulse bg-white/5 rounded-lg" />
        ) : (payments.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border/40">
                  <th className="text-left py-2 pr-3">When</th>
                  <th className="text-left py-2 pr-3">Status</th>
                  <th className="text-left py-2 pr-3">User</th>
                  <th className="text-left py-2 pr-3">Pack</th>
                  <th className="text-right py-2 pr-3">Amount</th>
                  <th className="text-right py-2 pr-3">Credits</th>
                  <th className="text-left py-2 pr-3">Order ID</th>
                  <th className="text-left py-2">Payment ID</th>
                </tr>
              </thead>
              <tbody>
                {payments.data!.map((p) => (
                  <tr key={p.id} className="border-b border-border/20 last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{new Date(p.created_at!).toLocaleString()}</td>
                    <td className="py-2 pr-3"><StatusPill status={p.status} /></td>
                    <td className="py-2 pr-3 font-mono text-xs">{p.user_id.slice(0, 8)}…</td>
                    <td className="py-2 pr-3">{p.pack_id}</td>
                    <td className="py-2 pr-3 text-right">${((p.amount_cents ?? 0) / 100).toFixed(2)} {p.currency}</td>
                    <td className="py-2 pr-3 text-right">{p.credits.toLocaleString()}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{p.razorpay_order_id ?? "—"}</td>
                    <td className="py-2 font-mono text-xs">{p.razorpay_payment_id ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    pending: "bg-yellow-500/15 text-yellow-200 border-yellow-500/30",
    failed:  "bg-rose-500/15 text-rose-300 border-rose-500/30",
  };
  return <span className={`inline-block px-2 py-0.5 rounded border text-xs ${map[status] ?? "bg-white/10 border-border/40"}`}>{status}</span>;
}

type Ev = {
  id: string;
  event_type: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  signature_verified: boolean;
  http_status: number;
  error_message: string | null;
  raw_payload: unknown;
  created_at: string;
};

function EventRow({ e }: { e: Ev }) {
  const [open, setOpen] = useState(false);
  const okHttp = e.http_status >= 200 && e.http_status < 300;
  return (
    <div className="rounded-lg border border-border/40 bg-black/20">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/5 rounded-lg">
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {e.signature_verified
          ? <ShieldCheck className="w-4 h-4 text-emerald-400" />
          : <ShieldAlert className="w-4 h-4 text-rose-400" />}
        <span className="text-sm font-medium">{e.event_type ?? "(no event)"}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded border ${okHttp ? "border-emerald-500/40 text-emerald-300" : "border-rose-500/40 text-rose-300"}`}>
          HTTP {e.http_status}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">{new Date(e.created_at).toLocaleString()}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Order ID" value={e.razorpay_order_id} />
            <Field label="Payment ID" value={e.razorpay_payment_id} />
          </div>
          {e.error_message && (
            <div className="rounded border border-rose-500/30 bg-rose-500/10 p-2 text-rose-200">{e.error_message}</div>
          )}
          <details>
            <summary className="cursor-pointer text-muted-foreground">Raw payload</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-black/40 p-3 text-[11px]">{JSON.stringify(e.raw_payload, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono">{value ?? "—"}</div>
    </div>
  );
}

type Diag = Awaited<ReturnType<typeof runRazorpayDiagnostic>>;

function DiagnosticPanel() {
  const runDiag = useServerFn(runRazorpayDiagnostic);
  const runProbe = useServerFn(createRazorpayCheckoutProbe);
  const [busy, setBusy] = useState(false);
  const [probing, setProbing] = useState(false);
  const [result, setResult] = useState<Diag | null>(null);

  async function handleRun() {
    setBusy(true);
    try {
      const r = await runDiag();
      setResult(r);
      if (r.ok) toast.success(`Diagnostic passed (${r.environment.toUpperCase()})`);
      else toast.error("Diagnostic failed — see details below");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Diagnostic error");
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckoutProbe() {
    setProbing(true);
    try {
      const probe = await runProbe();
      await ensureRazorpayScript();
      const w = window as unknown as { Razorpay: new (opts: Record<string, unknown>) => { open: () => void } };
      const rzp = new w.Razorpay({
        key: probe.keyId,
        order_id: probe.orderId,
        amount: probe.amount,
        currency: probe.currency,
        name: probe.companyName ?? "Checkout probe",
        description: "UPI QR rendering probe — do not pay",
        image: probe.logoUrl ?? undefined,
        theme: { color: probe.themeColor ?? "#0F172A" },
        handler: () => {
          toast.message("Checkout closed. Probe order is manual-capture and will not be charged.");
        },
        modal: {
          ondismiss: () => toast.message("Checkout closed without payment."),
        },
      });
      rzp.open();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout probe failed");
    } finally {
      setProbing(false);
    }
  }

  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-300" /> Diagnostic — Razorpay order + UPI/QR
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Creates a ₹1 INR probe order (never charged, expires unpaid). Successful order creation is the authoritative proof that the saved Key ID + Secret are valid for this environment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCheckoutProbe}
            disabled={probing}
            className="inline-flex items-center gap-2 rounded-lg glass hover:bg-white/10 border border-border/40 px-4 py-2 text-sm disabled:opacity-60"
            title="Open Razorpay Checkout with a ₹1 manual-capture order so you can visually confirm the UPI QR renders."
          >
            {probing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            {probing ? "Opening…" : "Run checkout probe (₹1, not charged)"}
          </button>
          <button
            onClick={handleRun}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg gradient-primary text-white px-4 py-2 text-sm disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
            {busy ? "Running…" : "Run diagnostic"}
          </button>
        </div>
      </div>

      {!result && (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Run the diagnostic to verify credentials, order creation, and payment configuration.
        </p>
      )}

      {result && (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Environment" value={result.environment.toUpperCase()}
                  tone={result.environment === "live" ? "emerald" : "amber"} />
            <Stat label="Credentials source" value={result.source} />
            <Stat label="Key mode" value={result.keyMode}
                  tone={result.keyMode === result.environment ? "emerald" : "rose"} />
            <Stat label="Key ID" value={result.keyIdMasked} mono />
          </div>

          {result.order && (
            <div className="rounded-lg border border-border/40 bg-black/20 p-3 text-xs">
              <div className="font-semibold text-sm mb-1 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Probe order created
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Field label="Order ID" value={result.order.id} />
                <Field label="Currency" value={result.order.currency} />
                <Field label="Amount (paise)" value={String(result.order.amount)} />
                <Field label="Status" value={result.order.status} />
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border/40 bg-black/20 p-3 text-xs">
            <div className="font-semibold text-sm mb-2">Validation checklist</div>
            <ul className="space-y-1.5">
              <CheckRow ok={result.checks.orderApi === "ok"} label="Order API" value="Connected" failValue="Failed" />
              <CheckRow ok label="Environment" value={result.checks.environment.toUpperCase()} />
              <CheckRow ok={result.checks.currency === "INR"} label="Currency" value={result.checks.currency} />
              <CheckRow ok={result.checks.amountValidation === "ok"} label="Amount validation" value="Passed" failValue="Failed" />
              <CheckRow ok={result.checks.credentialPair === "ok"} label="Credential pair" value="Valid" failValue="Invalid" />
              <li className="flex items-start gap-2">
                <Info className="w-3.5 h-3.5 mt-0.5 text-sky-300 shrink-0" />
                <div>
                  <span className="text-muted-foreground">UPI QR availability:</span>{" "}
                  <span className="text-sky-200">Must be verified in Razorpay Dashboard / live checkout</span>
                </div>
              </li>
            </ul>
          </div>

          <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-100 p-3 text-xs">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">UPI QR is account-side — verify in the dashboard</p>
                <p>
                  Successful order creation above proves the saved Key ID + Secret are valid.
                  Razorpay does not expose a reliable API to confirm UPI QR is turned on, so the QR
                  can only be verified in the dashboard or a real checkout.
                </p>
                <ol className="list-decimal ml-4 mt-1 space-y-0.5">
                  <li>Open Razorpay Dashboard → Account &amp; Settings → Payment Methods → UPI.</li>
                  <li>Confirm UPI and the QR / Collect flow are enabled for Live Mode.</li>
                  <li>Confirm account activation and website/app verification are complete.</li>
                  <li>Click <em>Run checkout probe</em> above to visually inspect the QR — close without paying.</li>
                </ol>
              </div>
            </div>
          </div>

          {result.warnings.map((w, i) => (
            <div key={`w${i}`} className="rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-100 p-3 text-xs flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{w}</span>
            </div>
          ))}
          {result.errors.map((er, i) => (
            <div key={`e${i}`} className="rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-100 p-3 text-xs flex gap-2">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{er}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CheckRow({ ok, label, value, failValue }: { ok: boolean; label: string; value: string; failValue?: string }) {
  return (
    <li className="flex items-start gap-2">
      {ok
        ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-emerald-400 shrink-0" />
        : <XCircle className="w-3.5 h-3.5 mt-0.5 text-rose-400 shrink-0" />}
      <div>
        <span className="text-muted-foreground">{label}:</span>{" "}
        <span className={ok ? "text-emerald-200" : "text-rose-200"}>{ok ? value : (failValue ?? value)}</span>
      </div>
    </li>
  );
}

async function ensureRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") return;
  const w = window as unknown as { Razorpay?: unknown };
  if (w.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Razorpay checkout script"));
    document.head.appendChild(s);
  });
}

function Stat({ label, value, tone, mono }: { label: string; value: string; tone?: "emerald" | "amber" | "rose"; mono?: boolean }) {
  const toneCls =
    tone === "emerald" ? "text-emerald-300" :
    tone === "amber" ? "text-amber-300" :
    tone === "rose" ? "text-rose-300" : "text-white";
  return (
    <div className="rounded-lg border border-border/40 bg-black/20 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-semibold mt-0.5 ${toneCls} ${mono ? "font-mono text-xs" : ""}`}>{value}</div>
    </div>
  );
}
