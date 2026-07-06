import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Film, Video as VideoIcon, Trash2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/videos")({
  head: () => ({
    meta: [
      { title: "Videos — CreatorVaultAI" },
      { name: "description", content: "Every reel and long-form video you've generated, in one gallery." },
      { property: "og:title", content: "Videos — CreatorVaultAI" },
      { property: "og:description", content: "Every reel and long-form video you've generated, in one gallery." },
    ],
  }),
  component: VideosPage,
});

type VideoRow = {
  id: string; title: string; content_type: string | null;
  style: string | null; platform: string | null; tone: string | null;
  video_url: string | null;
  output_id: string | null;
};

function VideosPage() {
  const qc = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["videos"],
    queryFn: async (): Promise<VideoRow[]> => {
      const { data } = await supabase
        .from("projects")
        .select("id,title,content_type,style,platform,tone,generated_outputs(id,video_url)")
        .in("content_type", ["short_reel", "long_video"])
        .order("created_at", { ascending: false });
      return (data ?? []).map((p: {
        id: string; title: string; content_type: string | null;
        style: string | null; platform: string | null; tone: string | null;
        generated_outputs: { id: string; video_url: string | null }[] | { id: string; video_url: string | null } | null;
      }) => {
        const out = Array.isArray(p.generated_outputs) ? p.generated_outputs[0] : p.generated_outputs;
        return {
          id: p.id, title: p.title, content_type: p.content_type,
          style: p.style, platform: p.platform, tone: p.tone,
          video_url: out?.video_url ?? null,
          output_id: out?.id ?? null,
        };
      });
    },
  });

  async function deleteVideo(row: VideoRow) {
    if (!confirm(`Delete "${row.title}"? The video file and project will be removed.`)) return;
    setDeletingId(row.id);
    try {
      if (row.output_id) {
        await supabase.from("generated_outputs").delete().eq("id", row.output_id);
      }
      const { error } = await supabase.from("projects").delete().eq("id", row.id);
      if (error) throw error;
      toast.success("Video deleted");
      qc.invalidateQueries({ queryKey: ["videos"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">Your <span className="gradient-text">Videos</span></h1>
          <p className="text-muted-foreground mt-1">Reels and long-form videos you've rendered.</p>
        </div>
        <Link to="/create" className="rounded-lg gradient-primary text-white px-4 py-2.5 text-sm font-medium flex items-center gap-2">
          <Plus className="w-4 h-4" /> New video
        </Link>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="glass rounded-xl h-56 animate-pulse" />)}
        </div>
      ) : data && data.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((p) => {
            const isVertical = p.content_type === "short_reel" || p.platform === "tiktok" || p.platform === "instagram";
            return (
              <Link key={p.id} to="/projects/$id" params={{ id: p.id }}
                className="glass rounded-xl overflow-hidden hover:border-white/20 transition block group">
                <div className={`relative ${isVertical ? "aspect-[4/5]" : "aspect-video"} bg-black overflow-hidden`}>
                  {p.video_url ? (
                    <video src={p.video_url} muted loop playsInline preload="metadata"
                      onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                      onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                      className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[color:var(--neon-purple)]/25 to-[color:var(--neon-pink)]/10">
                      <div className="text-center text-muted-foreground">
                        <Film className="w-10 h-10 mx-auto opacity-60" />
                        <div className="text-[10px] uppercase tracking-wider mt-1">No render yet</div>
                      </div>
                    </div>
                  )}
                  <div className="absolute top-2 left-2 flex gap-1">
                    <span className="text-[10px] uppercase tracking-wider bg-black/60 backdrop-blur text-white px-2 py-0.5 rounded">{p.content_type}</span>
                    {p.video_url && (
                      <span className="text-[10px] uppercase tracking-wider gradient-primary text-white px-2 py-0.5 rounded flex items-center gap-1">
                        <VideoIcon className="w-3 h-3" /> Video
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-4">
                  <div className="font-semibold line-clamp-2">{p.title}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {p.style && <span className="glass px-2 py-0.5 rounded">{p.style}</span>}
                    {p.platform && <span className="glass px-2 py-0.5 rounded">{p.platform}</span>}
                    {p.tone && <span className="glass px-2 py-0.5 rounded">{p.tone}</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="glass rounded-2xl p-12 text-center">
          <Film className="w-10 h-10 mx-auto text-muted-foreground" />
          <h3 className="mt-3 font-semibold">No videos yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Create a short reel or long-form video to fill this gallery.</p>
          <Link to="/create" className="mt-5 inline-flex rounded-lg gradient-primary px-5 py-2.5 text-sm text-white font-medium">
            <Plus className="w-4 h-4 mr-2" /> New video
          </Link>
        </div>
      )}
    </div>
  );
}
