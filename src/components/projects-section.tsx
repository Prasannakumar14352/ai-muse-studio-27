// Reusable "Your projects" grid used by Videos, Images and Thumbnails tabs.
// Shows the same backend projects as the dashboard, filtered by content_type.
// Now includes: loading skeleton, explicit empty state, error toast + console
// logging, and a manual refresh button so the tab always reflects backend state.

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { Loader2, FolderOpen, RefreshCw, Sparkles, AlertTriangle, Plus } from "lucide-react";
import { ProjectThumbnail } from "@/components/project-thumbnail";
import { CONTENT_TYPES_BY_ID, PROJECT_STATUSES, type ContentTypeId } from "@/lib/content-types";

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
  /** Optional: hide the internal empty state so the parent can render its own. */
  hideEmptyState?: boolean;
  /** Optional callback with the current count (0 = empty). */
  onCount?: (count: number) => void;
  /** Aspect ratio for the card thumbnails. */
  thumbnailAspect?: "portrait" | "landscape" | "square";
  /** Show sub-type filter chips (only meaningful when the tab spans multiple types). */
  showTypeFilter?: boolean;
  /** Show status filter chips (Drafts / Ready / Rendering / etc). */
  showStatusFilter?: boolean;
};

export function ProjectsSection({
  contentTypes,
  title,
  cacheKey,
  limit = 24,
  emptyLabel = "Create your first project",
  hideEmptyState = false,
  onCount,
  thumbnailAspect = "landscape",
  showTypeFilter = false,
  showStatusFilter = false,
}: Props) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["projects-section", cacheKey, ...contentTypes],
    queryFn: async () => {
      console.info("[projects-section] fetching", { cacheKey, contentTypes, limit });
      const { data, error } = await supabase
        .from("projects")
        .select(
          "id, title, content_type, created_at, updated_at, style, platform, status, thumbnail_url, cover_image_url, poster_url",
        )
        .in("content_type", contentTypes)
        .order("updated_at", { ascending: false })
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

  useEffect(() => {
    if (error) {
      toast.error(`Couldn't load ${title.toLowerCase()}`, {
        description: error instanceof Error ? error.message : "Unknown error",
        action: { label: "Retry", onClick: () => refetch() },
      });
    }
  }, [error, refetch, title]);

  const filtered = useMemo(() => {
    if (!data) return data;
    return data.filter((p) => {
      const okType = typeFilter === "all" || (p.content_type ?? "") === typeFilter;
      const okStatus = statusFilter === "all" || (p.status ?? "") === statusFilter;
      return okType && okStatus;
    });
  }, [data, typeFilter, statusFilter]);

  useEffect(() => {
    if (!isLoading && !error && onCount) onCount(filtered?.length ?? 0);
  }, [filtered, isLoading, error, onCount]);

  const FilterChips = (showTypeFilter || showStatusFilter) && data && data.length > 0 ? (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {showTypeFilter && (
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>All</FilterChip>
          {contentTypes.map((ct) => {
            const meta = CONTENT_TYPES_BY_ID[ct as ContentTypeId];
            return (
              <FilterChip key={ct} active={typeFilter === ct} onClick={() => setTypeFilter(ct)}>
                {meta?.short ?? ct}
              </FilterChip>
            );
          })}
        </div>
      )}
      {showStatusFilter && (
        <div className="flex flex-wrap gap-1.5 ml-auto">
          <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>All statuses</FilterChip>
          {PROJECT_STATUSES.map((s) => (
            <FilterChip key={s.id} active={statusFilter === s.id} onClick={() => setStatusFilter(s.id)}>
              {s.label}
            </FilterChip>
          ))}
        </div>
      )}
    </div>
  ) : null;


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
    if (hideEmptyState) return null;
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
            <Plus className="w-4 h-4" /> {emptyLabel}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {Header}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {data.map((p) => {
          const ct = (p.content_type ?? "").toLowerCase();
          const cardAspect: "portrait" | "landscape" | "square" =
            thumbnailAspect === "landscape" && (ct === "short_reel" || ct.includes("short") || ct.includes("reel"))
              ? "portrait"
              : thumbnailAspect === "landscape" && ct === "long_video"
              ? "landscape"
              : thumbnailAspect;
          const thumb =
            (p as { thumbnail_url?: string | null }).thumbnail_url ||
            (p as { cover_image_url?: string | null }).cover_image_url ||
            (p as { poster_url?: string | null }).poster_url ||
            null;
          return (
            <Link
              key={p.id}
              to="/projects/$id"
              params={{ id: p.id }}
              className="glass rounded-xl overflow-hidden hover:border-white/20 transition block border border-border group"
            >
              <ProjectThumbnail
                title={p.title}
                contentType={p.content_type}
                style={p.style}
                platform={p.platform}
                thumbnailUrl={thumb}
                status={(p as { status?: string | null }).status}
                aspect={cardAspect}
              />
              <div className="p-3">
                <div className="font-semibold line-clamp-2 text-sm">{p.title}</div>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                  {p.style && <span className="glass px-1.5 py-0.5 rounded">{p.style}</span>}
                  <span className="ml-auto">
                    {new Date(p.updated_at ?? p.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
