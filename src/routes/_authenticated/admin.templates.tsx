import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Edit3, X, Loader2, Save } from "lucide-react";
import { listTemplatesFn, upsertTemplateFn, deleteTemplateFn, type TemplateRecord, type TemplateAccessTier } from "@/lib/templates.functions";
import { useAccess } from "@/lib/access";
import { confirmDialog } from "@/components/confirm-dialog";

export const Route = createFileRoute("/_authenticated/admin/templates")({
  head: () => ({ meta: [{ title: "Admin · Templates — CreatorFlow AI" }] }),
  component: AdminTemplatesPage,
});

const CATEGORIES = [
  "short_video", "long_video", "documentary", "product_promo",
  "carousel", "image", "thumbnail", "linkedin_post", "seo_pack",
];
const TIERS: TemplateAccessTier[] = ["free", "starter", "creator", "pro"];

function AdminTemplatesPage() {
  const { data: access, isLoading: accessLoading } = useAccess();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<TemplateRecord> | null>(null);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["admin-templates"],
    enabled: !!access?.isAdmin,
    queryFn: () => listTemplatesFn(),
  });

  if (accessLoading) return <div className="glass rounded-2xl h-64 animate-pulse" />;
  if (!access?.isAdmin) return <Navigate to="/dashboard" />;

  async function handleDelete(t: TemplateRecord) {
    const ok = await confirmDialog({
      title: `Delete "${t.name}"?`,
      description: "This template will be removed from the gallery.",
      confirmText: "Delete",
      tone: "destructive",
    });
    if (!ok) return;
    try {
      await deleteTemplateFn({ data: { id: t.id } });
      toast.success("Template deleted");
      qc.invalidateQueries({ queryKey: ["admin-templates"] });
      qc.invalidateQueries({ queryKey: ["templates"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Admin</div>
          <h1 className="text-2xl font-bold">Templates</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage the Premium Templates catalog.</p>
        </div>
        <button
          onClick={() => setEditing({ access_tier: "free", featured: false, active: true, category: "short_video", sort_order: 0 })}
          className="inline-flex items-center gap-2 rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> New template
        </button>
      </header>

      {isLoading ? (
        <div className="glass rounded-2xl h-96 animate-pulse" />
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-left px-4 py-3">Tier</th>
                  <th className="text-left px-4 py-3">Featured</th>
                  <th className="text-left px-4 py-3">Active</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(templates ?? []).map((t) => (
                  <tr key={t.id} className="border-t border-border/40">
                    <td className="px-4 py-3">
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.slug}</div>
                    </td>
                    <td className="px-4 py-3 capitalize">{t.category.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 capitalize">{t.access_tier}</td>
                    <td className="px-4 py-3">{t.featured ? "Yes" : "—"}</td>
                    <td className="px-4 py-3">{t.active ? "Yes" : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditing(t)} title="Edit"
                          className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground hover:text-foreground">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(t)} title="Delete"
                          className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground hover:text-rose-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!templates?.length && (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No templates yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && <TemplateEditor initial={editing} onClose={() => setEditing(null)} onSaved={() => {
        qc.invalidateQueries({ queryKey: ["admin-templates"] });
        qc.invalidateQueries({ queryKey: ["templates"] });
      }} />}
    </div>
  );
}

function TemplateEditor({ initial, onClose, onSaved }: {
  initial: Partial<TemplateRecord>; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<Partial<TemplateRecord>>({ ...initial });
  const [briefJson, setBriefJson] = useState(() => JSON.stringify(initial.default_brief ?? {}, null, 2));
  const [saving, setSaving] = useState(false);

  function set<K extends keyof TemplateRecord>(k: K, v: TemplateRecord[K]) {
    setF((s) => ({ ...s, [k]: v }));
  }

  async function save() {
    if (!f.slug || !f.name || !f.category) {
      toast.error("slug, name and category are required");
      return;
    }
    let brief: any = {};
    try { brief = JSON.parse(briefJson || "{}"); }
    catch { toast.error("default_brief is not valid JSON"); return; }
    setSaving(true);
    try {
      await upsertTemplateFn({
        data: {
          slug: f.slug!, name: f.name!, category: f.category!,
          description: f.description ?? null,
          preview_image_url: f.preview_image_url ?? null,
          preview_video_url: f.preview_video_url ?? null,
          poster_url: f.poster_url ?? null,
          preview_type: (f.preview_type ?? "image") as "image" | "video",
          alt_text: f.alt_text ?? null,
          aspect_ratio: f.aspect_ratio ?? null,
          platform: f.platform ?? null,
          style: f.style ?? null,
          default_prompt: f.default_prompt ?? null,
          default_brief: brief,
          tags: f.tags ?? [],
          access_tier: (f.access_tier ?? "free") as TemplateAccessTier,
          featured: f.featured ?? false,
          active: f.active ?? true,
          sort_order: f.sort_order ?? 0,
        },
      });
      toast.success("Template saved");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur flex items-start md:items-center justify-center p-4 overflow-y-auto">
      <div className="glass rounded-2xl border border-border/60 w-full max-w-2xl p-6 my-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{initial.id ? "Edit template" : "New template"}</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3 text-sm">
          <Field label="Name"><input value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} className={input} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Slug (unique)"><input value={f.slug ?? ""} onChange={(e) => set("slug", e.target.value)} className={input} /></Field>
            <Field label="Sort order"><input type="number" value={f.sort_order ?? 0} onChange={(e) => set("sort_order", Number(e.target.value))} className={input} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select value={f.category ?? ""} onChange={(e) => set("category", e.target.value)} className={input}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Access tier">
              <select value={f.access_tier ?? "free"} onChange={(e) => set("access_tier", e.target.value as TemplateAccessTier)} className={input}>
                {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Description">
            <textarea value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={2} className={input} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Aspect ratio"><input value={f.aspect_ratio ?? ""} onChange={(e) => set("aspect_ratio", e.target.value)} placeholder="9:16" className={input} /></Field>
            <Field label="Platform"><input value={f.platform ?? ""} onChange={(e) => set("platform", e.target.value)} placeholder="instagram" className={input} /></Field>
          </div>
          <Field label="Style"><input value={f.style ?? ""} onChange={(e) => set("style", e.target.value)} placeholder="cinematic" className={input} /></Field>
          <Field label="Preview image URL"><input value={f.preview_image_url ?? ""} onChange={(e) => set("preview_image_url", e.target.value)} className={input} /></Field>
          <Field label="Default prompt (topic)">
            <textarea value={f.default_prompt ?? ""} onChange={(e) => set("default_prompt", e.target.value)} rows={2} className={input} />
          </Field>
          <Field label="default_brief (JSON — merged into brief form)">
            <textarea value={briefJson} onChange={(e) => setBriefJson(e.target.value)} rows={6} className={`${input} font-mono text-xs`} />
          </Field>
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!f.featured} onChange={(e) => set("featured", e.target.checked)} /> Featured
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.active ?? true} onChange={(e) => set("active", e.target.checked)} /> Active
            </label>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-white/5">Cancel</button>
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg gradient-primary text-white px-5 py-2 text-sm font-medium disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save template
          </button>
        </div>
      </div>
    </div>
  );
}

const input = "w-full bg-input/50 border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-[color:var(--brand-orange)]";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}
