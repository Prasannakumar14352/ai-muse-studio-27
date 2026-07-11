import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Linkedin, ArrowLeft, Save } from "lucide-react";
import type { LinkedinPostContent } from "@/lib/linkedin-ai.functions";

export const Route = createFileRoute("/_authenticated/linkedin-posts/$id/edit")({
  component: EditLinkedinPostPage,
});

type Row = {
  id: string;
  title: string;
  status: string | null;
  metadata: Record<string, unknown> | null;
};

function EditLinkedinPostPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<LinkedinPostContent | null>(null);
  const [saving, setSaving] = useState(false);
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["linkedin-post-edit", id],
    queryFn: async (): Promise<Row | null> => {
      const { data, error } = await supabase.from("projects").select("id,title,status,metadata").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
  });

  useEffect(() => {
    if (!data) return;
    setTitle(data.title);
    setContent((data.metadata ?? {}) as LinkedinPostContent);
  }, [data]);

  async function saveNow(next: { title: string; content: LinkedinPostContent | null; silent?: boolean }) {
    if (!next.content) return;
    setSaving(true);
    const { error } = await supabase.from("projects").update({
      title: next.title,
      metadata: next.content as never,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    setSaving(false);
    if (error) {
      toast.error("Autosave failed", { description: error.message });
      return;
    }
    if (!next.silent) toast.success("Saved");
  }

  function scheduleAutosave(nextTitle: string, nextContent: LinkedinPostContent | null) {
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      saveNow({ title: nextTitle, content: nextContent, silent: true });
    }, 1200);
  }

  function patch<K extends keyof LinkedinPostContent>(key: K, value: LinkedinPostContent[K]) {
    if (!content) return;
    const next = { ...content, [key]: value };
    setContent(next);
    scheduleAutosave(title, next);
  }

  if (isLoading || !content) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link to="/linkedin-posts/$id" params={{ id }} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to post
        </Link>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
          <Linkedin className="w-6 h-6 text-[#0A66C2]" /> Edit LinkedIn Post
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{saving ? "Saving…" : "Autosaved"}</span>
          <button
            onClick={async () => { await saveNow({ title, content }); navigate({ to: "/linkedin-posts/$id", params: { id } }); }}
            className="px-3 py-1.5 text-xs rounded-lg gradient-primary text-white inline-flex items-center gap-1"
          >
            <Save className="w-3.5 h-3.5" /> Save & close
          </button>
        </div>
      </div>

      <label className="block glass rounded-2xl p-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Title</div>
        <input
          value={title}
          onChange={(e) => { setTitle(e.target.value); scheduleAutosave(e.target.value, content); }}
          className="w-full bg-input/50 border border-border rounded-lg px-4 py-2.5"
        />
      </label>

      <TextBlock label="Recommended hook" value={content.recommended_hook ?? ""} onChange={(v) => patch("recommended_hook", v)} rows={2} />
      <TextBlock label="Post body" value={content.body ?? ""} onChange={(v) => patch("body", v)} rows={14} />
      <TextBlock label="Alternate version" value={content.alternate_body ?? ""} onChange={(v) => patch("alternate_body", v)} rows={8} />
      <TextBlock label="CTA" value={content.cta ?? ""} onChange={(v) => patch("cta", v)} rows={2} />
      <TextBlock label="First comment" value={content.first_comment ?? ""} onChange={(v) => patch("first_comment", v)} rows={4} />

      <div className="glass rounded-2xl p-5 space-y-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Hashtags (space or comma separated)</div>
        <input
          value={(content.hashtags ?? []).join(" ")}
          onChange={(e) => {
            const tags = e.target.value.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean)
              .map((t) => (t.startsWith("#") ? t : "#" + t));
            patch("hashtags", tags);
          }}
          className="w-full bg-input/50 border border-border rounded-lg px-4 py-2.5"
        />
        <div className="flex flex-wrap gap-1.5">
          {(content.hashtags ?? []).map((h) => <span key={h} className="text-xs glass px-2 py-1 rounded-full">{h}</span>)}
        </div>
      </div>

      <TextBlock label="Engagement strategy" value={content.engagement_strategy ?? ""} onChange={(v) => patch("engagement_strategy", v)} rows={4} />
    </div>
  );
}

function TextBlock({ label, value, onChange, rows }: { label: string; value: string; onChange: (v: string) => void; rows: number }) {
  return (
    <label className="block glass rounded-2xl p-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">{label}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full bg-input/50 border border-border rounded-lg px-4 py-3 text-sm whitespace-pre-wrap"
      />
    </label>
  );
}
