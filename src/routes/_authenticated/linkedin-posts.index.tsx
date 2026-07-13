import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Linkedin, Plus, ExternalLink, Copy, Trash2, Pencil, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useProjectDelete } from "@/hooks/use-project-delete";
import { buildLinkedInPost } from "@/lib/downloads";

export const Route = createFileRoute("/_authenticated/linkedin-posts/")({
  component: LinkedinPostsPage,
});

type Row = {
  id: string;
  title: string;
  status: string | null;
  publish_status: string;
  topic: string | null;
  audience: string | null;
  tone: string | null;
  created_at: string;
  updated_at: string;
  manually_published_at: string | null;
  metadata: Record<string, unknown> | null;
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "generated", label: "Ready" },
  { id: "scheduled", label: "Scheduled" },
  { id: "published", label: "Published" },
  { id: "failed", label: "Failed" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

function LinkedinPostsPage() {
  const [filter, setFilter] = useState<FilterId>("all");
  const del = useProjectDelete();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["linkedin-posts"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,title,status,publish_status,topic,audience,tone,created_at,updated_at,manually_published_at,metadata")
        .eq("content_type", "linkedin_post")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const rows = useMemo(() => {
    const list = data ?? [];
    if (filter === "all") return list;
    if (filter === "published") return list.filter((r) => r.publish_status === "published" || r.manually_published_at);
    if (filter === "scheduled") return list.filter((r) => r.publish_status === "scheduled");
    if (filter === "failed") return list.filter((r) => r.status === "failed" || r.publish_status === "failed");
    if (filter === "generated") return list.filter((r) => r.status === "generated" || r.status === "completed");
    if (filter === "draft") return list.filter((r) => !r.status || r.status === "draft");
    return list;
  }, [data, filter]);

  async function copyBody(row: Row) {
    const meta = (row.metadata ?? {}) as { body?: string; cta?: string; hashtags?: string[] };
    const text = buildLinkedInPost({
      caption: meta.body ?? "",
      hashtags: (meta.hashtags ?? []).join(" "),
      cta: meta.cta ?? "",
    });
    await navigator.clipboard.writeText(text);
    toast.success("LinkedIn post copied");
  }

  async function markPublished(row: Row) {
    const { error } = await supabase
      .from("projects")
      .update({ manually_published_at: new Date().toISOString(), publish_status: "manually_published" })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Marked as manually published");
    refetch();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3">
            <Linkedin className="w-7 h-7 text-[#0A66C2]" /> LinkedIn <span className="gradient-text">Posts</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            AI-written LinkedIn posts with headlines, hooks, hashtags and a ready-to-drop first comment.
          </p>
        </div>
        <Link
          to="/linkedin-posts/new"
          className="inline-flex items-center gap-2 rounded-xl gradient-primary text-white px-5 py-2.5 text-sm font-medium shadow-[var(--shadow-glow)]"
        >
          <Plus className="w-4 h-4" /> Create LinkedIn Post
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs border ${
              filter === f.id ? "gradient-primary text-white border-transparent" : "glass border-border"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center">
          <Linkedin className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No LinkedIn posts yet.</p>
          <Link
            to="/linkedin-posts/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg gradient-primary text-white px-4 py-2 text-sm"
          >
            <Plus className="w-4 h-4" /> Create your first post
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => {
            const meta = (row.metadata ?? {}) as {
              body?: string;
              post_type?: string;
              industry?: string;
              hashtags?: string[];
            };
            const status = row.publish_status === "published" || row.manually_published_at
              ? "Published"
              : row.publish_status === "scheduled"
                ? "Scheduled"
                : row.status === "generated" || row.status === "completed"
                  ? "Ready"
                  : row.status === "failed"
                    ? "Failed"
                    : "Draft";
            return (
              <div key={row.id} className="glass rounded-2xl p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to="/linkedin-posts/$id" params={{ id: row.id }} className="font-semibold text-base hover:underline truncate">
                        {row.title || "Untitled post"}
                      </Link>
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/5 border border-border/60 text-muted-foreground">
                        {meta.post_type ?? "Educational"}
                      </span>
                      <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                        status === "Published" ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
                        : status === "Scheduled" ? "border-amber-500/40 text-amber-200 bg-amber-500/10"
                        : status === "Ready" ? "border-[color:var(--neon-purple)]/50 text-foreground bg-white/5"
                        : status === "Failed" ? "border-rose-500/40 text-rose-200 bg-rose-500/10"
                        : "border-border/60 text-muted-foreground bg-white/[0.03]"
                      }`}>
                        {status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {row.audience || "General"} · {meta.industry || "—"} · Updated {new Date(row.updated_at).toLocaleDateString()}
                    </div>
                    {meta.body && (
                      <p className="mt-2 text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">{meta.body}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <Link
                      to="/linkedin-posts/$id"
                      params={{ id: row.id }}
                      className="px-3 py-1.5 text-xs rounded-lg border border-border/60 hover:bg-white/5 inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Open
                    </Link>
                    <Link
                      to="/linkedin-posts/$id/edit"
                      params={{ id: row.id }}
                      className="px-3 py-1.5 text-xs rounded-lg border border-border/60 hover:bg-white/5 inline-flex items-center gap-1"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </Link>
                    <button
                      onClick={() => copyBody(row)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-border/60 hover:bg-white/5 inline-flex items-center gap-1"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </button>
                    <button
                      onClick={() => markPublished(row)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-border/60 hover:bg-white/5 inline-flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Mark posted
                    </button>
                    <button
                      onClick={() => del({ id: row.id, title: row.title })}
                      className="px-3 py-1.5 text-xs rounded-lg border border-rose-500/40 text-rose-200 hover:bg-rose-500/10 inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
