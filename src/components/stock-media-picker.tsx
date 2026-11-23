import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Loader2, Play, ExternalLink, Images } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CreatorFlowSelect } from "@/components/ui/creator-flow-select";
import { searchStockFn, importStockFn, type StockItem, type StockType, type StockOrientation } from "@/lib/stock-media.functions";

export type PickedStock = {
  assetId: string;
  url: string;
  storagePath: string;
  kind: "image" | "video";
  mimeType: string;
  width: number;
  height: number;
  title: string;
  author: string;
};

const TYPE_LABEL: Record<StockType, string> = {
  photo: "Photos", illustration: "Illustrations", vector: "Vectors", video: "Videos",
};

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/**
 * Free stock photos & videos from Pixabay. Picking an item copies it into the
 * user's Asset Library (our own storage) and hands back that URL — 0 credits.
 */
export function StockMediaPicker({
  open, onOpenChange, onPicked, types = ["photo", "illustration", "vector", "video"], initialQuery = "", title = "Free stock photos & videos",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPicked: (item: PickedStock) => void | Promise<void>;
  types?: StockType[];
  initialQuery?: string;
  title?: string;
}) {
  const search = useServerFn(searchStockFn);
  const importItem = useServerFn(importStockFn);

  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState<StockType>(types[0] ?? "photo");
  const [orientation, setOrientation] = useState<StockOrientation>("all");
  const [importingId, setImportingId] = useState<number | null>(null);
  const debounced = useDebounced(query.trim(), 450);

  useEffect(() => { if (open && initialQuery) setQuery(initialQuery); }, [open, initialQuery]);

  const q = useInfiniteQuery({
    queryKey: ["stock-media", debounced, type, orientation],
    enabled: open,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => search({ data: { query: debounced, type, page: pageParam, orientation } }),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const items: StockItem[] = q.data?.pages.flatMap((p) => p.items) ?? [];

  async function pick(item: StockItem) {
    if (importingId) return;
    setImportingId(item.id);
    try {
      const saved = await importItem({ data: { id: item.id, type: item.type } });
      await onPicked(saved);
      toast.success(`Added to your library — free, no credits used`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add that file");
    } finally {
      setImportingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Images className="w-5 h-5 text-primary" /> {title}</DialogTitle>
          <DialogDescription>Royalty-free media you can use in your content. Picking one saves a copy to your Asset Library — 0 credits.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search e.g. temple, sunrise, office, food…" className="pl-9" />
          </div>
          {types.length > 1 && (
            <div className="flex rounded-lg border border-border overflow-hidden">
              {types.map((t) => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`px-3 py-2 text-xs ${type === t ? "bg-primary text-primary-foreground" : "hover:bg-white/5 text-muted-foreground"}`}>
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          )}
          {type !== "video" && (
            <div className="w-40">
              <CreatorFlowSelect value={orientation} onValueChange={(v) => setOrientation(v as StockOrientation)}
                options={[{ value: "all", label: "Any shape" }, { value: "horizontal", label: "Landscape" }, { value: "vertical", label: "Portrait" }]} />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-[300px] -mx-1 px-1">
          {q.isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Searching…</div>
          ) : q.isError ? (
            <div className="text-center py-20 text-sm text-rose-300">{q.error instanceof Error ? q.error.message : "Search failed"}</div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 text-sm text-muted-foreground">No results{debounced ? ` for “${debounced}”` : ""}. Try another word.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {items.map((item) => (
                <button key={`${item.type}-${item.id}`} type="button" disabled={importingId !== null} onClick={() => pick(item)}
                  className="group relative aspect-[4/3] rounded-lg overflow-hidden border border-border bg-black/30 hover:border-primary disabled:opacity-60 text-left">
                  <img src={item.preview} alt={item.tags} loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover transition group-hover:scale-105" />
                  {item.type === "video" && (
                    <span className="absolute top-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white flex items-center gap-1">
                      <Play className="w-3 h-3" /> {item.duration ? `${item.duration}s` : "Video"}
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 text-[10px] text-white/90 opacity-0 group-hover:opacity-100 transition truncate">
                    by {item.author}
                  </span>
                  {importingId === item.id && (
                    <span className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs text-white"><Loader2 className="w-4 h-4 animate-spin mr-1" /> Adding…</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {q.hasNextPage && (
            <div className="flex justify-center py-4">
              <Button variant="outline" size="sm" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
                {q.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-2 text-[11px] text-muted-foreground">
          <a href="https://pixabay.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-white">
            Images and videos from Pixabay <ExternalLink className="w-3 h-3" />
          </a>
          <span>Avoid logos or brands in ads.</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
