import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Instagram, Facebook, Youtube, Linkedin, Plug, Clock, RefreshCw, Trash2, AlertCircle, ExternalLink, Loader2, Settings, Plus } from "lucide-react";
import { listScheduledPosts, retryScheduledPost, cancelScheduledPost } from "@/lib/publishing.functions";
import { listProviderAvailability, startOAuth, listMyConnections, disconnectPlatform, getAccountLimits } from "@/lib/oauth-user.functions";
import { confirmDialog } from "@/components/confirm-dialog";
import { useAccess } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/connections")({
  validateSearch: (s: Record<string, unknown>) => ({
    ok: typeof s.ok === "string" ? s.ok : undefined,
    err: typeof s.err === "string" ? s.err : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Connected Accounts — CreatorFlow AI" },
      { name: "description", content: "Connect your social accounts to publish directly, or download and post manually." },
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
  const limitsFn = useServerFn(getAccountLimits);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    if (search.ok) toast.success(`Connected ${search.ok}`);
    if (search.err) toast.error(`Connection failed: ${search.err}`);
  }, [search.ok, search.err]);

  const { data: avail = [], isLoading: availLoading } = useQuery({ queryKey: ["provider-availability"], queryFn: () => availability() });
  const { data: access } = useAccess();
  const isAdmin = !!access?.isAdmin;
  const { data: connections = [] } = useQuery({ queryKey: ["platform_connections"], queryFn: () => myConns() });
  const { data: scheduled = [] } = useQuery({ queryKey: ["scheduled_posts"], queryFn: () => list(), refetchInterval: 15_000 });
  const { data: limits } = useQuery({ queryKey: ["account-limits"], queryFn: () => limitsFn() });
  const maxPer = limits?.max ?? null; // null = unlimited (admin)
  // Everyone sees all four platforms. One that isn't configured and enabled yet
  // shows to users as "Coming soon" (no Connect button); admins see why.
  const visibleDefs = DEFS;
  const labelFor = (id: unknown) => connections.find((c) => c.id === id)?.account_label as string | undefined;

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
        {isAdmin && (
          <a href="/admin/integrations" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <Settings className="w-3 h-3" /> Admin: configure providers
          </a>
        )}
      </div>

      <section className="grid md:grid-cols-2 gap-4">
        {visibleDefs.map(({ id, label, Icon }) => {
          const a = avail.find((x) => x.platform === id);
          const accounts = connections.filter((c) => c.platform === id);
          const configured = a?.configured ?? false;
          const enabled = a?.enabled ?? false;
          const canConnect = configured && enabled;
          const comingSoon = !availLoading && !canConnect && !isAdmin && accounts.length === 0;
          const atLimit = maxPer !== null && accounts.length >= maxPer;
          const hint = id === "youtube"
            ? "To add another channel, click Add account and pick that channel's Google account or Brand Account."
            : id === "linkedin"
              ? "Each LinkedIn login adds one personal profile."
              : "Every Page / Instagram business account you allow during login is added.";

          return (
            <div key={id} className="glass rounded-2xl p-5 border border-white/10 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center"><Icon className="w-5 h-5" /></div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold flex items-center gap-2">
                    {label}
                    {comingSoon && <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-200 border border-violet-400/20">Coming soon</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {comingSoon
                      ? "Direct posting is coming soon. Download and post manually for now."
                      : !canConnect
                      ? (isAdmin ? (configured ? "Disabled by admin" : "Not configured by admin") : "Unavailable right now")
                      : accounts.length === 0
                        ? "Not connected"
                        : `${accounts.length} account${accounts.length === 1 ? "" : "s"}${maxPer !== null ? ` of ${maxPer} on your plan` : ""}`}
                  </div>
                </div>
                {!comingSoon && <button
                  onClick={() => handleConnect(id)}
                  disabled={!canConnect || atLimit || starting === id}
                  title={!configured ? "OAuth credentials have not been configured by the administrator." : !enabled ? "This provider is currently disabled by the administrator." : atLimit ? "Plan limit reached — disconnect one or upgrade." : ""}
                  className={`rounded-lg px-3 py-1.5 text-sm flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${accounts.length ? "bg-white/5 hover:bg-white/10 border border-white/10" : "gradient-primary text-white"}`}
                >
                  {starting === id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : accounts.length ? <Plus className="w-3.5 h-3.5" /> : <Plug className="w-3.5 h-3.5" />}
                  {accounts.length ? "Add account" : "Connect"}
                </button>}
              </div>

              {isAdmin && !canConnect && (
                <p className="text-xs text-amber-400/80">Users see this as "Coming soon" until you configure and enable it in Admin → Social Publishing.</p>
              )}

              {accounts.length > 0 && (
                <ul className="divide-y divide-white/5 rounded-xl border border-white/5 bg-white/[0.02]">
                  {accounts.map((conn) => {
                    const expired = id !== "youtube" && conn.expires_at && new Date(conn.expires_at as string) < new Date();
                    const bad = expired || conn.status !== "connected";
                    return (
                      <li key={conn.id as string} className="flex items-center gap-3 px-3 py-2.5">
                        {conn.avatar_url ? (
                          <img src={conn.avatar_url as string} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center"><Icon className="w-4 h-4" /></div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">
                            {conn.profile_url ? (
                              <a href={conn.profile_url as string} target="_blank" rel="noreferrer" className="hover:underline">{(conn.account_label as string) ?? conn.account_id}</a>
                            ) : ((conn.account_label as string) ?? conn.account_id)}
                          </div>
                          <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${bad ? "bg-amber-400" : "bg-emerald-400"}`} />
                            {expired ? "Session expired — reconnect" : bad ? (conn.last_error as string) ?? "Needs reconnect" : "Connected"}
                          </div>
                        </div>
                        {bad && (
                          <button onClick={() => handleConnect(id)} disabled={!canConnect || starting === id} title="Reconnect"
                            className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 p-1.5 disabled:opacity-40">
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          title="Disconnect"
                          onClick={async () => {
                            const ok = await confirmDialog({
                              title: `Disconnect ${(conn.account_label as string) ?? label}?`,
                              description: "Scheduled posts for this account will be stopped. You can connect it again any time.",
                              confirmText: "Disconnect",
                              tone: "destructive",
                            });
                            if (!ok) return;
                            await disconnect({ data: { id: conn.id as string } });
                            qc.invalidateQueries({ queryKey: ["platform_connections"] });
                            qc.invalidateQueries({ queryKey: ["scheduled_posts"] });
                            qc.invalidateQueries({ queryKey: ["publish-targets"] });
                            toast.success("Disconnected");
                          }}
                          className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 p-1.5">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {canConnect && <p className="text-[11px] text-muted-foreground">{hint}</p>}
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
                <span className="capitalize px-2 py-0.5 rounded-full bg-white/5 text-xs">
                  {p.platform}{labelFor(p.connection_id) ? ` · ${labelFor(p.connection_id)}` : ""}
                </span>
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
