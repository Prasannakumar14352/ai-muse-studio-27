// Promo Studio → Library: every creative with its status. Click one to edit, approve,
// schedule, download or add it to the landing showcase.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPromoStudio, listPromoCreatives } from "@/lib/promo-studio.functions";
import { CreativeDrawer } from "./CreativeDrawer";
import { STATUS_STYLE } from "./status";

const FILTERS = [
  { id: "active", name: "All" },
  { id: "draft", name: "Draft" },
  { id: "approved", name: "Approved" },
  { id: "scheduled", name: "Scheduled" },
  { id: "posted", name: "Posted" },
  { id: "archived", name: "Archived" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

const TEMPLATE_NAME: Record<string, string> = {
  feature_spotlight: "Feature spotlight",
  offer_festival: "Offer / festival",
  before_after: "Before → after",
};

export function LibraryTab() {
  const [status, setStatus] = useState<Filter>("active");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const studio = useQuery({
    queryKey: ["promo-studio"],
    queryFn: () => getPromoStudio(),
    refetchOnWindowFocus: false,
    staleTime: 30 * 60 * 1000,
  });
  const list = useQuery({
    queryKey: ["promo-library", status, page],
    queryFn: () => listPromoCreatives({ data: { status, page } }),
    refetchOnWindowFocus: false,
  });

  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={status === f.id ? "default" : "outline"}
            onClick={() => {
              setStatus(f.id);
              setPage(0);
            }}
          >
            {f.name}
          </Button>
        ))}
      </div>

      {list.isLoading ? (
        <Loader2 className="m-8 h-6 w-6 animate-spin" />
      ) : list.error ? (
        <p className="text-destructive">{String(list.error)}</p>
      ) : !list.data?.items.length ? (
        <p className="text-sm text-muted-foreground">
          Nothing here yet. Generate creatives in the Create tab.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.data.items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setOpenId(c.id)}
              className="overflow-hidden rounded-xl border bg-card text-left transition hover:border-primary"
            >
              <div className="flex aspect-[4/5] items-center justify-center bg-muted">
                {c.outputUrls[0] ? (
                  <img
                    src={c.outputUrls[0]}
                    alt={c.headline}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="px-3 text-center text-xs text-muted-foreground">
                    Not rendered yet — open to render
                  </span>
                )}
              </div>
              <div className="space-y-1 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLE[c.status] ?? ""}`}
                  >
                    {c.status}
                  </span>
                  <span className="text-[10px] text-muted-foreground">${c.costUsd.toFixed(4)}</span>
                </div>
                <div className="line-clamp-2 text-sm font-medium">{c.headline}</div>
                <div className="text-[11px] text-muted-foreground">
                  {TEMPLATE_NAME[c.template] ?? c.template} · {c.format} · {c.size} ·{" "}
                  {c.language.toUpperCase()}
                </div>
                {c.scheduleNote && (
                  <div className="text-[11px] text-destructive">{c.scheduleNote}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {pages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page + 1 >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {openId && studio.data && (
        <CreativeDrawer id={openId} brand={studio.data.brand} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}
