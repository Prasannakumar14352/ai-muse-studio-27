import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Loader2, Play, Library, Images } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { listLibraryAssetsFn, type LibraryAsset } from "@/lib/asset-library.functions";
import { StockSearchPanel } from "@/components/stock-media-picker";
import type { StockType } from "@/lib/stock-media.functions";
import type { PickedMedia } from "@/lib/picked-media";

export type { PickedMedia };

type Accept = "image" | "video";

const IMAGE_KINDS = new Set(["image", "background", "character", "logo"]);

/**
 * One picker for the whole app: the user's own Asset Library plus free
 * Pixabay stock. Both return our own stored copy — 0 credits.
 */
export function MediaPicker({
  open, onOpenChange, onPicked, accept = ["image"], title, initialQuery = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPicked: (item: PickedMedia) => void | Promise<void>;
  accept?: Accept[];
  title?: string;
  initialQuery?: string;
}) {
  const [tab, setTab] = useState<"library" | "stock">("library");
  const [busy, setBusy] = useState(false);
  const wantsVideo = accept.includes("video");
  const wantsImage = accept.includes("image");
  const stockTypes: StockType[] = [
    ...(wantsImage ? (["photo", "illustration"] as StockType[]) : []),
    ...(wantsVideo ? (["video"] as StockType[]) : []),
  ];

  async function finish(item: PickedMedia) {
    setBusy(true);
    try {
      await onPicked(item);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't use that file");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Images className="w-5 h-5 text-primary" /> {title ?? (wantsVideo && wantsImage ? "Choose an image or video" : wantsVideo ? "Choose a video" : "Choose an image")}
          </DialogTitle>
          <DialogDescription>From your Media Library or free stock — no credits used.</DialogDescription>
        </DialogHeader>

        <div className="flex rounded-lg border border-border overflow-hidden w-fit">
          <button type="button" onClick={() => setTab("library")}
            className={`px-4 py-2 text-xs flex items-center gap-1.5 ${tab === "library" ? "bg-primary text-primary-foreground" : "hover:bg-white/5 text-muted-foreground"}`}>
            <Library className="w-3.5 h-3.5" /> My library
          </button>
          <button type="button" onClick={() => setTab("stock")}
            className={`px-4 py-2 text-xs flex items-center gap-1.5 ${tab === "stock" ? "bg-primary text-primary-foreground" : "hover:bg-white/5 text-muted-foreground"}`}>
            <Images className="w-3.5 h-3.5" /> Free stock
          </button>
        </div>

        <div className="relative flex flex-col flex-1 min-h-0">
          {tab === "library" ? (
            <LibraryTab active={open} accept={accept} busy={busy} onPick={finish} />
          ) : (
            <StockSearchPanel
              active={open && tab === "stock"}
              types={stockTypes}
              initialQuery={initialQuery}
              onPicked={(s) => finish({ url: s.url, kind: s.kind, mimeType: s.mimeType, title: s.title })}
            />
          )}
          {busy && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-sm text-white rounded-lg">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Applying…
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LibraryTab({
  active, accept, busy, onPick,
}: {
  active: boolean;
  accept: Accept[];
  busy: boolean;
  onPick: (item: PickedMedia) => void;
}) {
  const list = useServerFn(listLibraryAssetsFn);
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["library", "picker", search],
    enabled: active,
    queryFn: () => list({ data: { kind: "all", search: search || undefined } }),
  });

  const items = (data?.items ?? []).filter((a: LibraryAsset) =>
    (accept.includes("image") && IMAGE_KINDS.has(a.kind)) || (accept.includes("video") && a.kind === "video"),
  );

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your library…" className="pl-9" />
      </div>
      <div className="flex-1 overflow-y-auto min-h-[300px] -mx-1 px-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
        ) : isError ? (
          <div className="text-center py-20 text-sm text-rose-300">{error instanceof Error ? error.message : "Couldn't load your library"}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-sm text-muted-foreground">
            Nothing here yet. Try the <b>Free stock</b> tab, or upload in Media Library.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {items.map((a) => {
              const isVideo = a.kind === "video";
              return (
                <button key={a.id} type="button" disabled={busy}
                  onClick={() => onPick({ url: a.url, kind: isVideo ? "video" : "image", mimeType: a.mime_type ?? (isVideo ? "video/mp4" : "image/jpeg"), title: a.title })}
                  className="group relative aspect-[4/3] rounded-lg overflow-hidden border border-border bg-black/30 hover:border-primary disabled:opacity-60 text-left">
                  {isVideo ? (
                    <video src={`${a.url}#t=0.5`} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                  ) : (
                    <img src={a.url} alt={a.title} loading="lazy" className="w-full h-full object-cover transition group-hover:scale-105" />
                  )}
                  {isVideo && (
                    <span className="absolute top-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white flex items-center gap-1">
                      <Play className="w-3 h-3" /> {a.duration_seconds ? `${Math.round(a.duration_seconds)}s` : "Video"}
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 text-[10px] text-white/90 truncate">
                    {a.title}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
