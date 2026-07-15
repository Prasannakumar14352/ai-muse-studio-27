import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardStatsFn } from "@/lib/analytics.functions";
import { AnalyticsStatCard } from "@/components/analytics-stat-card";
import {
  Zap, FolderKanban, Film, Image as ImageIcon, Send, Eye, Download,
  TrendingUp, BarChart3, DollarSign, Sparkles, MousePointerClick,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/analytics")({ component: AnalyticsPage });

function AnalyticsPage() {
  const get = useServerFn(getDashboardStatsFn);
  const { data: s, isLoading } = useQuery({ queryKey: ["analytics"], queryFn: () => get() });

  if (isLoading || !s) return <div className="p-6"><div className="glass rounded-2xl h-64 animate-pulse" /></div>;

  const cur = s.revenue30d.currency || "USD";
  const fmtMoney = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);

  const maxCredit = Math.max(1, ...s.creditsSeries.map((p) => p.credits));

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold flex items-center gap-2"><BarChart3 className="w-7 h-7 text-primary" /> Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Performance across content, publishing, and revenue.</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <AnalyticsStatCard icon={Eye} label="Views (30d)" value={s.views30d} />
        <AnalyticsStatCard icon={Download} label="Downloads (30d)" value={s.downloads30d} />
        <AnalyticsStatCard icon={Send} label="Published assets" value={s.publishesTotal} />
        <AnalyticsStatCard icon={MousePointerClick} label="CTR" value={`${s.ctr}%`} hint="clicks / impressions" />
        <AnalyticsStatCard icon={Zap} label="Credits used (30d)" value={s.creditsUsed30d} delta={s.growth.creditsDelta} />
        <AnalyticsStatCard icon={DollarSign} label="Revenue (30d)" value={fmtMoney(s.revenue30d.amount)} hint={`Total: ${fmtMoney(s.revenueTotal.amount)}`} />
        <AnalyticsStatCard icon={Film} label="Videos" value={s.videosTotal} />
        <AnalyticsStatCard icon={ImageIcon} label="Images" value={s.imagesTotal} />
      </div>

      {/* Credit Usage sparkline */}
      <section className="glass rounded-2xl p-6 border border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2"><Zap className="w-4 h-4 text-primary" /> Credit Usage (30 days)</h3>
          <div className="text-xs text-muted-foreground">Total: {s.creditsUsed30d} credits</div>
        </div>
        <div className="flex items-end gap-1 h-32">
          {s.creditsSeries.map((p) => (
            <div key={p.date} className="flex-1 flex flex-col justify-end" title={`${p.date}: ${p.credits}`}>
              <div
                className="w-full rounded-t bg-gradient-to-t from-primary/40 to-primary"
                style={{ height: `${(p.credits / maxCredit) * 100}%`, minHeight: p.credits > 0 ? 2 : 0 }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
          <span>{s.creditsSeries[0]?.date}</span>
          <span>{s.creditsSeries[s.creditsSeries.length - 1]?.date}</span>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top Performing */}
        <section className="glass rounded-2xl p-6 border border-white/10">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> Top Performing Content</h3>
          <div className="space-y-2">
            {s.topProjects.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm border-b border-white/5 pb-2 last:border-0">
                <div className="truncate">
                  <div className="font-medium truncate">{p.title}</div>
                  <div className="text-xs text-muted-foreground">{p.content_type}</div>
                </div>
                <div className="text-xs text-right">
                  <div className="text-primary">{p.views ?? 0} views</div>
                  <div className="text-muted-foreground">{p.downloads ?? 0} dl</div>
                </div>
              </div>
            ))}
            {!s.topProjects.length && <div className="text-sm text-muted-foreground">No content yet.</div>}
          </div>
        </section>

        {/* Best Templates */}
        <section className="glass rounded-2xl p-6 border border-white/10">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Best Templates</h3>
          <div className="space-y-2">
            {s.topTemplates.length ? s.topTemplates.map((t) => (
              <div key={t.name} className="flex items-center justify-between text-sm">
                <div className="font-medium truncate">{t.name}</div>
                <div className="text-xs text-primary">{t.count} uses</div>
              </div>
            )) : <div className="text-sm text-muted-foreground">No template usage yet.</div>}
          </div>
        </section>

        {/* Platform Analytics */}
        <section className="glass rounded-2xl p-6 border border-white/10">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Send className="w-4 h-4 text-primary" /> Platform Analytics</h3>
          <div className="space-y-2">
            {s.platformBreakdown.length ? s.platformBreakdown.map((p) => (
              <div key={p.platform} className="text-sm border-b border-white/5 pb-2 last:border-0">
                <div className="flex items-center justify-between">
                  <div className="font-medium capitalize">{p.platform}</div>
                  <div className="text-xs text-muted-foreground">{p.total} posts</div>
                </div>
                <div className="mt-1 flex gap-1 h-2 rounded overflow-hidden bg-white/5">
                  <div className="bg-emerald-500" style={{ width: `${(p.published / Math.max(1, p.total)) * 100}%` }} />
                  <div className="bg-red-500" style={{ width: `${(p.failed / Math.max(1, p.total)) * 100}%` }} />
                </div>
                <div className="text-[10px] mt-1 text-muted-foreground">{p.published} published · {p.failed} failed</div>
              </div>
            )) : <div className="text-sm text-muted-foreground">No published posts yet.</div>}
          </div>
        </section>

        {/* Recent activity */}
        <section className="glass rounded-2xl p-6 border border-white/10">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><FolderKanban className="w-4 h-4 text-primary" /> Recent activity</h3>
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
      </div>
    </div>
  );
}
