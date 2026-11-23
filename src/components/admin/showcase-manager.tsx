// Admin → Landing → "Made with CreatorFlow AI" showcase.
// Pick a video this account generated (AI Video Studio library or a project
// render) — it is copied to the public "landing" bucket so it plays forever —
// or upload a file. Each item carries the exact prompt that produced it.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown, ArrowUp, Eye, EyeOff, Film, Loader2, Pencil, Plus, Sparkles, Trash2, Upload, X,
} from "lucide-react";
import type { LandingMediaRow } from "@/lib/landing-media.functions";

export type ShowcaseDraft = Partial<LandingMediaRow> & { kind: "showcase" };

export const SHOWCASE_TOOLS = [
  "AI Video Studio", "AI Studio", "Model Studio", "Business Promo", "Ad Creatives", "Series Autopilot",
] as const;

type Candidate = {
  ref: string;
  title: string;
  prompt: string;
  tool: string;
  when: string;
  /** Loads the video (and poster, if any) as blobs, in the admin's browser. */
  load: () => Promise<{ video: Blob; poster: Blob | null }>;
};

async function uploadBlob(blob: Blob, folder: string, ext: string): Promise<string> {
  const { supabase } = await import("@/integrations/supabase/client");
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("landing").upload(path, blob, {
    contentType: blob.type || (ext === "webm" ? "video/webm" : ext === "jpg" ? "image/jpeg" : "video/mp4"),
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return supabase.storage.from("landing").getPublicUrl(path).data.publicUrl;
}

const extOf = (b: Blob, fallback: string) =>
  b.type.includes("webm") ? "webm" : b.type.includes("mp4") ? "mp4" : b.type.includes("png") ? "png" : b.type.includes("jpeg") ? "jpg" : fallback;

/** Every video this account generated: AI Video Studio library + project renders. */
async function loadCandidates(): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const { getGeneratedVideos } = await import("@/lib/videoLocalStore");
  const { getBlob } = await import("@/lib/blob-store");
  for (const v of await getGeneratedVideos()) {
    out.push({
      ref: `video:${v.id}`,
      title: v.title || "AI video",
      prompt: (v.topic || v.title || "").trim(),
      tool: "AI Video Studio",
      when: v.created_at,
      load: async () => {
        const video = await getBlob(v.video_blob_key);
        if (!video) throw new Error("This video file isn't on this device. Open AI Video Studio here once so it syncs, then try again.");
        const poster = v.thumbnail_blob_key ? await getBlob(v.thumbnail_blob_key) : null;
        return { video, poster };
      },
    });
  }
  const { listOutputs } = await import("@/lib/local-store");
  const outputs = (await listOutputs()).filter((o) => !!o.video_url);
  if (outputs.length) {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: projects } = await supabase.from("projects")
      .select("id, title, topic, content_type").in("id", outputs.map((o) => o.project_id));
    const byId = new Map((projects ?? []).map((p) => [p.id, p]));
    for (const o of outputs) {
      const p = byId.get(o.project_id);
      out.push({
        ref: `project:${o.project_id}`,
        title: o.title || p?.title || "Project video",
        prompt: (p?.topic || o.title || "").trim(),
        tool: p?.content_type === "promo_video" ? "Business Promo" : "AI Studio",
        when: o.updated_at,
        load: async () => {
          const res = await fetch(o.video_url!);
          if (!res.ok) throw new Error("This project's video link has expired. Open the project and render it again, then add it here.");
          return { video: await res.blob(), poster: null };
        },
      });
    }
  }
  return out.sort((a, b) => (a.when < b.when ? 1 : -1));
}

