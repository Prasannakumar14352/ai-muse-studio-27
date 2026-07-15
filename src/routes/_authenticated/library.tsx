import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import {
  listLibraryAssetsFn, createLibraryAssetFn, deleteLibraryAssetFn,
  updateLibraryAssetFn, ASSET_KINDS, type AssetKind, type LibraryAsset,
} from "@/lib/asset-library.functions";
import { supabase } from "@/integrations/supabase/client";
import { CreatorFlowSelect } from "@/components/ui/creator-flow-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Library, Search, Upload, Trash2, Star, Copy, Image as ImageIcon,
  Film, Music, Mic, User, Layers, FileText, Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/library")({ component: LibraryPage });

const KIND_ICON: Record<AssetKind, typeof ImageIcon> = {
  image: ImageIcon, video: Film, logo: Sparkles, voiceover: Mic,
  music: Music, character: User, background: Layers, document: FileText,
};

const KIND_ACCEPT: Record<AssetKind, string> = {
  image: "image/*", video: "video/*", logo: "image/*",
  voiceover: "audio/*", music: "audio/*",
  character: "image/*", background: "image/*", document: ".pdf,.doc,.docx,.txt,.md,application/pdf",
};

function LibraryPage() {
  const list = useServerFn(listLibraryAssetsFn);
  const create = useServerFn(createLibraryAssetFn);
  const del = useServerFn(deleteLibraryAssetFn);
  const upd = useServerFn(updateLibraryAssetFn);
  const qc = useQueryClient();

  const [kind, setKind] = useState<AssetKind | "all">("all");
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string>("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["library", kind, search, tag, favoritesOnly],
    queryFn: () => list({ data: { kind, search: search || undefined, tag: tag || undefined, favoritesOnly } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["library"] });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
  });
  const updMut = useMutation({
    mutationFn: (p: { id: string; favorite?: boolean; title?: string; tags?: string[] }) => upd({ data: p }),
    onSuccess: invalidate,
  });

  const [uploadingKind, setUploadingKind] = useState<AssetKind>("image");
  const [tagInput, setTagInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function onUpload(file: File) {
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${userData.user.id}/${uploadingKind}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("library").upload(path, file, {
        contentType: file.type, upsert: false,
      });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage.from("library").createSignedUrl(path, 60 * 60 * 24 * 7);
      await create({
        data: {
          kind: uploadingKind,
          title: titleInput || file.name,
          url: signed?.signedUrl ?? path,
          storage_path: path,
          mime_type: file.type,
          size_bytes: file.size,
          tags: tagInput.split(",").map((t) => t.trim()).filter(Boolean),
          metadata: { original_name: file.name },
        },
      });
      toast.success("Uploaded to library");
      setTitleInput("");
      setTagInput("");
      if (fileRef.current) fileRef.current.value = "";
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const allTags = data?.allTags ?? [];
  const items = data?.items ?? [];

  const kindOptions = useMemo(() => [
    { value: "all", label: "All kinds" },
    ...ASSET_KINDS.map((k) => ({ value: k, label: k.charAt(0).toUpperCase() + k.slice(1) })),
  ], []);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Library className="w-7 h-7 text-primary" /> Asset Library</h1>
        <p className="text-sm text-muted-foreground mt-1">Store, search, and reuse images, videos, logos, voiceovers, music, characters, backgrounds, and documents across every module.</p>
      </header>

      {/* Upload */}
      <section className="glass rounded-2xl p-5 border border-white/10">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Upload className="w-4 h-4 text-primary" /> Add to library</h3>
        <div className="grid md:grid-cols-4 gap-3">
          <CreatorFlowSelect
            value={uploadingKind}
            onValueChange={(v) => setUploadingKind(v as AssetKind)}
            options={ASSET_KINDS.map((k) => ({ value: k, label: k.charAt(0).toUpperCase() + k.slice(1) }))}
          />
          <Input placeholder="Title (optional)" value={titleInput} onChange={(e) => setTitleInput(e.target.value)} />
          <Input placeholder="Tags (comma separated)" value={tagInput} onChange={(e) => setTagInput(e.target.value)} />
          <label className="inline-flex">
            <input
              ref={fileRef}
              type="file"
              accept={KIND_ACCEPT[uploadingKind]}
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }}
            />
            <Button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="w-full">
              {uploading ? "Uploading…" : "Choose file"}
            </Button>
          </label>
        </div>
      </section>

      {/* Filters */}
      <section className="flex flex-wrap gap-3 items-center">
        <div className="w-48"><CreatorFlowSelect value={kind} onValueChange={(v) => setKind(v as AssetKind | "all")} options={kindOptions} /></div>
        <div className="flex-1 min-w-[240px] relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assets…" className="pl-9" />
        </div>
        <Button variant={favoritesOnly ? "default" : "outline"} onClick={() => setFavoritesOnly((v) => !v)}>
          <Star className="w-4 h-4 mr-1" /> Favorites
        </Button>
      </section>

      {/* Tag chips */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTag("")}
            className={`text-xs px-3 py-1 rounded-full border ${tag === "" ? "bg-primary text-primary-foreground border-primary" : "border-white/10 text-muted-foreground hover:bg-white/5"}`}
          >All tags</button>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setTag(t === tag ? "" : t)}
              className={`text-xs px-3 py-1 rounded-full border ${t === tag ? "bg-primary text-primary-foreground border-primary" : "border-white/10 text-muted-foreground hover:bg-white/5"}`}
            >#{t}</button>
          ))}
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => <div key={i} className="glass rounded-xl aspect-square animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center text-muted-foreground border border-white/10">
          <Library className="w-10 h-10 mx-auto mb-2 opacity-50" />
          No assets yet. Upload above or generate content — every generated asset can be saved here.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {items.map((a) => <AssetTile key={a.id} asset={a} onDelete={() => delMut.mutate(a.id)} onFavorite={() => updMut.mutate({ id: a.id, favorite: !a.favorite })} />)}
        </div>
      )}
    </div>
  );
}

