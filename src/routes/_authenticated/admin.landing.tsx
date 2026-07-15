import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowLeft, Info, Plus, Trash2, Save, Eye, EyeOff, ArrowUp, ArrowDown,
  Play, AlertCircle, Loader2,
} from "lucide-react";
import { useAccess } from "@/lib/access";
import { CreatorFlowSelect } from "@/components/ui/creator-flow-select";
import {
  listAllLandingMedia, upsertLandingMedia, deleteLandingMedia, setLandingMediaOrder,
  type LandingMediaRow, type LandingMediaKind, type LandingVideoType, type LandingSource,
} from "@/lib/landing-media.functions";

export const Route = createFileRoute("/_authenticated/admin/landing")({
  component: AdminLanding,
});

type Draft = Partial<LandingMediaRow> & { kind: LandingMediaKind };

const EMPTY_TESTIMONIAL: Draft = {
  kind: "testimonial", status: "draft", display_order: 0, source: "customer", rating: 5, consent_confirmed: false,
};
const EMPTY_DEMO: Draft = { kind: "demo", status: "draft", display_order: 0, consent_confirmed: false };

function detectVideoType(url: string): LandingVideoType | null {
  if (!url) return null;
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  if (/vimeo\.com/.test(url)) return "vimeo";
  if (/\.webm(\?|$)/i.test(url)) return "webm";
  return "mp4";
}

function AdminLanding() {
  const { data: access, isLoading: accessLoading } = useAccess();
  const qc = useQueryClient();
  const listFn = useServerFn(listAllLandingMedia);
  const upsertFn = useServerFn(upsertLandingMedia);
  const deleteFn = useServerFn(deleteLandingMedia);
  const orderFn = useServerFn(setLandingMediaOrder);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["landing-media-admin"],
    queryFn: () => listFn(),
    enabled: !!access?.isAdmin,
  });

  const upsertMut = useMutation({
    mutationFn: (data: Draft) => upsertFn({ data: data as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["landing-media-admin"] });
      qc.invalidateQueries({ queryKey: ["landing-media-public"] });
      setEditing(null);
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["landing-media-admin"] });
      qc.invalidateQueries({ queryKey: ["landing-media-public"] });
    },
  });
  const orderMut = useMutation({
    mutationFn: (items: { id: string; display_order: number }[]) => orderFn({ data: { items } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["landing-media-admin"] });
      qc.invalidateQueries({ queryKey: ["landing-media-public"] });
    },
  });

  const [editing, setEditing] = useState<Draft | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const testimonials = useMemo(() => (rows ?? []).filter((r) => r.kind === "testimonial"), [rows]);
  const demos = useMemo(() => (rows ?? []).filter((r) => r.kind === "demo"), [rows]);

  if (accessLoading) return <div className="glass rounded-2xl h-64 animate-pulse" />;
  if (!access?.isAdmin) return <Navigate to="/dashboard" />;

  const move = (list: LandingMediaRow[], id: string, dir: -1 | 1) => {
    const i = list.findIndex((r) => r.id === id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const reordered = [...list];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    orderMut.mutate(reordered.map((r, idx) => ({ id: r.id, display_order: idx })));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Admin</div>
          <h1 className="text-2xl font-bold">Landing page media</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage the main demo card and video testimonials shown on the public landing page.
          </p>
        </div>
        <Link to="/admin" className="glass rounded-lg px-3 py-2 text-sm inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Admin
        </Link>
      </div>

      <div className="glass rounded-2xl p-4 border border-sky-500/20 bg-sky-500/5 flex items-start gap-3 text-sm">
        <Info className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold">How this works</div>
          <p className="text-muted-foreground mt-1 leading-relaxed">
            Direct file uploads to public storage are currently blocked by your workspace privacy policy.
            Provide media as <strong>hosted URLs</strong> — MP4/WebM (H.264/AAC recommended for broadest support),
            YouTube <code className="px-1 rounded bg-black/30">/embed/</code> URL, or Vimeo{" "}
            <code className="px-1 rounded bg-black/30">player.vimeo.com/video/&lt;id&gt;</code> URL.
            Video type is auto-detected. Only <strong>published</strong> items appear on the landing page.
            To enable in-app uploads, ask an admin/owner to allow public buckets in Settings → Privacy &amp; Security.
          </p>
        </div>
      </div>

      <MediaSection
        label="Video testimonials"
        kind="testimonial"
        rows={testimonials}
        isLoading={isLoading}
        onNew={() => setEditing({ ...EMPTY_TESTIMONIAL, display_order: testimonials.length })}
        onEdit={(r) => setEditing(r)}
        onDelete={(id) => confirm("Delete this testimonial?") && deleteMut.mutate(id)}
        onPublishToggle={(r) => upsertMut.mutate({ ...r, status: r.status === "published" ? "draft" : "published" })}
        onMove={(id, dir) => move(testimonials, id, dir)}
        onPreview={setPreviewUrl}
      />

      <MediaSection
        label="Main demo card"
        kind="demo"
        rows={demos}
        isLoading={isLoading}
        onNew={() => setEditing({ ...EMPTY_DEMO, display_order: demos.length })}
        onEdit={(r) => setEditing(r)}
        onDelete={(id) => confirm("Delete this demo entry?") && deleteMut.mutate(id)}
        onPublishToggle={(r) => upsertMut.mutate({ ...r, status: r.status === "published" ? "draft" : "published" })}
        onMove={(id, dir) => move(demos, id, dir)}
        onPreview={setPreviewUrl}
        emptyNote="No demo overrides. The landing shows the built-in interactive product walkthrough by default. Add one here only if you have a rendered MP4 to replace it."
      />

      {editing && (
        <EditorModal
          value={editing}
          onCancel={() => setEditing(null)}
          onSave={(v) => upsertMut.mutate(v)}
          saving={upsertMut.isPending}
          error={upsertMut.error instanceof Error ? upsertMut.error.message : null}
        />
      )}

      {previewUrl && <PreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />}
    </div>
  );
}

