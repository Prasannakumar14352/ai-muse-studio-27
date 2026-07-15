import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardStatsFn } from "@/lib/analytics.functions";
import { AnalyticsStatCard } from "@/components/analytics-stat-card";
import { Zap, FolderKanban, Film, Image as ImageIcon, Send, Clock, TrendingUp, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/analytics")({ component: AnalyticsPage });

function AnalyticsPage() {
  const get = useServerFn(getDashboardStatsFn);
  const { data: s, isLoading } = useQuery({ queryKey: ["analytics"], queryFn: () => get() });

  if (isLoading || !s) return <div className="p-6"><div className="glass rounded-2xl h-64 animate-pulse" /></div>;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold flex items-center gap-2"><BarChart3 className="w-7 h-7 text-primary" /> Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Your creative production at a glance.</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AnalyticsStatCard icon={Zap} label="Credits used (30d)" value={s.creditsUsed30d} delta={s.growth.creditsDelta} />
        <AnalyticsStatCard icon={FolderKanban} label="Projects" value={s.projectsTotal} delta={s.growth.projectsDelta} />
        <AnalyticsStatCard icon={Film} label="Videos" value={s.videosTotal} />
        <AnalyticsStatCard icon={ImageIcon} label="Images" value={s.imagesTotal} />
        <AnalyticsStatCard icon={Send} label="Published" value={s.publishesTotal} />
        <AnalyticsStatCard icon={Clock} label="Est. watch time" value={`${s.estimatedWatchTimeMin}m`} />
        <AnalyticsStatCard icon={TrendingUp} label="Top templates" value={s.topTemplates?.[0]?.name ?? "—"} />
        <AnalyticsStatCard icon={FolderKanban} label="Top project" value={s.topProjects?.[0]?.title ?? "—"} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="glass rounded-2xl p-6 border border-white/10">
          <h3 className="font-semibold mb-3">Recent activity</h3>
          <div className="space-y-2">
            {s.recentActivity.map((a, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="truncate">
                  <div className="font-medium truncate">{a.description}</div>
                  <div className="text-xs text-muted-foreground">{new Date(a.at).toLocaleString()}</div>
                </div>
                <div className="text-xs text-primary">{a.credits} cr</div>
              </div>
            ))}
            {!s.recentActivity.length && <div className="text-sm text-muted-foreground">No activity yet.</div>}
          </div>
        </section>

        <section className="glass rounded-2xl p-6 border border-white/10">
          <h3 className="font-semibold mb-3">Top projects</h3>
          <div className="space-y-2">
            {s.topProjects.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm border-b border-white/5 pb-2 last:border-0">
                <div className="truncate">
                  <div className="font-medium truncate">{p.title}</div>
                  <div className="text-xs text-muted-foreground">{p.content_type}</div>
                </div>
                <div className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
