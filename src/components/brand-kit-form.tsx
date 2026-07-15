import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listBrandKitsFn, upsertBrandKitFn, deleteBrandKitFn, type BrandKit } from "@/lib/brand-kit.functions";
import { Loader2, Save, Trash2, Star } from "lucide-react";
import { toast } from "sonner";

const empty: Partial<BrandKit> = {
  name: "My Brand", primary_color: "#8b5cf6", secondary_color: "#ec4899",
  font_primary: "Inter", font_secondary: "Inter", brand_voice: "Friendly and confident",
  default_cta: "Learn more", keywords: [], is_default: true,
};

export function BrandKitForm() {
  const qc = useQueryClient();
  const list = useServerFn(listBrandKitsFn);
  const upsert = useServerFn(upsertBrandKitFn);
  const del = useServerFn(deleteBrandKitFn);

  const { data: kits } = useQuery({ queryKey: ["brand-kits"], queryFn: () => list() });
  const [editing, setEditing] = useState<Partial<BrandKit>>(empty);

  const selected = useMemo(() => kits?.find((k) => k.id === editing.id), [kits, editing.id]);

  const save = useMutation({
    mutationFn: () => upsert({ data: { ...editing, name: editing.name || "Untitled" } as never }),
    onSuccess: () => { toast.success("Brand kit saved"); qc.invalidateQueries({ queryKey: ["brand-kits"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); setEditing(empty); qc.invalidateQueries({ queryKey: ["brand-kits"] }); },
  });

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-6">
      <aside className="space-y-2">
        <button onClick={() => setEditing(empty)} className="w-full px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm">+ New brand kit</button>
        <div className="space-y-1.5">
          {kits?.map((k) => (
            <button key={k.id} onClick={() => setEditing(k)}
              className={`w-full text-left p-3 rounded-xl border transition ${editing.id === k.id ? "border-primary bg-primary/10" : "border-white/10 hover:border-white/25"}`}>
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm">{k.name}</div>
                {k.is_default && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
              </div>
              <div className="flex gap-1 mt-1">
                <span className="w-3 h-3 rounded" style={{ background: k.primary_color ?? "#666" }} />
                <span className="w-3 h-3 rounded" style={{ background: k.secondary_color ?? "#666" }} />
              </div>
            </button>
          ))}
        </div>
      </aside>

      <div className="glass rounded-2xl p-6 border border-white/10 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <F label="Name"><input className="input-base" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></F>
          <F label="Default CTA"><input className="input-base" value={editing.default_cta ?? ""} onChange={(e) => setEditing({ ...editing, default_cta: e.target.value })} /></F>
          <F label="Primary color"><input type="color" className="input-base h-10" value={editing.primary_color ?? "#8b5cf6"} onChange={(e) => setEditing({ ...editing, primary_color: e.target.value })} /></F>
          <F label="Secondary color"><input type="color" className="input-base h-10" value={editing.secondary_color ?? "#ec4899"} onChange={(e) => setEditing({ ...editing, secondary_color: e.target.value })} /></F>
          <F label="Primary font"><input className="input-base" value={editing.font_primary ?? ""} onChange={(e) => setEditing({ ...editing, font_primary: e.target.value })} /></F>
          <F label="Secondary font"><input className="input-base" value={editing.font_secondary ?? ""} onChange={(e) => setEditing({ ...editing, font_secondary: e.target.value })} /></F>
          <F label="Logo URL"><input className="input-base" value={editing.logo_url ?? ""} onChange={(e) => setEditing({ ...editing, logo_url: e.target.value })} placeholder="https://..." /></F>
          <F label="Watermark URL"><input className="input-base" value={editing.watermark_url ?? ""} onChange={(e) => setEditing({ ...editing, watermark_url: e.target.value })} /></F>
          <F label="Intro video URL"><input className="input-base" value={editing.intro_url ?? ""} onChange={(e) => setEditing({ ...editing, intro_url: e.target.value })} /></F>
          <F label="Outro video URL"><input className="input-base" value={editing.outro_url ?? ""} onChange={(e) => setEditing({ ...editing, outro_url: e.target.value })} /></F>
        </div>
        <F label="Brand voice"><textarea rows={3} className="input-base" value={editing.brand_voice ?? ""} onChange={(e) => setEditing({ ...editing, brand_voice: e.target.value })} placeholder="e.g. bold, playful, expert" /></F>
        <F label="Brand keywords (comma separated)"><input className="input-base" value={(editing.keywords ?? []).join(", ")} onChange={(e) => setEditing({ ...editing, keywords: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></F>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!editing.is_default} onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })} />
          Set as default kit (applied automatically to new projects)
        </label>

        <div className="flex justify-between pt-2">
          <div>
            {selected && (
              <button onClick={() => remove.mutate(selected.id)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-red-500/30 text-red-400 text-sm hover:bg-red-500/10">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            )}
          </div>
          <button onClick={() => save.mutate()} disabled={save.isPending}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary/70 text-primary-foreground text-sm disabled:opacity-50">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {editing.id ? "Save changes" : "Create brand kit"}
          </button>
        </div>
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 block">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}
