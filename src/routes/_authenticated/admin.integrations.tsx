import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, CheckCircle2, XCircle, Loader2, Save, PlayCircle } from "lucide-react";
import { listOAuthProviderConfigs, saveOAuthProviderConfig, testOAuthProviderConfig } from "@/lib/oauth-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/integrations")({
  head: () => ({ meta: [{ title: "Admin · Social Publishing — CreatorFlow AI" }] }),
  component: AdminIntegrationsPage,
});

type ProviderRow = Awaited<ReturnType<typeof listOAuthProviderConfigs>>[number];

const PROVIDER_LABELS: Record<string, { title: string; note: string; platforms: string[] }> = {
  meta: {
    title: "Meta (Instagram + Facebook)",
    note: "Create a Facebook Login for Business app at developers.facebook.com. Enable Instagram Graph API and Facebook Login. Add the callback URLs below to the Valid OAuth Redirect URIs.",
    platforms: ["instagram", "facebook"],
  },
  google: {
    title: "Google (YouTube)",
    note: "Create OAuth 2.0 credentials in Google Cloud Console → APIs & Services → Credentials. Enable YouTube Data API v3. Add the callback URL below to Authorized redirect URIs.",
    platforms: ["youtube"],
  },
  linkedin: {
    title: "LinkedIn",
    note: "Create an app at linkedin.com/developers. Request 'Sign In with LinkedIn using OpenID Connect' + 'Share on LinkedIn'. Add the callback URL below to Authorized redirect URLs.",
    platforms: ["linkedin"],
  },
};

function AdminIntegrationsPage() {
  const list = useServerFn(listOAuthProviderConfigs);
  const { data, refetch, isLoading } = useQuery({ queryKey: ["oauth-configs"], queryFn: () => list() });

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold">
          Social Publishing <span className="gradient-text">Integrations</span>
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure one OAuth app per provider. These credentials are shared by all users and never shown to them.
        </p>
      </div>
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      <div className="grid gap-4">
        {(data ?? []).map((row) => (
          <ProviderCard key={row.provider} row={row} onChanged={() => refetch()} />
        ))}
      </div>
    </div>
  );
}

function ProviderCard({ row, onChanged }: { row: ProviderRow; onChanged: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(saveOAuthProviderConfig);
  const test = useServerFn(testOAuthProviderConfig);
  const meta = PROVIDER_LABELS[row.provider];
  const [clientId, setClientId] = useState(row.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [enabled, setEnabled] = useState(row.enabled);
  const [busy, setBusy] = useState<null | "save" | "test">(null);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const callbacks = meta.platforms.map((p) => `${origin}/api/public/oauth/${p}/callback`);

  return (
    <div className="glass rounded-2xl p-5 border border-border space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-semibold">{meta.title}</div>
          <div className="text-xs text-muted-foreground mt-1 max-w-xl">{meta.note}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-xs ${row.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-muted-foreground"}`}>
            {row.enabled ? "Enabled" : "Disabled"}
          </span>
          {row.hasSecret ? (
            <span className="px-2 py-0.5 rounded-full text-xs bg-blue-500/15 text-blue-300">Secret set</span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/15 text-amber-300">No secret</span>
          )}
          {row.lastTestOk === true && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {row.lastTestOk === false && <XCircle className="w-4 h-4 text-red-400" />}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <label className="text-sm space-y-1">
          <span className="text-muted-foreground text-xs uppercase">Client ID</span>
          <input value={clientId} onChange={(e) => setClientId(e.target.value)}
            className="w-full bg-input/60 border border-border rounded-lg px-3 py-2 text-sm font-mono"
            placeholder="Paste Client ID" />
        </label>
        <label className="text-sm space-y-1">
          <span className="text-muted-foreground text-xs uppercase">Client Secret {row.hasSecret && <em className="normal-case text-muted-foreground/60">(leave blank to keep existing)</em>}</span>
          <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)}
            className="w-full bg-input/60 border border-border rounded-lg px-3 py-2 text-sm font-mono"
            placeholder={row.hasSecret ? "•••••••• (stored encrypted)" : "Paste Client Secret"} />
        </label>
      </div>

      <div className="space-y-1">
        <div className="text-muted-foreground text-xs uppercase">Callback URL(s)</div>
        {callbacks.map((cb) => (
          <div key={cb} className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2 text-xs font-mono">
            <span className="flex-1 truncate">{cb}</span>
            <button aria-label="Copy" onClick={() => { navigator.clipboard.writeText(cb); toast.success("Copied"); }}
              className="text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>

      {row.lastTestError && (
        <div className="text-xs text-red-400 bg-red-500/10 rounded-lg p-2">
          Last test failed: {row.lastTestError}
        </div>
      )}
      {row.lastTestAt && (
        <div className="text-xs text-muted-foreground">
          Last tested: {new Date(row.lastTestAt).toLocaleString()}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enable this provider
        </label>
        <div className="flex-1" />
        <button
          disabled={busy !== null}
          onClick={async () => {
            setBusy("save");
            try {
              await save({ data: { provider: row.provider as "meta" | "google" | "linkedin", clientId, clientSecret: clientSecret || undefined, enabled } });
              toast.success("Saved");
              setClientSecret("");
              onChanged();
              qc.invalidateQueries({ queryKey: ["provider-availability"] });
            } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
            finally { setBusy(null); }
          }}
          className="rounded-lg gradient-primary text-white px-3 py-1.5 text-sm flex items-center gap-1.5 disabled:opacity-60"
        >
          {busy === "save" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
        <button
          disabled={busy !== null || !row.hasSecret}
          onClick={async () => {
            setBusy("test");
            try {
              const r = await test({ data: { provider: row.provider as "meta" | "google" | "linkedin" } });
              if (r.ok) toast.success("Configuration OK"); else toast.error(r.error ?? "Test failed");
              onChanged();
            } catch (e) { toast.error(e instanceof Error ? e.message : "Test failed"); }
            finally { setBusy(null); }
          }}
          className="rounded-lg bg-white/5 hover:bg-white/10 border border-border px-3 py-1.5 text-sm flex items-center gap-1.5 disabled:opacity-40"
        >
          {busy === "test" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
          Test
        </button>
      </div>
    </div>
  );
}
