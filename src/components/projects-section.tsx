// Reusable "Your projects" grid that lists backend projects filtered by
// content_type and links each card to the unified project editor at
// `/projects/$id`. Used from the Videos, Images and Thumbnails tabs so the
// same projects that appear on the Dashboard are also visible in their
// respective category tabs.

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, FolderOpen } from "lucide-react";

type Props = {
  /** Content-type values in the `projects.content_type` column. */
  contentTypes: string[];
  /** Section heading, e.g. "Your video projects". */
  title: string;
  /** Unique key suffix for the query cache. */
  cacheKey: string;
  /** Max cards to show. */
  limit?: number;
};

export function ProjectsSection({ contentTypes, title, cacheKey, limit = 24 }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["projects-section", cacheKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, title, content_type, created_at, style, platform")
        .in("content_type", contentTypes)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) {
    return (
      <div className="glass rounded-2xl p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading your projects…
      </div>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-[color:var(--neon-pink)]" /> {title}
        </h2>
        <span className="text-xs text-muted-foreground">{data.length} saved</span>
      </div>
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