function AssetTile({ asset, onDelete, onFavorite }: { asset: LibraryAsset; onDelete: () => void; onFavorite: () => void }) {
  const Icon = KIND_ICON[asset.kind];
  const isImage = asset.kind === "image" || asset.kind === "logo" || asset.kind === "character" || asset.kind === "background";
  const isVideo = asset.kind === "video";
  const isAudio = asset.kind === "music" || asset.kind === "voiceover";

  const copyUrl = async () => {
    await navigator.clipboard.writeText(asset.url);
    toast.success("URL copied");
  };

  return (
    <div className="glass rounded-xl border border-white/10 overflow-hidden group relative">
      <div className="aspect-square bg-black/40 flex items-center justify-center overflow-hidden">
        {isImage && <img src={asset.url} alt={asset.title} loading="lazy" className="w-full h-full object-cover" />}
        {isVideo && <video src={asset.url} className="w-full h-full object-cover" muted />}
        {isAudio && (
          <div className="flex flex-col items-center gap-2 p-3 w-full">
            <Icon className="w-8 h-8 text-primary" />
            <audio src={asset.url} controls className="w-full" />
          </div>
        )}
        {asset.kind === "document" && (
          <div className="flex flex-col items-center gap-2">
            <FileText className="w-10 h-10 text-primary" />
            <a href={asset.url} target="_blank" rel="noreferrer" className="text-xs underline">Open</a>
          </div>
        )}
      </div>
      <div className="p-2 space-y-1">
        <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
          <Icon className="w-3 h-3" /> {asset.kind}
        </div>
        <div className="text-xs font-medium truncate">{asset.title}</div>
        {asset.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {asset.tags.slice(0, 3).map((t) => <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">#{t}</span>)}
          </div>
        )}
      </div>
      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition flex gap-1">
        <button onClick={onFavorite} className="p-1 rounded bg-black/70 hover:bg-black" title="Favorite">
          <Star className={`w-3.5 h-3.5 ${asset.favorite ? "fill-yellow-400 text-yellow-400" : "text-white"}`} />
        </button>
        <button onClick={copyUrl} className="p-1 rounded bg-black/70 hover:bg-black" title="Copy URL">
          <Copy className="w-3.5 h-3.5 text-white" />
        </button>
        <button onClick={onDelete} className="p-1 rounded bg-black/70 hover:bg-red-600" title="Delete">
          <Trash2 className="w-3.5 h-3.5 text-white" />
        </button>
      </div>
    </div>
  );
}
