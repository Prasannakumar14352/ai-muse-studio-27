import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Instagram, Facebook, Youtube, Linkedin, Plug, Clock, RefreshCw, Trash2, AlertCircle, ExternalLink, Loader2, Settings } from "lucide-react";
import { listScheduledPosts, retryScheduledPost, cancelScheduledPost } from "@/lib/publishing.functions";
import { listProviderAvailability, startOAuth, listMyConnections, disconnectPlatform, selectDestinationAccount } from "@/lib/oauth-user.functions";

export const Route = createFileRoute("/_authenticated/connections")({
  validateSearch: (s: Record<string, unknown>) => ({
    ok: typeof s.ok === "string" ? s.ok : undefined,
    err: typeof s.err === "string" ? s.err : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Connected Accounts — CreatorFlow AI" },
      { name: "description", content: "Connect Instagram, Facebook, YouTube, and LinkedIn to publish directly, or download and post manually." },
    ],
  }),
  component: ConnectionsPage,
});

type PlatformDef = { id: "instagram" | "facebook" | "youtube" | "linkedin"; label: string; Icon: typeof Instagram };
const DEFS: PlatformDef[] = [
  { id: "instagram", label: "Instagram", Icon: Instagram },
  { id: "facebook", label: "Facebook", Icon: Facebook },
  { id: "youtube", label: "YouTube", Icon: Youtube },
  { id: "linkedin", label: "LinkedIn", Icon: Linkedin },
];