function MediaSection({
  label, kind, rows, isLoading, emptyNote,
  onNew, onEdit, onDelete, onPublishToggle, onMove, onPreview,
}: {
  label: string;
  kind: LandingMediaKind;
  rows: LandingMediaRow[];
  isLoading: boolean;
  emptyNote?: string;
  onNew: () => void;
  onEdit: (r: LandingMediaRow) => void;
  onDelete: (id: string) => void;
  onPublishToggle: (r: LandingMediaRow) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onPreview: (url: string) => void;
}) {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">{label} <span className="text-xs text-muted-foreground ml-1">({rows.length})</span></h2>
        <button onClick={onNew} className="rounded-lg gradient-primary text-white px-3 py-1.5 text-sm inline-flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> New {kind}
        </button>
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">{emptyNote ?? "Nothing here yet."}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground text-left">
              <tr>
                <th className="py-2 pr-3 w-14">#</th>
                <th className="py-2 pr-3">Title</th>
                <th className="py-2 pr-3">Role · Country</th>
                <th className="py-2 pr-3">Source</th>
                <th className="py-2 pr-3">Video</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3 w-52 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
                  <td className="py-2 pr-3 font-medium">{r.title ?? <span className="italic opacity-60">(no title)</span>}</td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {r.subtitle ?? "—"}{r.country ? ` · ${r.country}` : ""}
                  </td>
                  <td className="py-2 pr-3">
                    {r.source ? (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide ${
                        r.source === "customer" ? "bg-emerald-500/20 text-emerald-300" :
                        r.source === "demo" ? "bg-sky-500/20 text-sky-300" : "bg-amber-500/20 text-amber-300"
                      }`}>{r.source}</span>
                    ) : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    {r.video_url ? (
                      <button onClick={() => onPreview(r.video_url!)} className="text-xs text-white/70 hover:text-white inline-flex items-center gap-1">
                        <Play className="w-3 h-3" /> {r.video_type ?? "video"}
                      </button>
                    ) : <span className="text-muted-foreground text-xs">none</span>}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide ${
                      r.status === "published" ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/60"
                    }`}>{r.status}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-1 justify-end">
                      <IconBtn label="Move up" onClick={() => onMove(r.id, -1)}><ArrowUp className="w-3.5 h-3.5" /></IconBtn>
                      <IconBtn label="Move down" onClick={() => onMove(r.id, 1)}><ArrowDown className="w-3.5 h-3.5" /></IconBtn>
                      <IconBtn label={r.status === "published" ? "Unpublish" : "Publish"} onClick={() => onPublishToggle(r)}>
                        {r.status === "published" ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </IconBtn>
                      <button onClick={() => onEdit(r)} className="text-xs px-2 py-1 rounded glass hover:bg-white/10">Edit</button>
                      <IconBtn label="Delete" onClick={() => onDelete(r.id)} danger><Trash2 className="w-3.5 h-3.5" /></IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, onClick, label, danger }: { children: React.ReactNode; onClick: () => void; label: string; danger?: boolean }) {
  return (
    <button
      type="button" onClick={onClick} title={label} aria-label={label}
      className={`w-7 h-7 rounded-md flex items-center justify-center ${danger ? "text-rose-300 hover:bg-rose-500/20" : "text-white/70 hover:bg-white/10"}`}
    >
      {children}
    </button>
  );
}

function EditorModal({
  value, onSave, onCancel, saving, error,
}: {
  value: Draft;
  onSave: (v: Draft) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [d, setD] = useState<Draft>(value);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  const onVideoUrlChange = (url: string) => {
    setD((prev) => ({ ...prev, video_url: url, video_type: detectVideoType(url) }));
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm p-4 flex items-center justify-center" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="glass w-full max-w-2xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">{d.id ? "Edit" : "New"} {d.kind === "testimonial" ? "testimonial" : "demo"}</h3>
          <button onClick={onCancel} className="text-white/60 hover:text-white text-sm">Close</button>
        </div>

        <div className="grid gap-4">
          <Field label={d.kind === "testimonial" ? "Customer name" : "Demo title"}>
            <input value={d.title ?? ""} onChange={(e) => set("title", e.target.value)} className="w-full glass rounded-lg px-3 py-2 text-sm" />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={d.kind === "testimonial" ? "Role" : "Subtitle"}>
              <input value={d.subtitle ?? ""} onChange={(e) => set("subtitle", e.target.value)} className="w-full glass rounded-lg px-3 py-2 text-sm" placeholder={d.kind === "testimonial" ? "Instagram Creator" : "Optional short description"} />
            </Field>
            {d.kind === "testimonial" && (
              <Field label="Country">
                <input value={d.country ?? ""} onChange={(e) => set("country", e.target.value)} className="w-full glass rounded-lg px-3 py-2 text-sm" />
              </Field>
            )}
          </div>

          {d.kind === "testimonial" && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Company / brand">
                <input value={d.company ?? ""} onChange={(e) => set("company", e.target.value)} className="w-full glass rounded-lg px-3 py-2 text-sm" />
              </Field>
              <Field label="Rating (1–5)">
                <input type="number" min={1} max={5} value={d.rating ?? 5} onChange={(e) => set("rating", Number(e.target.value))} className="w-full glass rounded-lg px-3 py-2 text-sm" />
              </Field>
            </div>
          )}

          {d.kind === "testimonial" && (
            <>
              <Field label="Pull quote (short — shown on card)">
                <input value={d.quote ?? ""} onChange={(e) => set("quote", e.target.value)} maxLength={200} className="w-full glass rounded-lg px-3 py-2 text-sm" />
              </Field>
              <Field label="Full review">
                <textarea value={d.review ?? ""} onChange={(e) => set("review", e.target.value)} rows={3} maxLength={2000} className="w-full glass rounded-lg px-3 py-2 text-sm" />
              </Field>
            </>
          )}

          <Field label={d.kind === "testimonial" ? "Poster / portrait URL" : "Poster URL"}>
            <input value={d.poster_url ?? ""} onChange={(e) => set("poster_url", e.target.value)} placeholder="https://…jpg or …png" className="w-full glass rounded-lg px-3 py-2 text-sm" />
          </Field>

          <Field label="Video URL (MP4, WebM, YouTube /embed/… or Vimeo player.vimeo.com/video/…)">
            <input value={d.video_url ?? ""} onChange={(e) => onVideoUrlChange(e.target.value)} placeholder="https://…" className="w-full glass rounded-lg px-3 py-2 text-sm" />
            {d.video_url && (
              <div className="mt-1 text-xs text-muted-foreground">Detected: <span className="text-white/80">{d.video_type ?? "unknown"}</span></div>
            )}
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Duration">
              <input value={d.duration ?? ""} onChange={(e) => set("duration", e.target.value)} placeholder="1:12" className="w-full glass rounded-lg px-3 py-2 text-sm" />
            </Field>
            {d.kind === "testimonial" && (
              <Field label="Source">
                <CreatorFlowSelect
                  value={d.source ?? "sample"}
                  onValueChange={(v) => set("source", v as LandingSource)}
                  options={[
                    { value: "customer", label: "Real customer" },
                    { value: "sample", label: "Sample testimonial" },
                    { value: "demo", label: "Demo testimonial" },
                  ]}
                />
              </Field>
            )}
            <Field label="Status">
              <CreatorFlowSelect
                value={d.status ?? "draft"}
                onValueChange={(v) => set("status", v as "draft" | "published")}
                options={[
                  { value: "draft", label: "Draft (hidden)" },
                  { value: "published", label: "Published (live)" },
                ]}
              />
            </Field>
          </div>

          <Field label="Display order (lower = first)">
            <input type="number" min={0} value={d.display_order ?? 0} onChange={(e) => set("display_order", Number(e.target.value))} className="w-full glass rounded-lg px-3 py-2 text-sm" />
          </Field>

          {error && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCancel} className="text-sm glass rounded-lg px-4 py-2">Cancel</button>
          <button
            onClick={() => onSave(d)}
            disabled={saving}
            className="text-sm gradient-primary text-white rounded-lg px-4 py-2 inline-flex items-center gap-2 disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}

function PreviewModal({ url, onClose }: { url: string; onClose: () => void }) {
  const type = detectVideoType(url);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  return (
    <div className="fixed inset-0 z-[85] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-4xl aspect-video bg-black rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {loading && !errored && (
          <div className="absolute inset-0 flex items-center justify-center text-white/70 gap-2 text-sm z-10 pointer-events-none">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading…
          </div>
        )}
        {errored ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-6 text-center">
            <AlertCircle className="w-8 h-8 text-rose-400 mb-2" />
            <div>Cannot preview this URL.</div>
            <a href={url} target="_blank" rel="noreferrer" className="mt-2 text-sm underline text-white/80">Open in new tab</a>
          </div>
        ) : type === "youtube" || type === "vimeo" ? (
          <iframe src={url} className="w-full h-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen onLoad={() => setLoading(false)} />
        ) : (
          <video src={url} controls autoPlay playsInline preload="metadata" className="w-full h-full" onLoadedData={() => setLoading(false)} onError={() => { setLoading(false); setErrored(true); }} />
        )}
        <button onClick={onClose} className="absolute top-3 right-3 glass rounded-full w-9 h-9 text-white">✕</button>
      </div>
    </div>
  );
}
