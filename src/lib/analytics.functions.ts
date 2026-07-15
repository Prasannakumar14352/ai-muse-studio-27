import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DashboardStats = {
  creditsUsed30d: number;
  projectsTotal: number;
  videosTotal: number;
  imagesTotal: number;
  publishesTotal: number;
  estimatedWatchTimeMin: number;
  views30d: number;
  downloads30d: number;
  ctr: number;
  revenueTotal: { currency: string; amount: number };
  revenue30d: { currency: string; amount: number };
  topTemplates: { name: string; count: number }[];
  topProjects: { id: string; title: string; content_type: string; created_at: string; views?: number; downloads?: number }[];
  recentActivity: { at: string; description: string; credits: number }[];
  creditsSeries: { date: string; credits: number }[];
  platformBreakdown: { platform: string; total: number; published: number; failed: number }[];
  growth: { creditsDelta: number; projectsDelta: number };
};

export const getDashboardStatsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 86400_000).toISOString();
    const d60 = new Date(now.getTime() - 60 * 86400_000).toISOString();

    const [
      usage30, usage60, projectCount, videoCount, imageCount, publishCount,
      recentProjects, recentUsage, events30, payments, scheduledAll, allProjectsForTop,
    ] = await Promise.all([
      context.supabase.from("usage_history").select("credits_used, created_at, description").eq("user_id", context.userId).gte("created_at", d30),
      context.supabase.from("usage_history").select("credits_used").eq("user_id", context.userId).gte("created_at", d60).lt("created_at", d30),
      context.supabase.from("projects").select("*", { count: "exact", head: true }).eq("user_id", context.userId),
      context.supabase.from("projects").select("*", { count: "exact", head: true }).eq("user_id", context.userId).in("content_type", ["long_video", "short_reel", "product_promo", "documentary", "talking_object"]),
      context.supabase.from("projects").select("*", { count: "exact", head: true }).eq("user_id", context.userId).eq("content_type", "ai_image"),
      context.supabase.from("scheduled_posts").select("*", { count: "exact", head: true }).eq("user_id", context.userId).eq("status", "published"),
      context.supabase.from("projects").select("id, title, content_type, created_at").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(10),
      context.supabase.from("usage_history").select("created_at, description, credits_used").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(12),
      context.supabase.from("analytics_events").select("event, meta, occurred_at").eq("user_id", context.userId).gte("occurred_at", d30),
      context.supabase.from("payments").select("amount_cents, currency, status, created_at").eq("user_id", context.userId).eq("status", "captured"),
      context.supabase.from("scheduled_posts").select("platform, status").eq("user_id", context.userId),
      context.supabase.from("projects").select("id, title, content_type, created_at, metadata").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(200),
    ]);

    const usage30Rows = (usage30.data ?? []) as { credits_used: number | null; created_at: string; description: string | null }[];
    const sum = (rows: { credits_used: number | null }[] | null) => (rows ?? []).reduce((a, r) => a + (r.credits_used ?? 0), 0);
    const creditsUsed30d = sum(usage30Rows);
    const creditsUsed60to30 = sum(usage60.data as { credits_used: number | null }[] | null);

    // Views / downloads from analytics_events
    const events = (events30.data ?? []) as { event: string; meta: Record<string, unknown>; occurred_at: string }[];
    const views30d = events.filter((e) => e.event === "view" || e.event === "asset_view" || e.event === "project_view").length;
    const downloads30d = events.filter((e) => e.event === "download" || e.event === "asset_download").length;
    const impressions = events.filter((e) => e.event === "impression").length;
    const clicks = events.filter((e) => e.event === "click").length;
    const ctr = impressions > 0 ? Math.round((clicks / impressions) * 1000) / 10 : 0;

    // Top templates from usage descriptions ("Template: X")
    const templateCounts = new Map<string, number>();
    for (const row of usage30Rows) {
      const m = /template:\s*([^\s|]+)/i.exec(row.description ?? "");
      if (m) templateCounts.set(m[1], (templateCounts.get(m[1]) ?? 0) + 1);
    }
    const topTemplates = Array.from(templateCounts.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Revenue
    const pays = (payments.data ?? []) as { amount_cents: number; currency: string; created_at: string }[];
    const revenueTotalAmt = pays.reduce((a, p) => a + (p.amount_cents ?? 0), 0) / 100;
    const revenue30dAmt = pays.filter((p) => p.created_at >= d30).reduce((a, p) => a + (p.amount_cents ?? 0), 0) / 100;
    const currency = pays[0]?.currency ?? "USD";

    // Credits series (last 30 days daily)
    const buckets = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400_000).toISOString().slice(0, 10);
      buckets.set(d, 0);
    }
    for (const r of usage30Rows) {
      const key = r.created_at.slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + (r.credits_used ?? 0));
    }
    const creditsSeries = Array.from(buckets.entries()).map(([date, credits]) => ({ date, credits }));

    // Platform breakdown
    const platformMap = new Map<string, { total: number; published: number; failed: number }>();
    for (const p of (scheduledAll.data ?? []) as { platform: string; status: string }[]) {
      const cur = platformMap.get(p.platform) ?? { total: 0, published: 0, failed: 0 };
      cur.total += 1;
      if (p.status === "published") cur.published += 1;
      if (p.status === "failed") cur.failed += 1;
      platformMap.set(p.platform, cur);
    }
    const platformBreakdown = Array.from(platformMap.entries()).map(([platform, v]) => ({ platform, ...v }));

    // Top projects by view events
    const viewsByProject = new Map<string, number>();
    const downloadsByProject = new Map<string, number>();
    for (const e of events) {
      const pid = (e.meta as { project_id?: string })?.project_id;
      if (!pid) continue;
      if (e.event.includes("view")) viewsByProject.set(pid, (viewsByProject.get(pid) ?? 0) + 1);
      if (e.event.includes("download")) downloadsByProject.set(pid, (downloadsByProject.get(pid) ?? 0) + 1);
    }
    const projectsAll = (allProjectsForTop.data ?? []) as { id: string; title: string; content_type: string; created_at: string }[];
    const topProjects = projectsAll
      .map((p) => ({ ...p, views: viewsByProject.get(p.id) ?? 0, downloads: downloadsByProject.get(p.id) ?? 0 }))
      .sort((a, b) => (b.views + b.downloads) - (a.views + a.downloads))
      .slice(0, 6);
    const topProjectsFinal = topProjects.some((p) => (p.views ?? 0) > 0 || (p.downloads ?? 0) > 0)
      ? topProjects
      : (recentProjects.data ?? []).map((p) => ({ ...p, views: 0, downloads: 0 })) as DashboardStats["topProjects"];

    const projects30d = (recentProjects.data ?? []).filter((p: { created_at: string }) => p.created_at >= d30).length;

    const stats: DashboardStats = {
      creditsUsed30d,
      projectsTotal: projectCount.count ?? 0,
      videosTotal: videoCount.count ?? 0,
      imagesTotal: imageCount.count ?? 0,
      publishesTotal: publishCount.count ?? 0,
      estimatedWatchTimeMin: Math.round(((videoCount.count ?? 0) * 45) / 60),
      views30d,
      downloads30d,
      ctr,
      revenueTotal: { currency, amount: revenueTotalAmt },
      revenue30d: { currency, amount: revenue30dAmt },
      topTemplates,
      topProjects: topProjectsFinal,
      recentActivity: ((recentUsage.data ?? []) as Array<{ created_at: string; description: string | null; credits_used: number | null }>).map((r) => ({
        at: r.created_at,
        description: r.description ?? "Generation",
        credits: r.credits_used ?? 0,
      })),
      creditsSeries,
      platformBreakdown,
      growth: {
        creditsDelta: creditsUsed30d - creditsUsed60to30,
        projectsDelta: projects30d,
      },
    };
    return stats;
  });
