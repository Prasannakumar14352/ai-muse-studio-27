// One creative in the Library: preview + download, edit text (re-renders), status actions,
// send to the calendar (only once approved) and add to the landing showcase.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarPlus,
  CheckCircle2,
  Loader2,
  Sparkles,
  Undo2,
  Archive,
  Send,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  addPromoToShowcase,
  cancelPromoSchedule,
  getPromoConnections,
  getPromoCreative,
  schedulePromoCreative,
  setPromoCreativeStatus,
  updatePromoCreativeText,
  type PromoLibraryItem,
} from "@/lib/promo-studio.functions";
import { CreativeCard } from "./CreativeCard";
import type { Brand } from "./templates/parts";
import { STATUS_STYLE } from "./status";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function CreativeDrawer({
  id,
  brand,
  onClose,
}: {
  id: string;
  brand: Brand;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["promo-creative", id],
    queryFn: () => getPromoCreative({ data: { id } }),
    refetchOnWindowFocus: false,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const c = q.data;

  const refreshAll = (next?: PromoLibraryItem) => {
    if (next) qc.setQueryData(["promo-creative", id], next);
    else qc.invalidateQueries({ queryKey: ["promo-creative", id] });
    qc.invalidateQueries({ queryKey: ["promo-library"] });
  };

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      const r = await fn();
      refreshAll(r && typeof r === "object" && "id" in r ? (r as PromoLibraryItem) : undefined);
      toast.success(ok);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const rendered = !!c && c.outputUrls.length > 0;
  const editable = !!c && ["draft", "approved"].includes(c.status);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Creative
            {c && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLE[c.status] ?? ""}`}
              >
                {c.status}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        {!c ? (
          <Loader2 className="m-8 h-6 w-6 animate-spin" />
        ) : (
          <div className="mt-4 space-y-6">
            <CreativeCard
              key={`${c.id}-${c.textVersion}`}
              creative={c}
              brand={brand}
              onRendered={() => refreshAll()}
            />

            {c.scheduleNote && <p className="text-sm text-destructive">{c.scheduleNote}</p>}
            <p className="text-xs text-muted-foreground">AI cost: ${c.costUsd.toFixed(4)}</p>

            {/* Status actions */}
            <div className="flex flex-wrap gap-2">
              {c.status === "draft" && (
                <Button
                  size="sm"
                  disabled={!!busy || !rendered}
                  title={rendered ? "" : "Wait for the render to finish"}
                  onClick={() =>
                    run(
                      "approve",
                      () => setPromoCreativeStatus({ data: { id: c.id, to: "approved" } }),
                      "Approved",
                    )
                  }
                >
                  <CheckCircle2 className="mr-1 h-4 w-4" /> Approve
                </Button>
              )}
              {c.status === "approved" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!busy}
                    onClick={() =>
                      run(
                        "draft",
                        () => setPromoCreativeStatus({ data: { id: c.id, to: "draft" } }),
                        "Moved back to draft",
                      )
                    }
                  >
                    <Undo2 className="mr-1 h-4 w-4" /> Back to draft
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!busy}
                    onClick={() =>
                      run(
                        "posted",
                        () => setPromoCreativeStatus({ data: { id: c.id, to: "posted" } }),
                        "Marked as posted",
                      )
                    }
                  >
                    <Send className="mr-1 h-4 w-4" /> I posted it manually
                  </Button>
                </>
              )}
              {c.status === "scheduled" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!busy}
                  onClick={() =>
                    run(
                      "cancel",
                      () => cancelPromoSchedule({ data: { creativeId: c.id } }),
                      "Schedule cancelled",
                    )
                  }
                >
                  <XCircle className="mr-1 h-4 w-4" /> Cancel schedule
                </Button>
              )}
              {["approved", "scheduled", "posted"].includes(c.status) && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!busy}
                  onClick={() =>
                    run(
                      "showcase",
                      async () => {
                        const r = await addPromoToShowcase({ data: { creativeId: c.id } });
                        if (r.already) toast.info("Already in the showcase");
                        return null;
                      },
                      "Added to the landing showcase as a draft — publish it in Admin → Landing",
                    )
                  }
                >
                  <Sparkles className="mr-1 h-4 w-4" /> Add to landing showcase
                </Button>
              )}
              {["draft", "approved"].includes(c.status) && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!!busy}
                  onClick={() =>
                    run(
                      "archive",
                      () => setPromoCreativeStatus({ data: { id: c.id, to: "archived" } }),
                      "Archived",
                    )
                  }
                >
                  <Archive className="mr-1 h-4 w-4" /> Archive
                </Button>
              )}
              {c.status === "archived" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!busy}
                  onClick={() =>
                    run(
                      "restore",
                      () => setPromoCreativeStatus({ data: { id: c.id, to: "draft" } }),
                      "Restored to draft",
                    )
                  }
                >
                  <Undo2 className="mr-1 h-4 w-4" /> Restore
                </Button>
              )}
            </div>

            {c.status === "approved" && <ScheduleBox creative={c} onDone={() => refreshAll()} />}
            {editable && <EditBox creative={c} onSaved={(next) => refreshAll(next)} />}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EditBox({
  creative: c,
  onSaved,
}: {
  creative: PromoLibraryItem;
  onSaved: (c: PromoLibraryItem) => void;
}) {
  const [headline, setHeadline] = useState(c.headline);
  const [hook, setHook] = useState(c.hook);
  const [cta, setCta] = useState(c.cta);
  const [caption, setCaption] = useState(c.caption);
  const [tags, setTags] = useState(c.hashtags.join(" "));
  const [slides, setSlides] = useState(c.slides);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setHeadline(c.headline);
    setHook(c.hook);
    setCta(c.cta);
    setCaption(c.caption);
    setTags(c.hashtags.join(" "));
    setSlides(c.slides);
  }, [c.id, c.textVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true);
    try {
      const next = await updatePromoCreativeText({
        data: {
          id: c.id,
          headline,
          hook,
          cta,
          caption,
          hashtags: tags.split(/\s+/).filter(Boolean),
          slides: c.format === "carousel" ? slides : undefined,
        },
      });
      onSaved(next);
      toast.success(
        c.status === "approved" ? "Saved — back to draft, re-rendering" : "Saved — re-rendering",
      );
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h4 className="font-semibold">Edit text</h4>
      <div className="space-y-1">
        <Label>Headline</Label>
        <Input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={120} />
      </div>
      {c.format === "carousel" && (
        <>
          <div className="space-y-1">
            <Label>Cover (hook)</Label>
            <Input value={hook} onChange={(e) => setHook(e.target.value)} maxLength={120} />
          </div>
          {slides.map((s, i) => (
            <div key={i} className="grid gap-1 sm:grid-cols-2">
              <Input
                value={s.title}
                maxLength={80}
                onChange={(e) =>
                  setSlides((all) =>
                    all.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                  )
                }
                placeholder={`Slide ${i + 2} title`}
              />
              <Input
                value={s.body}
                maxLength={200}
                onChange={(e) =>
                  setSlides((all) =>
                    all.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)),
                  )
                }
                placeholder="Body"
              />
            </div>
          ))}
        </>
      )}
      <div className="space-y-1">
        <Label>Button text</Label>
        <Input value={cta} onChange={(e) => setCta(e.target.value)} maxLength={40} />
      </div>
      <div className="space-y-1">
        <Label>Caption</Label>
        <Textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={5}
          maxLength={2200}
        />
      </div>
      <div className="space-y-1">
        <Label>Hashtags (space separated)</Label>
        <Input value={tags} onChange={(e) => setTags(e.target.value)} />
      </div>
      <Button size="sm" onClick={save} disabled={saving}>
        {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save and re-render
      </Button>
    </div>
  );
}

function ScheduleBox({ creative: c, onDone }: { creative: PromoLibraryItem; onDone: () => void }) {
  const conns = useQuery({
    queryKey: ["promo-connections"],
    queryFn: () => getPromoConnections(),
    refetchOnWindowFocus: false,
  });
  const [picked, setPicked] = useState<string[]>([]);
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const usable = (conns.data ?? []).filter((x) => x.ok);

  const submit = async () => {
    if (!picked.length || !when) return toast.error("Pick an account and a time");
    setBusy(true);
    try {
      await schedulePromoCreative({
        data: {
          creativeId: c.id,
          targets: usable
            .filter((x) => picked.includes(x.id))
            .map((x) => ({ platform: x.platform, connectionId: x.id })),
          scheduledAt: new Date(when).toISOString(),
        },
      });
      toast.success("Scheduled — it's on your calendar");
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h4 className="flex items-center gap-2 font-semibold">
        <CalendarPlus className="h-4 w-4" /> Send to calendar
      </h4>
      {conns.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : !usable.length ? (
        <p className="text-sm text-muted-foreground">
          No Instagram, Facebook or LinkedIn account is connected yet. Download the image and post
          it yourself, then click "I posted it manually".
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {usable.map((x) => (
              <label key={x.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={picked.includes(x.id)}
                  onCheckedChange={(v) =>
                    setPicked((p) => (v ? [...p, x.id] : p.filter((y) => y !== x.id)))
                  }
                />
                <span className="capitalize">{x.platform}</span> · {x.label}
              </label>
            ))}
          </div>
          <div className="space-y-1">
            <Label>Post at</Label>
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <Button size="sm" onClick={submit} disabled={busy}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Schedule
          </Button>
        </>
      )}
    </div>
  );
}
