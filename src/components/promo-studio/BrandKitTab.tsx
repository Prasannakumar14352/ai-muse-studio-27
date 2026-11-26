// Promo Studio → Brand Kit: colours, link, default button text, offer, budget, on/off,
// and the screenshot library (rename, re-tag, remove).
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getPromoBrandKit,
  getPromoStudio,
  savePromoBrandKit,
  updatePromoAsset,
} from "@/lib/promo-studio.functions";
import { PROMO_FEATURE_TAGS } from "@/lib/promo-studio/constants";

const COLOR_KEYS = [
  ["primary", "Main colour"],
  ["secondary", "Second colour"],
  ["accent", "Button / highlight"],
  ["text", "Text colour"],
] as const;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function BrandKitTab() {
  const qc = useQueryClient();
  const kit = useQuery({
    queryKey: ["promo-brand-kit"],
    queryFn: () => getPromoBrandKit(),
    refetchOnWindowFocus: false,
  });
  const studio = useQuery({
    queryKey: ["promo-studio"],
    queryFn: () => getPromoStudio(),
    refetchOnWindowFocus: false,
    staleTime: 30 * 60 * 1000,
  });
  const [form, setForm] = useState<NonNullable<typeof kit.data>["settings"] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (kit.data) setForm(kit.data.settings);
  }, [kit.data]);

  if (kit.isLoading || !form) return <Loader2 className="m-8 h-6 w-6 animate-spin" />;
  if (kit.error) return <p className="text-destructive">{errMsg(kit.error)}</p>;
  const k = kit.data!;

  const save = async () => {
    setSaving(true);
    try {
      await savePromoBrandKit({
        data: {
          enabled: form.enabled,
          colors: form.colors,
          appUrl: form.appUrl.trim(),
          defaultCta: form.defaultCta.trim(),
          offerId: form.offerId,
          monthlyCapUsd: Number(form.monthlyCapUsd),
          perRequestCapUsd: Number(form.perRequestCapUsd),
        },
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["promo-brand-kit"] }),
        qc.invalidateQueries({ queryKey: ["promo-studio"] }),
      ]);
      toast.success("Brand Kit saved");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const assetUpdate = async (
    id: string,
    patch: { label?: string; featureTag?: string; archived?: boolean },
  ) => {
    try {
      await updatePromoAsset({ data: { id, ...patch } as never });
      qc.invalidateQueries({ queryKey: ["promo-studio"] });
      if (patch.archived) toast.success("Removed from the library");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div className="space-y-6">
      {/* Look */}
      <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
        <h3 className="font-semibold md:col-span-2">Look &amp; link</h3>
        {COLOR_KEYS.map(([key, name]) => (
          <div key={key} className="flex items-center gap-3">
            <input
              type="color"
              value={form.colors[key]}
              onChange={(e) =>
                setForm({ ...form, colors: { ...form.colors, [key]: e.target.value } })
              }
              className="h-10 w-14 cursor-pointer rounded border"
              aria-label={name}
            />
            <div>
              <Label>{name}</Label>
              <div className="text-xs text-muted-foreground">{form.colors[key]}</div>
            </div>
          </div>
        ))}
        <div className="space-y-1">
          <Label>Link shown on ads</Label>
          <Input
            value={form.appUrl}
            onChange={(e) => setForm({ ...form, appUrl: e.target.value })}
            placeholder="https://…"
          />
        </div>
        <div className="space-y-1">
          <Label>Default button text</Label>
          <Input
            value={form.defaultCta}
            maxLength={40}
            onChange={(e) => setForm({ ...form, defaultCta: e.target.value })}
          />
        </div>
        <div
          className="h-16 rounded-lg md:col-span-2"
          style={{
            background: `linear-gradient(135deg, ${form.colors.primary}, ${form.colors.secondary})`,
          }}
        >
          <div
            className="flex h-full items-center justify-between px-4"
            style={{ color: form.colors.text }}
          >
            <span className="font-bold">Preview</span>
            <span
              className="rounded-full px-4 py-1 text-sm font-bold"
              style={{ background: form.colors.accent, color: form.colors.primary }}
            >
              {form.defaultCta || "Start free"}
            </span>
          </div>
        </div>
      </div>

      {/* Offer */}
      <div className="space-y-2 rounded-xl border bg-card p-4">
        <h3 className="font-semibold">Offer on ads</h3>
        {k.offerEnded && (
          <p className="text-sm text-amber-600">
            The offer you picked has ended. Pick another, or leave it on automatic.
          </p>
        )}
        <Select
          value={form.offerId ?? "auto"}
          onValueChange={(v) => setForm({ ...form, offerId: v === "auto" ? null : v })}
        >
          <SelectTrigger className="max-w-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Automatic (newest live offer)</SelectItem>
            {k.offers.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.code} — {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!k.offers.length && (
          <p className="text-sm text-muted-foreground">
            No live offers. Create one in Admin → Offers.
          </p>
        )}
      </div>

      {/* Budget */}
      <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-3">
        <h3 className="font-semibold md:col-span-3">AI budget</h3>
        <div className="space-y-1">
          <Label>Monthly limit (USD)</Label>
          <Input
            type="number"
            min={0}
            max={500}
            step={1}
            value={form.monthlyCapUsd}
            onChange={(e) => setForm({ ...form, monthlyCapUsd: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label>Limit per request (USD)</Label>
          <Input
            type="number"
            min={0.01}
            max={25}
            step={0.1}
            value={form.perRequestCapUsd}
            onChange={(e) => setForm({ ...form, perRequestCapUsd: Number(e.target.value) })}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label>Promo Studio on</Label>
            <p className="text-xs text-muted-foreground">Off = no AI calls; library still works</p>
          </div>
          <Switch
            checked={form.enabled}
            onCheckedChange={(v) => setForm({ ...form, enabled: v })}
          />
        </div>
        <p className="text-sm text-muted-foreground md:col-span-3">
          This month: ${k.stats.monthSpend.toFixed(3)} spent · {k.stats.creativesThisMonth}{" "}
          creatives · about ${k.stats.avgCost.toFixed(4)} each
        </p>
      </div>

      <Button onClick={save} disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Brand Kit
      </Button>

      {/* Screenshot library */}
      <div className="space-y-3">
        <h3 className="font-semibold">Screenshot library</h3>
        {!studio.data?.assets.length ? (
          <p className="text-sm text-muted-foreground">
            No screenshots yet. Upload them in the Create tab.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {studio.data.assets.map((a) => (
              <div key={a.id} className="flex gap-3 rounded-lg border p-2">
                <img
                  src={a.url}
                  alt={a.label}
                  className="h-24 w-14 rounded object-cover object-top"
                />
                <div className="flex-1 space-y-2">
                  <Input
                    defaultValue={a.label}
                    maxLength={80}
                    onBlur={(e) =>
                      e.target.value !== a.label && assetUpdate(a.id, { label: e.target.value })
                    }
                  />
                  <div className="flex items-center gap-2">
                    <Select
                      defaultValue={a.featureTag}
                      onValueChange={(v) => assetUpdate(a.id, { featureTag: v })}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROMO_FEATURE_TAGS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Remove from library"
                      onClick={() => assetUpdate(a.id, { archived: true })}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
