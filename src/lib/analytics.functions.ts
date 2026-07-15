import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DashboardStats = {
  creditsUsed30d: number;
  projectsTotal: number;
  videosTotal: number;
  imagesTotal: number;
  publishesTotal: number;
  estimatedWatchTimeMin: number;
  topTemplates: { name: string; count: number }[];
  topProjects: { id: string; title: string; content_type: string; created_at: string }[];
  recentActivity: { at: string; description: string; credits: number }[];
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
      recentProjects, recentUsage,
    ] = await Promise.all([
      context.supabase.from("usage_history").select("credits_used").eq("user_id", context.userId).gte("created_at", d30),
      context.supabase.from("usage_history").select("credits_used").eq("user_id", context.userId).gte("created_at", d60).lt("created_at", d30),
      context.supabase.from("projects").select("*", { count: "exact", head: true }).eq("user_id", context.userId),
      context.supabase.from("projects").select("*", { count: "exact", head: true }).eq("user_id", context.userId).in("content_type", ["long_video", "short_reel", "product_promo", "documentary", "talking_object"]),
      context.supabase.from("projects").select("*", { count: "exact", head: true }).eq("user_id", context.userId).eq("content_type", "ai_image"),
      context.supabase.from("scheduled_posts").select("*", { count: "exact", head: true }).eq("user_id", context.userId),
      context.supabase.from("projects").select("id, title, content_type, created_at").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(6),
      context.supabase.from("usage_history").select("created_at, description, credits_used").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(12),
    ]);

    const sum = (rows: { credits_used: number | null }[] | null) => (rows ?? []).reduce((a, r) => a + (r.credits_used ?? 0), 0);
    const creditsUsed30d = sum(usage30.data as { credits_used: number | null }[] | null);
    const creditsUsed60to30 = sum(usage60.data as { credits_used: number | null }[] | null);

    const projects30d = (recentProjects.data ?? []).filter((p: { created_at: string }) => p.created_at >= d30).length;
    const projects60to30 = 0; // approximate — we only fetched recent 6

    const stats: DashboardStats = {
      creditsUsed30d,
      projectsTotal: projectCount.count ?? 0,
      videosTotal: videoCount.count ?? 0,
      imagesTotal: imageCount.count ?? 0,
      publishesTotal: publishCount.count ?? 0,
      estimatedWatchTimeMin: Math.round(((videoCount.count ?? 0) * 45) / 60),
      topTemplates: [],
      topProjects: (recentProjects.data ?? []) as DashboardStats["topProjects"],
      recentActivity: ((recentUsage.data ?? []) as Array<{ created_at: string; description: string | null; credits_used: number | null }>).map((r) => ({
        at: r.created_at,
        description: r.description ?? "Generation",
        credits: r.credits_used ?? 0,
      })),
      growth: {
        creditsDelta: creditsUsed30d - creditsUsed60to30,
        projectsDelta: projects30d - projects60to30,
      },
    };
    return stats;
  });
