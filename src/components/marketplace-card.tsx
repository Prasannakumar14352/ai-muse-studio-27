import type { MarketplaceItem } from "@/lib/marketplace.functions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { installItemFn, uninstallItemFn } from "@/lib/marketplace.functions";
import { Check, Download, Loader2, Package } from "lucide-react";
import { toast } from "sonner";

export function MarketplaceCard({ item, installed }: { item: MarketplaceItem; installed: boolean }) {
  const qc = useQueryClient();
  const install = useServerFn(installItemFn);
  const uninstall = useServerFn(uninstallItemFn);
  const m = useMutation({
    mutationFn: () => installed ? uninstall({ data: { itemId: item.id } }) : install({ data: { itemId: item.id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketplace-installs"] }); toast.success(installed ? "Uninstalled" : "Installed"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="glass rounded-2xl overflow-hidden border border-border hover:border-primary/40 transition">
      <div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center relative">
        {item.preview_url
          ? <img src={item.preview_url} alt={item.title} className="w-full h-full object-cover" />
          : <Package className="w-10 h-10 text-primary/60" />}
        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/50 text-xs uppercase tracking-wider">
          {item.kind.replace(/_/g, " ")}
        </span>
      </div>
      <div className="p-4 space-y-2">
        <div className="font-semibold text-sm">{item.title}</div>
        <div className="text-xs text-muted-foreground line-clamp-2 min-h-[2.5rem]">{item.description}</div>
        <button onClick={() => m.mutate()} disabled={m.isPending}
          className={`w-full inline-flex items-center justify-center gap-2 py-2 rounded-xl text-sm ${installed ? "bg-emerald-500/20 text-emerald-300" : "bg-primary text-primary-foreground"}`}>
          {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : installed ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
          {installed ? "Installed" : "Install"}
        </button>
      </div>
    </div>
  );
}
