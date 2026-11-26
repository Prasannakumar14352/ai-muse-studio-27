// "Make this week's pack": one creative per content-plan item for the next 7 days (IST).
// Generates one at a time; each creative renders itself. Never approves or schedules anything.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  generatePromoCreatives,
  planWeeklyPack,
  type PromoCreativeView,
  type WeeklyPackRow,
} from "@/lib/promo-studio.functions";
import { CreativeCard } from "./CreativeCard";
import type { Brand } from "./templates/parts";

type RowState = "queued" | "generating" | "done" | "skipped" | "failed";

export function WeeklyPackDialog({ brand }: { brand: Brand }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const plan = useQuery({
    queryKey: ["promo-weekly-pack"],
    queryFn: () => planWeeklyPack(),
    enabled: open,
    refetchOnWindowFocus: false,
  });
  const [rows, setRows] = useState<
    (WeeklyPackRow & { regenerate: boolean; include: boolean })[] | null
  >(null);
  const [state, setState] = useState<Record<string, { s: RowState; msg?: string }>>({});
  const [made, setMade] = useState<PromoCreativeView[]>([]);
  const [running, setRunning] = useState(false);

  const list =
    rows ??
    plan.data?.rows.map((r) => ({
      ...r,
      regenerate: false,
      include: !r.note || r.template === "offer_festival",
    })) ??
    [];
  const setRow = (i: number, patch: Partial<(typeof list)[number]>) =>
    setRows(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const start = async () => {
    setRunning(true);
    const batchId = crypto.randomUUID();
    let stop = false;
    for (const r of list) {
      if (!r.include || (r.existingCreativeId && !r.regenerate)) {
        setState((s) => ({
          ...s,
          [r.planItemId]: {
            s: "skipped",
            msg: r.existingCreativeId ? "Already has a creative" : "Not included",
          },
        }));
        continue;
      }
      if (stop) {
        setState((s) => ({
          ...s,
          [r.planItemId]: { s: "failed", msg: "Monthly Promo Studio budget reached" },
        }));
        continue;
      }
      setState((s) => ({ ...s, [r.planItemId]: { s: "generating" } }));
      try {
        const res = await generatePromoCreatives({
          data: {
            template: r.template,
            format: r.format,
            size: r.size,
            language: r.language,
            variants: 1,
            slides: r.format === "carousel" ? (r.slides ?? 3) : undefined,
            assetIds: r.assetIds,
            topic: r.idea.slice(0, 300),
            planItemId: r.planItemId,
            regenerate: r.regenerate,
            batchId,
            aiBackground: false,
          },
        });
        if (!res.ok) {
          if (res.code === "budget") stop = true;
          setState((s) => ({ ...s, [r.planItemId]: { s: "failed", msg: res.message } }));
        } else if (res.skipped) {
          setState((s) => ({ ...s, [r.planItemId]: { s: "skipped", msg: res.skipped } }));
        } else {
          setMade((m) => [...m, ...res.creatives]);
          setState((s) => ({ ...s, [r.planItemId]: { s: "done" } }));
        }
      } catch (e) {
        setState((s) => ({
          ...s,
          [r.planItemId]: { s: "failed", msg: e instanceof Error ? e.message : String(e) },
        }));
      }
    }
    setRunning(false);
    qc.invalidateQueries({ queryKey: ["promo-library"] });
    qc.invalidateQueries({ queryKey: ["promo-studio"] });
    toast.success("Weekly pack finished — review and approve in the Library");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !running && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <CalendarDays className="mr-2 h-4 w-4" /> Make this week's pack
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Weekly pack (next 7 days of your content plan)</DialogTitle>
        </DialogHeader>
        {plan.isLoading ? (
          <Loader2 className="m-6 h-6 w-6 animate-spin" />
        ) : plan.error ? (
          <p className="text-destructive">{String(plan.error)}</p>
        ) : !list.length ? (
          <p className="text-sm text-muted-foreground">
            Nothing planned for the next 7 days. Add ideas to your content plan calendar first.
          </p>
        ) : (
          <div className="space-y-3">
            {list.map((r, i) => {
              const st = state[r.planItemId];
              return (
                <div key={r.planItemId} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <label className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={r.include}
                        disabled={running}
                        onCheckedChange={(v) => setRow(i, { include: !!v })}
                      />
                      <span>
                        <span className="font-medium">{r.date}</span> — {r.idea}
                      </span>
                    </label>
                    {st && (
                      <span className="shrink-0 text-xs">
                        {st.s === "generating" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          st.s
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Select
                      value={r.template}
                      disabled={running}
                      onValueChange={(v) => setRow(i, { template: v as WeeklyPackRow["template"] })}
                    >
                      <SelectTrigger className="h-8 w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="feature_spotlight">Feature spotlight</SelectItem>
                        <SelectItem value="offer_festival">Offer / festival</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={r.format}
                      disabled={running}
                      onValueChange={(v) =>
                        setRow(i, {
                          format: v as WeeklyPackRow["format"],
                          size: v === "story" ? "9:16" : "4:5",
                        })
                      }
                    >
                      <SelectTrigger className="h-8 w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="image">Image 4:5</SelectItem>
                        <SelectItem value="carousel">Carousel 4:5</SelectItem>
                        <SelectItem value="story">Story 9:16</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={r.language}
                      disabled={running}
                      onValueChange={(v) => setRow(i, { language: v as WeeklyPackRow["language"] })}
                    >
                      <SelectTrigger className="h-8 w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="te">Telugu</SelectItem>
                        <SelectItem value="hi">Hindi</SelectItem>
                      </SelectContent>
                    </Select>
                    {r.existingCreativeId && (
                      <label className="flex items-center gap-1 text-xs">
                        <Checkbox
                          checked={r.regenerate}
                          disabled={running}
                          onCheckedChange={(v) => setRow(i, { regenerate: !!v })}
                        />
                        Make a new one (already has a creative)
                      </label>
                    )}
                  </div>
                  {(r.note || st?.msg) && (
                    <p className="text-xs text-amber-600">{st?.msg ?? r.note}</p>
                  )}
                </div>
              );
            })}
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                Estimated AI cost: about ${plan.data?.estimateUsd.toFixed(3)}
              </span>
              <Button onClick={start} disabled={running}>
                {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Generate pack
              </Button>
            </div>
            {made.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {made.map((c) => (
                  <CreativeCard key={c.id} creative={c} brand={brand} />
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
