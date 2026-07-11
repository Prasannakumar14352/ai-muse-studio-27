import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { listScheduledPosts, retryScheduledPost, cancelScheduledPost } from "@/lib/publishing.functions";
import { toast } from "sonner";
import { Instagram, Facebook, Youtube, Linkedin, Plug, Clock, RefreshCw, Trash2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/connections")({
  head: () => ({
    meta: [
      { title: "Connected Accounts — CreatorVaultAI" },
      { name: "description", content: "Connect Instagram, Facebook, YouTube, and LinkedIn to publish directly, or download and post manually." },
    ],
  }),
  component: ConnectionsPage,
});

type PlatformDef = {
  id: "instagram" | "facebook" | "youtube" | "linkedin";
  label: string;
  Icon: typeof Instagram;
  note: string;
};

const DEFS: PlatformDef[] = [
  { id: "instagram", label: "Instagram", Icon: Instagram, note: "Meta Business login (Instagram Graph API). Direct publishing coming soon — download & post manually today." },
  { id: "facebook", label: "Facebook", Icon: Facebook, note: "Facebook Pages via Meta Business. Direct publishing coming soon." },
  { id: "youtube", label: "YouTube", Icon: Youtube, note: "Google OAuth (YouTube Data API v3). Direct publishing coming soon." },
  { id: "linkedin", label: "LinkedIn", Icon: Linkedin, note: "LinkedIn Marketing API. Direct publishing coming soon." },
];

function ConnectionsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listScheduledPosts);
  const retry = useServerFn(retryScheduledPost);
  const cancel = useServerFn(cancelScheduledPost);

  const { data: connections = [] } = useQuery({
    queryKey: ["platform_connections"],
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_connections").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: scheduled = [] } = useQuery({
    queryKey: ["scheduled_posts"],
    queryFn: () => list(),
    refetchInterval: 15_000,
  });

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold">Connected <span className="gradient-text">Accounts</span></h1>
        <p className="text-muted-foreground mt-1">Connect a social account to publish directly, or download and post manually — downloads always work.</p>
      </div>

      <section className="grid md:grid-cols-2 gap-4">
        {DEFS.map(({ id, label, Icon, note }) => {
          const conn = connections.find((c) => c.platform === id);
          return (
            <div key={id} className="glass rounded-2xl p-5 border border-white/10 space-y-3">
              <div className="flex items-center gap-3">
                <Icon className="w-6 h-6" />
                <div className="flex-1">
                  <div className="font-semibold">{label}</div>
                  <div className="text-xs text-muted-foreground">
                    {conn ? `Connected · ${conn.account_label ?? conn.account_id ?? "account"}` : "Not connected"}
                  </div>
                </div>
                <button
                  disabled
                  title="OAuth setup coming soon"
                  className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm flex items-center gap-1.5 opacity-60 cursor-not-allowed"
                >
                  <Plug className="w-3.5 h-3.5" /> Connect
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{note}</p>
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
    </div>
  );
}
