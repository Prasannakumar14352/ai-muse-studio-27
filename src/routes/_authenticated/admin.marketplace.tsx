import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMarketplaceFn, upsertMarketplaceItemFn, deleteMarketplaceItemFn, type MarketplaceItem } from "@/lib/marketplace.functions";
import { Trash2, Plus, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/marketplace")({ component: AdminMarketplace });

const empty: Partial<MarketplaceItem> = { kind: "prompt_pack", title: "", slug: "", description: "", preview_url: "", payload: {}, tier: "free", active: true, sort: 0 };

function AdminMarketplace() {
  const qc = useQueryClient();
  const list = useServerFn(listMarketplaceFn);
  const upsert = useServerFn(upsertMarketplaceItemFn);
  const del = useServerFn(deleteMarketplaceItemFn);
  const { data: items } = useQuery({ queryKey: ["marketplace"], queryFn: () => list() });
  const [editing, setEditing] = useState<Partial<MarketplaceItem>>(empty);

  const save = useMutation({
    mutationFn: () => upsert({ data: { ...editing, title: editing.title || "", slug: editing.slug || "", kind: editing.kind || "prompt_pack" } as never }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["marketplace"] }); setEditing(empty); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Marketplace CMS</h1>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-2">
          {items?.map((it) => (
            <div key={it.id} className="glass rounded-xl p-4 border border-white/10 flex items-center justify-between">
              <button onClick={() => setEditing(it)} className="text-left">
                <div className="font-medium">{it.title}</div>
                <div className="text-xs text-muted-foreground">{it.kind} · {it.slug} · {it.active ? "active" : "inactive"}</div>
              </button>
              <button onClick={async () => { await del({ data: { id: it.id } }); qc.invalidateQueries({ queryKey: ["marketplace"] }); }}
                className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="glass rounded-2xl p-5 border border-white/10 space-y-3 h-fit sticky top-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{editing.id ? "Edit item" : "New item"}</h3>
            <button onClick={() => setEditing(empty)} className="text-xs text-muted-foreground"><Plus className="w-3.5 h-3.5 inline" /> New</button>
          </div>
          <input className="input-base" placeholder="Title" value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
          <input className="input-base" placeholder="Slug" value={editing.slug ?? ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />
          <select className="input-base" value={editing.kind ?? "prompt_pack"} onChange={(e) => setEditing({ ...editing, kind: e.target.value as MarketplaceItem["kind"] })}>
            <option value="prompt_pack">Prompt Pack</option>
            <option value="template">Template</option>
            <option value="thumbnail_pack">Thumbnail Pack</option>
            <option value="brand_kit">Brand Kit</option>
            <option value="voice_pack">Voice Pack</option>
            <option value="carousel_pack">Carousel Pack</option>
          </select>
          <textarea rows={3} className="input-base" placeholder="Description" value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          <input className="input-base" placeholder="Preview URL" value={editing.preview_url ?? ""} onChange={(e) => setEditing({ ...editing, preview_url: e.target.value })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
            Active
          </label>
          <button onClick={() => save.mutate()} disabled={save.isPending || !editing.title || !editing.slug}
            className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-xl bg-primary text-primary-foreground text-sm disabled:opacity-50">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {editing.id ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
