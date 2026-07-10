// Reusable "Your projects" grid used by Videos, Images and Thumbnails tabs.
// Shows the same backend projects as the dashboard, filtered by content_type.
// Now includes: loading skeleton, explicit empty state, error toast + console
// logging, and a manual refresh button so the tab always reflects backend state.

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect } from "react";
import { Loader2, FolderOpen, RefreshCw, Sparkles, AlertTriangle } from "lucide-react";

type Props = {
  /** Content-type values in the `projects.content_type` column. */
  contentTypes: string[];
  /** Section heading, e.g. "Your video projects". */
  title: string;
  /** Unique key suffix for the query cache. */
  cacheKey: string;
  /** Max cards to show. */
  limit?: number;
  /** Copy for the empty state CTA. */
  emptyLabel?: string;
};

export function ProjectsSection({
  contentTypes,
  title,
  cacheKey,
  limit = 24,
  emptyLabel = "Create your first project",
}: Props) {
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["projects-section", cacheKey, ...contentTypes],
    queryFn: async () => {
      // Same shape and filter the dashboard uses so the two views can never
      // disagree. We log both the request and the response so category-tab
      // "why don't I see my project?" issues are debuggable from devtools.
      console.info("[projects-section] fetching", { cacheKey, contentTypes, limit });
      const { data, error } = await supabase
        .from("projects")
        .select("id, title, content_type, created_at, style, platform")
        .in("content_type", contentTypes)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) {
        console.error("[projects-section] supabase error", { cacheKey, error });
        throw error;
      }
      console.info("[projects-section] fetched", { cacheKey, count: data?.length ?? 0 });
      return data ?? [];
    },
    retry: 1,
  });

  // Toast on error so a silent failure is never mistaken for "no projects".
  useEffect(() => {
    if (error) {
      toast.error(`Couldn't load ${title.toLowerCase()}`, {
        description: error instanceof Error ? error.message : "Unknown error",
        action: { label: "Retry", onClick: () => refetch() },
      });
    }
  }, [error, refetch, title]);

  const Header = (
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <FolderOpen className="w-4 h-4 text-[color:var(--neon-pink)]" /> {title}
      </h2>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {data && <span>{data.length} saved</span>}
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="glass px-2 py-1 rounded hover:bg-white/5 disabled:opacity-60 inline-flex items-center gap-1"
          title="Refresh"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <section className="space-y-3">
        {Header}
        <div className="glass rounded-2xl p-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading your projects…
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-3">
        {Header}
        <div className="glass rounded-2xl p-6 border border-red-500/30 bg-red-500/5 flex items-start gap-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold text-red-200">Couldn't load projects</div>
            <div className="text-muted-foreground mt-0.5">
              {error instanceof Error ? error.message : "Unknown error"}
            </div>
            <button
              onClick={() => refetch()}
              className="mt-3 rounded-lg glass px-3 py-1.5 text-xs hover:bg-white/5 inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3 h-3" /> Try again
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!data || data.length === 0) {
    return (
      <section className="space-y-3">
        {Header}
        <div className="glass rounded-2xl p-8 text-center border border-dashed border-white/10">
          <Sparkles className="w-6 h-6 mx-auto mb-2 text-[color:var(--neon-purple)]" />
          <div className="font-semibold">No projects here yet</div>
          <div className="text-sm text-muted-foreground mt-1">
            Anything you create for this category will show up here and on the dashboard.
          </div>
          <Link
            to="/create"
            className="inline-flex items-center gap-1.5 mt-4 rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium shadow-[var(--shadow-glow)]"
          >
            {emptyLabel}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {Header}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.map((p) => (
          <Link
            key={p.id}
            to="/projects/$id"
            params={{ id: p.id }}
            className="glass rounded-xl p-4 hover:border-white/20 transition block border border-border"
          >
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {p.content_type ?? "project"}
            </div>
            <div className="mt-1.5 font-semibold line-clamp-2 text-sm">{p.title}</div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              {p.style && <span className="glass px-2 py-0.5 rounded">{p.style}</span>}
              {p.platform && <span className="glass px-2 py-0.5 rounded">{p.platform}</span>}
              <span className="ml-auto">{new Date(p.created_at).toLocaleDateString()}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