export function ShowcaseManager({ rows, isLoading, onSave, onDelete, onReorder, onPreview }: {
  rows: LandingMediaRow[];
  isLoading: boolean;
  onSave: (d: ShowcaseDraft) => Promise<unknown>;
  onDelete: (id: string) => void;
  onReorder: (items: { id: string; display_order: number }[]) => void;
  onPreview: (url: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<ShowcaseDraft | null>(null);

  const move = (id: string, dir: -1 | 1) => {
    const i = rows.findIndex((r) => r.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onReorder(next.map((r, idx) => ({ id: r.id, display_order: idx })));
  };

  return (
    <div className="glass rounded-2xl p-5 border border-orange-500/20 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-orange-300" /> Made with CreatorFlow AI (showcase)</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Real videos generated in CreatorFlow, each with the prompt that made it. Shown as a sliding row on the landing page.
            Only published items appear. Aim for 6–9 varied, short clips (10–30 s).
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPicking(true)} className="rounded-lg gradient-primary text-white px-3 py-2 text-sm inline-flex items-center gap-1.5">
            <Film className="w-4 h-4" /> Add from my videos
          </button>
          <button onClick={() => setEditing({ kind: "showcase", status: "draft", display_order: rows.length, consent_confirmed: false, tool: "AI Video Studio" })}
            className="rounded-lg glass border border-border px-3 py-2 text-sm inline-flex items-center gap-1.5">
            <Upload className="w-4 h-4" /> Upload a video
          </button>
        </div>
      </div>

      {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
      {!isLoading && !rows.length && (
        <div className="text-sm text-muted-foreground rounded-xl border border-dashed border-white/15 p-6 text-center">
          No showcase videos yet. The section stays hidden on the landing page until you publish at least one.
        </div>
      )}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((r, i) => (
          <div key={r.id} className="rounded-xl border border-white/10 overflow-hidden bg-black/20 flex flex-col">
            <button type="button" onClick={() => r.video_url && onPreview(r.video_url)} className="relative aspect-video bg-black">
              {r.video_url && <video src={`${r.video_url}#t=0.5`} poster={r.poster_url ?? undefined} muted preload="metadata" className="w-full h-full object-cover" />}
              <span className={`absolute top-2 left-2 text-[10px] uppercase px-2 py-0.5 rounded-full font-semibold ${r.status === "published" ? "bg-emerald-500/80 text-white" : "bg-white/20 text-white"}`}>{r.status}</span>
            </button>
            <div className="p-3 space-y-1 flex-1">
              <div className="text-sm font-semibold truncate">{r.title || "Untitled"}</div>
              {r.tool && <div className="text-[11px] text-orange-300">{r.tool}</div>}
              <p className="text-xs text-muted-foreground line-clamp-3">{r.prompt || <span className="text-amber-300">No prompt yet</span>}</p>
            </div>
            <div className="flex items-center gap-1 p-2 border-t border-white/10">
              <IconBtn label="Edit" onClick={() => setEditing({ ...r, kind: "showcase" })}><Pencil className="w-3.5 h-3.5" /></IconBtn>
              <IconBtn label={r.status === "published" ? "Unpublish" : "Publish"}
                onClick={() => onSave({ ...r, kind: "showcase", status: r.status === "published" ? "draft" : "published" }).catch((e) => toast.error(e instanceof Error ? e.message : "Failed"))}>
                {r.status === "published" ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </IconBtn>
              <IconBtn label="Move left" disabled={i === 0} onClick={() => move(r.id, -1)}><ArrowUp className="w-3.5 h-3.5 -rotate-90" /></IconBtn>
              <IconBtn label="Move right" disabled={i === rows.length - 1} onClick={() => move(r.id, 1)}><ArrowDown className="w-3.5 h-3.5 -rotate-90" /></IconBtn>
              <div className="flex-1" />
              <IconBtn label="Remove" onClick={() => onDelete(r.id)}><Trash2 className="w-3.5 h-3.5 text-rose-300" /></IconBtn>
            </div>
          </div>
        ))}
      </div>

      {picking && (
        <PickerModal
          onClose={() => setPicking(false)}
          onPicked={(d) => { setPicking(false); setEditing({ ...d, display_order: rows.length }); }}
        />
      )}
      {editing && (
        <ShowcaseEditor
          value={editing}
          onClose={() => setEditing(null)}
          onSave={async (d) => { await onSave(d); setEditing(null); }}
        />
      )}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="p-1.5 rounded-md hover:bg-white/10 disabled:opacity-30">{children}</button>
  );
}

function PickerModal({ onClose, onPicked }: { onClose: () => void; onPicked: (d: ShowcaseDraft) => void }) {
  const [items, setItems] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    loadCandidates().then(setItems).catch((e) => setLoadErr(e instanceof Error ? e.message : "Couldn't load your videos"));
  }, []);

  async function pick(c: Candidate) {
    setBusy(c.ref);
    try {
      const { video, poster } = await c.load();
      if (video.size > 50 * 1024 * 1024) throw new Error("This video is over 50 MB. Use a shorter clip for the landing page.");
      const videoUrl = await uploadBlob(video, "showcase", extOf(video, "mp4"));
      const posterUrl = poster ? await uploadBlob(poster, "showcase", extOf(poster, "jpg")) : null;
      onPicked({
        kind: "showcase", status: "draft", consent_confirmed: false,
        title: c.title, prompt: c.prompt, tool: c.tool, source_ref: c.ref,
        video_url: videoUrl, video_type: videoUrl.endsWith(".webm") ? "webm" : "mp4", poster_url: posterUrl,
      });
      toast.success("Video copied — check the prompt, then save");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add this video");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass rounded-2xl p-5 max-w-3xl w-full max-h-[85vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Pick a video you generated</h3>
          <button aria-label="Close" onClick={onClose} className="p-1 rounded hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>
        {loadErr && <div className="text-sm text-rose-300">{loadErr}</div>}
        {!items && !loadErr && <Loader2 className="w-5 h-5 animate-spin" />}
        {items && !items.length && (
          <div className="text-sm text-muted-foreground">
            No generated videos found on this device. Make one in AI Video Studio or AI Studio first, or use "Upload a video".
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-2">
          {items?.map((c) => (
            <button key={c.ref} type="button" disabled={!!busy} onClick={() => pick(c)}
              className="text-left rounded-xl border border-white/10 p-3 hover:bg-white/5 disabled:opacity-50 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold truncate">{c.title}</span>
                {busy === c.ref ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Plus className="w-4 h-4 shrink-0" />}
              </div>
              <div className="text-[11px] text-orange-300">{c.tool} · {new Date(c.when).toLocaleDateString()}</div>
              <p className="text-xs text-muted-foreground line-clamp-2">{c.prompt || "No prompt saved"}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ShowcaseEditor({ value, onClose, onSave }: {
  value: ShowcaseDraft;
  onClose: () => void;
  onSave: (d: ShowcaseDraft) => Promise<void>;
}) {
  const [d, setD] = useState<ShowcaseDraft>(value);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof ShowcaseDraft>(k: K, v: ShowcaseDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const input = "w-full text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500/60";
  const label = "text-xs text-muted-foreground block mb-1";

  async function onFile(f: File | null, kind: "video" | "poster") {
    if (!f) return;
    if (kind === "video" && f.size > 50 * 1024 * 1024) { toast.error("Video must be under 50 MB"); return; }
    setUploading(true);
    try {
      const url = await uploadBlob(f, "showcase", extOf(f, kind === "video" ? "mp4" : "jpg"));
      if (kind === "video") setD((x) => ({ ...x, video_url: url, video_type: url.endsWith(".webm") ? "webm" : "mp4" }));
      else set("poster_url", url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function save(status: "draft" | "published") {
    setBusy(true);
    try { await onSave({ ...d, status }); toast.success(status === "published" ? "Published on the landing page" : "Saved as draft"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass rounded-2xl p-5 max-w-xl w-full max-h-[90vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{d.id ? "Edit showcase video" : "New showcase video"}</h3>
          <button aria-label="Close" onClick={onClose} className="p-1 rounded hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>
        <div className="rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center">
          {d.video_url
            ? <video src={d.video_url} poster={d.poster_url ?? undefined} controls className="w-full h-full object-contain" />
            : <label className="text-sm text-muted-foreground cursor-pointer inline-flex items-center gap-2">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload MP4 / WebM (max 50 MB)
                <input type="file" accept="video/mp4,video/webm" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null, "video")} />
              </label>}
        </div>
        <div><label className={label}>Prompt shown under the video *</label>
          <textarea value={d.prompt ?? ""} onChange={(e) => set("prompt", e.target.value)} rows={4} maxLength={1500}
            placeholder='e.g. The golden retriever on the left says: "Bro, the mailman is not your enemy."' className={input} />
          <p className="text-[11px] text-muted-foreground mt-1">Use the real prompt that produced this video — visitors will try it themselves.</p></div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className={label}>Title (for you; shown on hover)</label>
            <input value={d.title ?? ""} onChange={(e) => set("title", e.target.value)} maxLength={200} className={input} /></div>
          <div><label className={label}>Made with</label>
            <select value={d.tool ?? ""} onChange={(e) => set("tool", e.target.value)} className={input}>
              {SHOWCASE_TOOLS.map((t) => <option key={t}>{t}</option>)}
            </select></div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label className="rounded-lg glass border border-border px-3 py-1.5 cursor-pointer inline-flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" /> {d.poster_url ? "Change cover image" : "Add cover image (optional)"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null, "poster")} />
          </label>
          {d.video_url && <label className="rounded-lg glass border border-border px-3 py-1.5 cursor-pointer inline-flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" /> Replace video
            <input type="file" accept="video/mp4,video/webm" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null, "video")} />
          </label>}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button disabled={busy || uploading} onClick={() => save("draft")} className="rounded-lg glass border border-border px-4 py-2 text-sm">Save draft</button>
          <button disabled={busy || uploading || !d.video_url || !(d.prompt ?? "").trim()} onClick={() => save("published")}
            className="rounded-lg gradient-primary text-white px-4 py-2 text-sm inline-flex items-center gap-1.5 disabled:opacity-60">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Publish
          </button>
        </div>
      </div>
    </div>
  );
}
