import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStyleImage } from "@/lib/constants";
import { toast } from "sonner";
import { Copy, Download, ArrowLeft, Loader2, Play, Pause, SkipForward, SkipBack, Film } from "lucide-react";

export const Route = createFileRoute("/_authenticated/projects/$id")({ component: ProjectView });

function ProjectView() {
  const { id } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const [{ data: project }, { data: output }] = await Promise.all([
        supabase.from("projects").select("*").eq("id", id).maybeSingle(),
        supabase.from("generated_outputs").select("*").eq("project_id", id).maybeSingle(),
      ]);
      return { project, output };
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!data?.project) {
    return <div className="glass rounded-2xl p-12 text-center">Project not found. <Link to="/projects" className="text-[color:var(--neon-purple)]">Back to library</Link></div>;
  }

  const { project, output } = data;

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  }

  function download() {
    const blob = new Blob([JSON.stringify({ project, output }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${project.title.replace(/[^\w]+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const scenes = (output?.scenes as Array<{ n: number; visual: string; voiceover: string; duration: string }>) ?? [];
  const prompts = (output?.image_prompts as Array<{ n: number; prompt: string; style: string }>) ?? [];
  const thumbs = (output?.thumbnail_ideas as string[]) ?? [];

  return (
    <div className="space-y-6 max-w-6xl">
      <Link to="/projects" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to library
      </Link>

      {/* Header */}
      <div className="glass rounded-2xl p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="gradient-primary text-white px-2.5 py-1 rounded-full">{project.content_type}</span>
          {project.platform && <span className="glass px-2.5 py-1 rounded-full">{project.platform}</span>}
          {project.tone && <span className="glass px-2.5 py-1 rounded-full">{project.tone}</span>}
          {project.style && <span className="glass px-2.5 py-1 rounded-full">{project.style}</span>}
        </div>
        <h1 className="mt-4 text-2xl md:text-3xl font-bold">{output?.title ?? project.title}</h1>
        {output?.hook && <p className="mt-3 text-lg text-muted-foreground italic">"{output.hook}"</p>}

        <div className="mt-6 flex flex-wrap gap-2">
          {output?.script && <button onClick={() => copy(output.script!, "Script")} className="rounded-lg glass px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/5"><Copy className="w-4 h-4" /> Copy Script</button>}
          {output?.captions && <button onClick={() => copy(output.captions!, "Caption")} className="rounded-lg glass px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/5"><Copy className="w-4 h-4" /> Copy Caption</button>}
          <button onClick={download} className="rounded-lg gradient-primary text-white px-4 py-2 text-sm flex items-center gap-2"><Download className="w-4 h-4" /> Download JSON</button>
        </div>
      </div>

      {/* Video Preview — auto-playing storyboard reel */}
      <VideoPreview
        scenes={scenes}
        title={output?.title ?? project.title}
        styleImage={getStyleImage(project.style)}
        platform={project.platform}
        contentType={project.content_type}
        music={project.music}
      />



      <div className="grid lg:grid-cols-2 gap-6">
        {/* Script */}
        <div className="glass rounded-2xl p-6">
          <h2 className="font-semibold mb-3">Full Script</h2>
          <pre className="text-sm whitespace-pre-wrap text-muted-foreground font-mono leading-relaxed">{output?.script}</pre>
        </div>

        {/* Scenes */}
        <div className="glass rounded-2xl p-6">
          <h2 className="font-semibold mb-3">Scene Breakdown</h2>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {scenes.map((s) => (
              <div key={s.n} className="border border-border/50 rounded-lg p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="gradient-primary text-white px-2 py-0.5 rounded">Scene {s.n}</span>
                  <span className="text-muted-foreground">{s.duration}</span>
                </div>
                <div className="mt-2 text-sm">{s.visual}</div>
                <div className="mt-1 text-xs text-muted-foreground">🎙 {s.voiceover}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Image prompts */}
        <div className="glass rounded-2xl p-6">
          <h2 className="font-semibold mb-3">Image Prompts (B-roll)</h2>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {prompts.map((p) => (
              <div key={p.n} className="border border-border/50 rounded-lg p-3 text-sm">
                <div className="text-xs text-muted-foreground mb-1">Shot #{p.n} · {p.style}</div>
                {p.prompt}
              </div>
            ))}
          </div>
        </div>

        {/* Captions & hashtags */}
        <div className="glass rounded-2xl p-6">
          <h2 className="font-semibold mb-3">Captions</h2>
          <div className="text-sm text-muted-foreground whitespace-pre-wrap max-h-64 overflow-y-auto">{output?.captions}</div>
          <h3 className="mt-4 font-semibold text-sm">Hashtags</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(output?.hashtags ?? []).map((h) => (
              <span key={h} className="text-xs glass px-2 py-1 rounded-full">{h}</span>
            ))}
          </div>
        </div>

        {/* Thumbnails */}
        <div className="glass rounded-2xl p-6 lg:col-span-2">
          <h2 className="font-semibold mb-3">Thumbnail Ideas</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {thumbs.map((t, i) => (
              <div key={i} className="border border-border/50 rounded-lg p-4 text-sm">
                <div className="text-xs text-[color:var(--neon-pink)] mb-1">Concept {i + 1}</div>
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><div className="text-xs text-muted-foreground">Voice</div><div className="font-medium">{project.voice}</div></div>
        <div><div className="text-xs text-muted-foreground">Music</div><div className="font-medium">{project.music}</div></div>
        <div><div className="text-xs text-muted-foreground">Topic</div><div className="font-medium">{project.topic}</div></div>
        <div><div className="text-xs text-muted-foreground">Audience</div><div className="font-medium">{project.audience || "—"}</div></div>
      </div>
    </div>
  );
}
