import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Linkedin, ArrowLeft, Copy, Pencil, CheckCircle2, Copy as Dup } from "lucide-react";
import { toast } from "sonner";
import { buildLinkedInPost } from "@/lib/downloads";
import { useProjectDelete } from "@/hooks/use-project-delete";
import { LinkedinCarouselStudio } from "@/components/linkedin-carousel-studio";
import { LinkedinImageStudio, type LinkedinImageState } from "@/components/linkedin-image-studio";
import { PublishActions } from "@/components/publish-actions";
import type { LinkedinCarouselContent } from "@/lib/linkedin-carousel-ai.functions";

export const Route = createFileRoute("/_authenticated/linkedin-posts/$id")({
  component: LinkedinPostViewPage,
});

type ProjectRow = {
  id: string;
  title: string;
  status: string | null;
  publish_status: string;
  manually_published_at: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
  topic: string | null;
  audience: string | null;
  tone: string | null;
  user_id: string;
};

function LinkedinPostViewPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const del = useProjectDelete();
  const [tab, setTab] = useState<"post" | "image" | "carousel">("post");

  const { data: project, isLoading, refetch } = useQuery({
    queryKey: ["linkedin-post", id],
    queryFn: async (): Promise<ProjectRow | null> => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data as ProjectRow | null);
    },
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!project) return <div className="text-sm text-muted-foreground">Post not found.</div>;
  const data = project;

  const meta = (data.metadata ?? {}) as {
    headlines?: string[]; hooks?: string[]; recommended_hook?: string;
    body?: string; alternate_body?: string; cta?: string;
    hashtags?: string[]; keywords?: string[]; first_comment?: string;
    engagement_strategy?: string; image_concept?: string; image_prompt?: string;
    carousel_concept?: string; accessibility_alt?: string;
    post_type?: string; industry?: string; goal?: string; language?: string; brand?: string;
    carousel?: LinkedinCarouselContent | null;
    linkedin_image?: LinkedinImageState | null;
  };

  async function saveMetaPatch(patch: Record<string, unknown>) {
    const nextMeta = { ...(data.metadata ?? {}), ...patch };
    const { error } = await supabase.from("projects").update({ metadata: nextMeta as never }).eq("id", data.id);
    if (error) toast.error("Save failed", { description: error.message });
    else qc.invalidateQueries({ queryKey: ["linkedin-post", id] });
  }

  async function copy(text: string) { await navigator.clipboard.writeText(text); toast.success("Copied"); }

  async function copyFull() {
    const text = buildLinkedInPost({
      caption: meta.body ?? "",
      hashtags: (meta.hashtags ?? []).join(" "),
      cta: meta.cta ?? "",
    });
    await navigator.clipboard.writeText(text);
    toast.success("LinkedIn post copied");
  }

  async function duplicate() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return toast.error("Not signed in");
    const { data: created, error } = await supabase.from("projects").insert({
      user_id: uid,
      title: (data.title || "Untitled") + " (copy)",
      topic: data.topic, audience: data.audience, tone: data.tone,
      content_type: "linkedin_post", format: "text",
      status: "draft", publish_status: "unpublished",
      metadata: (data.metadata ?? {}) as never,
    }).select("id").single();
    if (error) return toast.error(error.message);
    toast.success("Duplicated");
    qc.invalidateQueries({ queryKey: ["linkedin-posts"] });
    window.location.assign(`/linkedin-posts/${created.id}`);
  }

  async function markPublished() {
    const { error } = await supabase.from("projects").update({
      manually_published_at: new Date().toISOString(),
      publish_status: "manually_published",
    }).eq("id", data.id);
    if (error) return toast.error(error.message);
    toast.success("Marked as manually published");
    refetch();
  }

  async function download() {
    const text = buildLinkedInPost({
      caption: meta.body ?? "",
      hashtags: (meta.hashtags ?? []).join(" "),
      cta: meta.cta ?? "",
    });
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(data.title || "linkedin-post").replace(/[^\w-]+/g, "_")}.txt`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  const status = data.publish_status === "published" || data.manually_published_at
    ? "Published"
    : data.publish_status === "scheduled" ? "Scheduled"
    : data.status === "generated" || data.status === "completed" ? "Ready"
    : data.status === "failed" ? "Failed" : "Draft";

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link to="/linkedin-posts" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> All LinkedIn posts
        </Link>
      </div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
            <Linkedin className="w-6 h-6 text-[#0A66C2]" />
            <span className="truncate">{data.title}</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {meta.post_type ?? "Educational"} · {meta.industry ?? "—"} · {data.audience || "General"} · <span className="text-foreground">{status}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/linkedin-posts/$id/edit" params={{ id }} className="px-3 py-1.5 text-xs rounded-lg border border-border/60 hover:bg-white/5 inline-flex items-center gap-1"><Pencil className="w-3.5 h-3.5" /> Edit</Link>
          <button onClick={copyFull} className="px-3 py-1.5 text-xs rounded-lg gradient-primary text-white inline-flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> Copy for LinkedIn</button>
          <button onClick={download} className="px-3 py-1.5 text-xs rounded-lg border border-border/60 hover:bg-white/5">Download .txt</button>
          <button onClick={duplicate} className="px-3 py-1.5 text-xs rounded-lg border border-border/60 hover:bg-white/5 inline-flex items-center gap-1"><Dup className="w-3.5 h-3.5" /> Duplicate</button>
          <button onClick={markPublished} className="px-3 py-1.5 text-xs rounded-lg border border-border/60 hover:bg-white/5 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Mark posted</button>
          <button onClick={() => del({ id: data.id, title: data.title })} className="px-3 py-1.5 text-xs rounded-lg border border-rose-500/40 text-rose-200 hover:bg-rose-500/10">Delete</button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border/40">
        {(["post", "image", "carousel"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-xs uppercase tracking-wide border-b-2 -mb-px ${tab === k ? "border-[color:var(--brand-orange)] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {k === "post" ? "Post" : k === "image" ? "LinkedIn image" : "Document carousel"}
          </button>
        ))}
      </div>

      {tab === "post" && (
        <>
          <div className="glass rounded-2xl p-5">
            <h2 className="font-semibold mb-2">Post body</h2>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{meta.body}</p>
          </div>

          {meta.alternate_body && (
            <div className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold">Alternate version</h2>
                <button onClick={() => copy(meta.alternate_body ?? "")} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> Copy</button>
              </div>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{meta.alternate_body}</p>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {meta.headlines && meta.headlines.length > 0 && (
              <div className="glass rounded-2xl p-5">
                <h2 className="font-semibold mb-2">Headlines</h2>
                <ul className="space-y-1.5 text-sm">
                  {meta.headlines.map((h, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted-foreground w-5">{i + 1}.</span>
                      <span className="flex-1">{h}</span>
                      <button onClick={() => copy(h)} className="text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {meta.hooks && meta.hooks.length > 0 && (
              <div className="glass rounded-2xl p-5">
                <h2 className="font-semibold mb-2">Hooks</h2>
                <ul className="space-y-1.5 text-sm">
                  {meta.hooks.map((h, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-[color:var(--neon-pink)] w-5">→</span>
                      <span className="flex-1">{h}</span>
                      <button onClick={() => copy(h)} className="text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {meta.cta && (
              <div className="glass rounded-2xl p-5">
                <h2 className="font-semibold mb-2">CTA</h2>
                <p className="text-sm">{meta.cta}</p>
              </div>
            )}
            {meta.first_comment && (
              <div className="glass rounded-2xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-semibold">First comment</h2>
                  <button onClick={() => copy(meta.first_comment ?? "")} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> Copy</button>
                </div>
                <p className="text-sm whitespace-pre-wrap">{meta.first_comment}</p>
              </div>
            )}
          </div>

          {meta.hashtags && meta.hashtags.length > 0 && (
            <div className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold">Hashtags</h2>
                <button onClick={() => copy((meta.hashtags ?? []).join(" "))} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> Copy all</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {meta.hashtags.map((h) => <span key={h} className="text-xs glass px-2 py-1 rounded-full">{h}</span>)}
              </div>
            </div>
          )}

          {meta.engagement_strategy && (
            <div className="glass rounded-2xl p-5">
              <h2 className="font-semibold mb-2">Engagement strategy</h2>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{meta.engagement_strategy}</p>
            </div>
          )}
        </>
      )}

      {tab === "image" && (
        <LinkedinImageStudio
          topic={data.topic ?? data.title}
          suggestedPrompt={meta.image_prompt}
          suggestedHeadline={meta.recommended_hook || meta.headlines?.[0] || data.title}
          suggestedBrand={meta.brand}
          initial={meta.linkedin_image ?? null}
          onChange={(s) => { void saveMetaPatch({ linkedin_image: s }); }}
        />
      )}

      {tab === "carousel" && (
        <LinkedinCarouselStudio
          topic={data.topic ?? data.title}
          audience={data.audience ?? ""}
          tone={data.tone ?? "Professional"}
          body={meta.body ?? ""}
          brand={meta.brand ?? ""}
          cta={meta.cta ?? ""}
          initial={meta.carousel ?? null}
          onChange={(c) => { void saveMetaPatch({ carousel: c }); }}
        />
      )}
    </div>
  );
}