function ConnectionsPage() {
  const qc = useQueryClient();
  const search = useSearch({ from: "/_authenticated/connections" });
  const list = useServerFn(listScheduledPosts);
  const retry = useServerFn(retryScheduledPost);
  const cancel = useServerFn(cancelScheduledPost);
  const availability = useServerFn(listProviderAvailability);
  const myConns = useServerFn(listMyConnections);
  const start = useServerFn(startOAuth);
  const disconnect = useServerFn(disconnectPlatform);
  const selectDest = useServerFn(selectDestinationAccount);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    if (search.ok) toast.success(`Connected ${search.ok}`);
    if (search.err) toast.error(`Connection failed: ${search.err}`);
  }, [search.ok, search.err]);

  const { data: avail = [] } = useQuery({ queryKey: ["provider-availability"], queryFn: () => availability() });
  const { data: connections = [] } = useQuery({ queryKey: ["platform_connections"], queryFn: () => myConns() });
  const { data: scheduled = [] } = useQuery({ queryKey: ["scheduled_posts"], queryFn: () => list(), refetchInterval: 15_000 });

  async function handleConnect(platform: PlatformDef["id"]) {
    setStarting(platform);
    try {
      const r = await start({ data: { platform } });
      window.location.href = r.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start OAuth");
      setStarting(null);
    }
  }

  return (
    <div className="max-w-5xl space-y-8">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">Connected <span className="gradient-text">Accounts</span></h1>
          <p className="text-muted-foreground mt-1">Sign in with your social account. Downloads and manual posting always work — even without a connection.</p>
        </div>
        <a href="/admin/integrations" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <Settings className="w-3 h-3" /> Admin: configure providers
        </a>
      </div>

      <section className="grid md:grid-cols-2 gap-4">
        {DEFS.map(({ id, label, Icon }) => {
          const a = avail.find((x) => x.platform === id);
          const conn = connections.find((c) => c.platform === id);
          const configured = a?.configured ?? false;
          const enabled = a?.enabled ?? false;
          const canConnect = configured && enabled;
          const accounts = (conn?.metadata as { accounts?: Array<{ id: string; label: string; avatarUrl?: string }> } | null)?.accounts ?? [];
          const expired = conn?.expires_at && new Date(conn.expires_at as string) < new Date();

          return (
            <div key={id} className="glass rounded-2xl p-5 border border-white/10 space-y-3">
              <div className="flex items-center gap-3">
                {conn?.avatar_url ? (
                  <img src={conn.avatar_url as string} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center"><Icon className="w-5 h-5" /></div>
                )}
                <div className="flex-1">
                  <div className="font-semibold">{label}</div>
                  <div className="text-xs text-muted-foreground">
                    {conn ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${expired ? "bg-amber-400" : "bg-emerald-400"}`} />
                        {conn.account_label ?? conn.account_id ?? "Connected"}
                        {expired && " · session expired"}
                      </span>
                    ) : canConnect ? "Not connected" : configured ? "Disabled by admin" : "Not configured by admin"}
                  </div>
                </div>
                {conn ? (
                  <>
                    <button onClick={() => handleConnect(id)} disabled={!canConnect || starting === id}
                      className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-40">
                      {starting === id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Reconnect
                    </button>
                    <button
                      onClick={async () => {
                        await disconnect({ data: { id: conn.id as string } });
                        qc.invalidateQueries({ queryKey: ["platform_connections"] });
                        toast.success("Disconnected");
                      }}
                      className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 text-xs flex items-center gap-1.5">
                      <Trash2 className="w-3.5 h-3.5" /> Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleConnect(id)}
                    disabled={!canConnect || starting === id}
                    title={!configured ? "OAuth credentials have not been configured by the administrator." : !enabled ? "This provider is currently disabled by the administrator." : ""}
                    className="rounded-lg gradient-primary text-white px-3 py-1.5 text-sm flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {starting === id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
                    Connect
                  </button>
                )}
              </div>

              {!configured && (
                <p className="text-xs text-amber-400/80">OAuth credentials have not been configured by the administrator.</p>
              )}
              {conn?.scopes && (conn.scopes as string[]).length > 0 && (
                <div className="text-xs text-muted-foreground">
                  <span className="uppercase text-[10px] tracking-wide">Permissions granted:</span>{" "}
                  {(conn.scopes as string[]).join(", ")}
                </div>
              )}

              {conn && accounts.length > 1 && (
                <div className="text-xs space-y-1">
                  <div className="uppercase text-[10px] tracking-wide text-muted-foreground">Destination</div>
                  <div className="flex flex-wrap gap-1.5">
                    {accounts.map((a2) => (
                      <button key={a2.id}
                        onClick={async () => {
                          await selectDest({ data: { id: conn.id as string, accountId: a2.id, accountLabel: a2.label, avatarUrl: a2.avatarUrl } });
                          qc.invalidateQueries({ queryKey: ["platform_connections"] });
                        }}
                        className={`px-2 py-1 rounded-full border ${conn.account_id === a2.id ? "gradient-primary text-white border-transparent" : "border-white/10 hover:bg-white/5"}`}>
                        {a2.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="glass rounded-2xl p-5 border border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4" />
          <h2 className="font-semibold">Scheduled &amp; recent</h2>
        </div>
        {scheduled.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nothing scheduled yet. Queue a publish from any project.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {scheduled.map((p) => (
              <div key={p.id} className="py-3 flex flex-wrap items-center gap-3 text-sm">
                <span className="capitalize px-2 py-0.5 rounded-full bg-white/5 text-xs">{p.platform}</span>
                <span className="px-2 py-0.5 rounded-full bg-white/5 text-xs">{p.status}</span>
                <span className="text-muted-foreground text-xs">
                  {p.scheduled_at ? new Date(p.scheduled_at as string).toLocaleString() : "immediate"}
                </span>
                <span className="flex-1 text-muted-foreground truncate">{p.caption ?? ""}</span>
                {p.last_error && (
                  <span className="inline-flex items-center gap-1 text-amber-400 text-xs" title={p.last_error as string}>
                    <AlertCircle className="w-3 h-3" /> issue
                  </span>
                )}
                <button
                  onClick={async () => { await retry({ data: { id: p.id as string } }); qc.invalidateQueries({ queryKey: ["scheduled_posts"] }); toast.success("Re-queued"); }}
                  className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-1 text-xs flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Retry
                </button>
                <button
                  onClick={async () => { await cancel({ data: { id: p.id as string } }); qc.invalidateQueries({ queryKey: ["scheduled_posts"] }); toast.success("Removed"); }}
                  className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-1 text-xs flex items-center gap-1">
                  <Trash2 className="w-3 h-3" /> Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground text-center">
        <ExternalLink className="w-3 h-3 inline mr-1" />
        You never share your social password. Sign-in happens on the official provider website.
      </p>
    </div>
  );
}
