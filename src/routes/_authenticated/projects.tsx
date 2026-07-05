import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, FolderOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/projects")({ component: ProjectsList });

function ProjectsList() {
  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">Your <span className="gradient-text">Library</span></h1>
          <p className="text-muted-foreground mt-1">All saved projects in one place.</p>
        </div>
        <Link to="/create" className="rounded-lg gradient-primary text-white px-4 py-2.5 text-sm font-medium flex items-center gap-2">
          <Plus className="w-4 h-4" /> New
        </Link>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="glass rounded-xl h-40 animate-pulse" />)}
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <Link key={p.id} to="/projects/$id" params={{ id: p.id }} className="glass rounded-xl p-5 hover:border-white/20 transition block">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">{p.content_type}</div>
              <div className="mt-2 font-semibold line-clamp-2">{p.title}</div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {p.style && <span className="glass px-2 py-0.5 rounded">{p.style}</span>}
                {p.platform && <span className="glass px-2 py-0.5 rounded">{p.platform}</span>}
                {p.tone && <span className="glass px-2 py-0.5 rounded">{p.tone}</span>}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="glass rounded-2xl p-12 text-center">
          <FolderOpen className="w-10 h-10 mx-auto text-muted-foreground" />
          <h3 className="mt-3 font-semibold">No projects yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Generate your first project to fill your vault.</p>
          <Link to="/create" className="mt-5 inline-flex rounded-lg gradient-primary px-5 py-2.5 text-sm text-white font-medium">
            <Plus className="w-4 h-4 mr-2" /> New project
          </Link>
        </div>
      )}
    </div>
  );
}
