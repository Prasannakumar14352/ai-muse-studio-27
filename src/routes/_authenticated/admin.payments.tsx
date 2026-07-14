import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAccess } from "@/lib/access";
import {
  getRazorpaySettings,
  saveRazorpaySettings,
  testRazorpayConnection,
} from "@/lib/razorpay-settings.functions";
import { ArrowLeft, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  component: PaymentSettings,
});

type Form = {
  environment: "test" | "live";
  enabled: boolean;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  companyName: string;
  logoUrl: string;
  themeColor: string;
  currency: string;
};

function PaymentSettings() {
  const { data: access, isLoading } = useAccess();
  const getFn = useServerFn(getRazorpaySettings);
  const saveFn = useServerFn(saveRazorpaySettings);
  const testFn = useServerFn(testRazorpayConnection);
  const qc = useQueryClient();

  const { data, isFetching } = useQuery({
    queryKey: ["razorpay-admin-settings"],
    queryFn: () => getFn(),
    enabled: !!access?.isAdmin,
  });

  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; kind: "ok" | "invalid" | "network"; message: string } | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => {
    if (data && !form) {
      setForm({
        environment: data.environment,
        enabled: data.enabled,
        keyId: data.keyId,
        keySecret: "",
        webhookSecret: "",
        companyName: data.companyName,
        logoUrl: data.logoUrl,
        themeColor: data.themeColor,
        currency: data.currency,
      });
    }
  }, [data, form]);

  if (isLoading) return <div className="glass rounded-2xl h-64 animate-pulse" />;
  if (!access?.isAdmin) return <Navigate to="/dashboard" />;
  if (!form || !data) return <div className="glass rounded-2xl h-64 animate-pulse" />;

  const patch = (p: Partial<Form>) => setForm((f) => (f ? { ...f, ...p } : f));

  async function handleSave() {
    if (!form) return;
    if (!form.keyId.trim()) { toast.error("Key ID is required"); return; }
    setSaving(true);
    setSaveState("idle");
    try {
      await saveFn({
        data: {
          environment: form.environment,
          enabled: form.enabled,
          keyId: form.keyId.trim(),
          keySecret: form.keySecret || undefined,
          webhookSecret: form.webhookSecret || undefined,
          companyName: form.companyName,
          logoUrl: form.logoUrl,
          themeColor: form.themeColor,
          currency: form.currency || "INR",
        },
      });
      toast.success("Payment settings saved");
      setSaveState("saved");
      setForm({ ...form, keySecret: "", webhookSecret: "" });
      await qc.invalidateQueries({ queryKey: ["razorpay-admin-settings"] });
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (e) {
      setSaveState("error");
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await testFn();
      setTestResult(r);
      if (r.ok) toast.success("Razorpay connection OK"); else toast.error(r.message);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Test failed";
      setTestResult({ ok: false, kind: "network", message: msg });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  }

  const envBadge = form.environment === "live"
    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
    : "bg-amber-500/20 text-amber-300 border-amber-500/30";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white">
            <ArrowLeft className="w-4 h-4" /> Back to Admin
          </Link>
          <h1 className="text-2xl font-semibold mt-2 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-purple-300" />
            Payment Settings — Razorpay
          </h1>
          <p className="text-white/60 text-sm mt-1">
            Super admin only. Credentials are encrypted at rest and never exposed to the browser.
          </p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full border ${envBadge}`}>
          {form.environment.toUpperCase()}
        </span>
      </div>

      <div className="glass rounded-2xl p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Environment">
            <select
              className="w-full rounded-lg bg-black/30 border border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/30 outline-none px-3 py-2 text-sm placeholder:text-white/30 disabled:opacity-50"
              value={form.environment}
              onChange={(e) => patch({ environment: e.target.value as "test" | "live" })}
            >
              <option value="test">Test</option>
              <option value="live">Live</option>
            </select>
          </Field>

          <Field label="Currency">
            <input className="w-full rounded-lg bg-black/30 border border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/30 outline-none px-3 py-2 text-sm placeholder:text-white/30 disabled:opacity-50" value={form.currency} disabled />
          </Field>

          <Field label="Razorpay Key ID" hint="Public identifier — safe to expose to browser">
            <input
              className="w-full rounded-lg bg-black/30 border border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/30 outline-none px-3 py-2 text-sm font-mono placeholder:text-white/30 disabled:opacity-50"
              placeholder="rzp_test_xxx / rzp_live_xxx"
              value={form.keyId}
              onChange={(e) => patch({ keyId: e.target.value })}
            />
          </Field>

          <Field
            label="Razorpay Key Secret"
            hint={data.hasKeySecret ? "Saved. Leave blank to keep. Enter a new value to replace." : "Never saved yet"}
          >
            <input
              className="w-full rounded-lg bg-black/30 border border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/30 outline-none px-3 py-2 text-sm font-mono placeholder:text-white/30 disabled:opacity-50"
              type="password"
              placeholder={data.hasKeySecret ? "•••••••••••••• (unchanged)" : "Enter secret"}
              value={form.keySecret}
              onChange={(e) => patch({ keySecret: e.target.value })}
            />
          </Field>

          <Field
            label="Webhook Secret"
            hint={data.hasWebhookSecret ? "Saved. Leave blank to keep." : "Optional — used by /api/public/webhooks/razorpay"}
          >
            <input
              className="w-full rounded-lg bg-black/30 border border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/30 outline-none px-3 py-2 text-sm font-mono placeholder:text-white/30 disabled:opacity-50"
              type="password"
              placeholder={data.hasWebhookSecret ? "•••••••••••••• (unchanged)" : "Enter webhook secret"}
              value={form.webhookSecret}
              onChange={(e) => patch({ webhookSecret: e.target.value })}
            />
          </Field>

          <Field label="Company Name">
            <input
              className="w-full rounded-lg bg-black/30 border border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/30 outline-none px-3 py-2 text-sm placeholder:text-white/30 disabled:opacity-50"
              placeholder="CreatorFlow AI"
              value={form.companyName}
              onChange={(e) => patch({ companyName: e.target.value })}
            />
          </Field>

          <Field label="Logo URL">
            <input
              className="w-full rounded-lg bg-black/30 border border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/30 outline-none px-3 py-2 text-sm placeholder:text-white/30 disabled:opacity-50"
              placeholder="https://…/logo.png"
              value={form.logoUrl}
              onChange={(e) => patch({ logoUrl: e.target.value })}
            />
          </Field>

          <Field label="Theme Color">
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-10 w-14 rounded border border-white/10 bg-transparent"
                value={form.themeColor || "#0F172A"}
                onChange={(e) => patch({ themeColor: e.target.value })}
              />
              <input
                className="flex-1 rounded-lg bg-black/30 border border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/30 outline-none px-3 py-2 text-sm font-mono placeholder:text-white/30"
                value={form.themeColor}
                onChange={(e) => patch({ themeColor: e.target.value })}
              />
            </div>
          </Field>
        </div>

        <label className="flex items-center gap-3 pt-2 border-t border-white/10">
          <input
            type="checkbox"
            className="w-4 h-4"
            checked={form.enabled}
            onChange={(e) => patch({ enabled: e.target.checked })}
          />
          <span className="text-sm">
            Enable Razorpay checkout — when off, order creation is blocked platform-wide.
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || isFetching}
            aria-busy={saving}
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background
              disabled:opacity-60 disabled:cursor-not-allowed
              ${saveState === "saved"
                ? "bg-emerald-500 hover:bg-emerald-500"
                : saveState === "error"
                  ? "bg-rose-500 hover:bg-rose-500"
                  : "gradient-primary hover:brightness-110 active:brightness-95"}`}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Saving…
              </>
            ) : saveState === "saved" ? (
              <>
                <CheckCircle2 className="w-4 h-4" /> Saved
              </>
            ) : saveState === "error" ? (
              <>
                <XCircle className="w-4 h-4" /> Retry save
              </>
            ) : (
              "Save Changes"
            )}
          </button>

          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            aria-busy={testing}
            className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white/90 bg-white/5 border border-white/15 hover:bg-white/10 hover:border-white/25 transition
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background
              disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {testing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Testing…
              </>
            ) : (
              "Test Connection"
            )}
          </button>

          {data.updatedAt && (
            <span className="text-xs text-white/50">
              Last updated: {new Date(data.updatedAt).toLocaleString()}
            </span>
          )}
        </div>

        {testResult && (
          <div
            role="status"
            aria-live="polite"
            className={`rounded-lg px-4 py-3 text-sm flex items-start gap-2 border ${
              testResult.kind === "ok"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                : testResult.kind === "network"
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-200"
            }`}
          >
            {testResult.kind === "ok" ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            ) : testResult.kind === "network" ? (
              <Loader2 className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <div>
              <div className="font-semibold">
                {testResult.kind === "ok"
                  ? "Connected successfully"
                  : testResult.kind === "network"
                    ? "Network error"
                    : "Invalid credentials"}
              </div>
              <div className="font-mono text-xs opacity-90 break-all">{testResult.message}</div>
            </div>
          </div>
        )}
      </div>

      <div className="glass rounded-2xl p-5 text-sm text-white/70 space-y-2">
        <div className="font-semibold text-white">Security</div>
        <ul className="list-disc pl-5 space-y-1">
          <li>Key secret and webhook secret are encrypted with AES-256-GCM before being stored.</li>
          <li>The browser only ever receives the Key ID and branding fields — never the secret.</li>
          <li>Row-level security blocks direct database reads; only server functions with admin role can access this table.</li>
          <li>Changes take effect immediately for every checkout — no code deploy required.</li>
        </ul>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <div className="text-xs uppercase tracking-wide text-white/60">{label}</div>
      {children}
      {hint && <div className="text-xs text-white/40">{hint}</div>}
    </label>
  );
}
