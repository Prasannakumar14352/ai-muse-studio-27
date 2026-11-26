// Promo Studio → Create: brand bar, screenshot library, options, generate, results.
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Upload, Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  commitPromoAssets,
  commitPromoLogo,
  createPromoUpload,
  generatePromoCreatives,
  getPromoStudio,
  type PromoCreativeView,
} from "@/lib/promo-studio.functions";
import {
  PROMO_FEATURE_TAGS,
  type PromoFormat,
  type PromoLanguage,
  type PromoSize,
  type PromoTemplate,
} from "@/lib/promo-studio/constants";
import { CreativeCard } from "./CreativeCard";

const TEMPLATES: { id: PromoTemplate; name: string; hint: string }[] = [
  {
    id: "feature_spotlight",
    name: "Feature spotlight",
    hint: "One feature, real screenshot in a phone",
  },
  { id: "offer_festival", name: "Offer / festival", hint: "Uses your live offer code" },
  { id: "before_after", name: "Before → after", hint: "Old way vs CreatorFlow" },
];
const LANGS: { id: PromoLanguage; name: string }[] = [
  { id: "en", name: "English" },
  { id: "te", name: "Telugu" },
  { id: "hi", name: "Hindi" },
];

async function uploadFile(kind: "logo" | "asset" | "before", file: File) {
  const mime = file.type as "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";
  const { path, token } = await createPromoUpload({ data: { kind, mime, bytes: file.size } });
  const { error } = await supabase.storage
    .from("renders")
    .uploadToSignedUrl(path, token, file, { contentType: mime });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

async function imageSize(file: File): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const out = { width: bmp.width, height: bmp.height };
  bmp.close();
  return out;
}

export function CreateTab() {
  const qc = useQueryClient();
  const studio = useQuery({
    queryKey: ["promo-studio"],
    queryFn: () => getPromoStudio(),
    refetchOnWindowFocus: false,
    staleTime: 30 * 60 * 1000, // signed URLs last 1 hour
  });
  const [template, setTemplate] = useState<PromoTemplate>("feature_spotlight");
  const [format, setFormat] = useState<PromoFormat>("image");
  const [size, setSize] = useState<PromoSize>("4:5");
  const [language, setLanguage] = useState<PromoLanguage>("en");
  const [variants, setVariants] = useState(2);
  const [slides, setSlides] = useState(5);
  const [aiBackground, setAiBackground] = useState(false);
  const [topic, setTopic] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [beforeId, setBeforeId] = useState<string>("");
  const [uploadTag, setUploadTag] = useState<string>("other");
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<PromoCreativeView[]>([]);
  const assetInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  if (studio.isLoading) return <Loader2 className="m-8 h-6 w-6 animate-spin" />;
  if (studio.error || !studio.data)
    return (
      <p className="p-6 text-destructive">{String(studio.error ?? "Couldn't load Promo Studio")}</p>
    );
  const s = studio.data;
  const brand = s.brand;

  const onAssets = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("assets");
    try {
      const items = [];
      for (const f of Array.from(files).slice(0, 20)) {
        const path = await uploadFile("asset", f);
        items.push({
          path,
          label: f.name.replace(/\.[^.]+$/, "").slice(0, 80),
          featureTag: uploadTag as never,
          ...(await imageSize(f)),
        });
      }
      await commitPromoAssets({ data: { items } });
      await qc.invalidateQueries({ queryKey: ["promo-studio"] });
      toast.success(`${items.length} screenshot(s) added`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      if (assetInput.current) assetInput.current.value = "";
    }
  };

  const onLogo = async (file: File | undefined) => {
    if (!file) return;
    setBusy("logo");
    try {
      await commitPromoLogo({ data: { path: await uploadFile("logo", file) } });
      await qc.invalidateQueries({ queryKey: ["promo-studio"] });
      toast.success("Logo saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const generate = async () => {
    setBusy("generate");
    try {
      const shots = template === "before_after" ? picked.filter((id) => id !== beforeId) : picked;
      const r = await generatePromoCreatives({
        data: {
          template,
          format,
          size: format === "story" ? "9:16" : size,
          language,
          variants,
          slides: format === "carousel" ? slides : undefined,
          assetIds: shots.slice(0, 7),
          beforeAssetId: template === "before_after" && beforeId ? beforeId : undefined,
          aiBackground,
          topic: topic.trim() || undefined,
        },
      });
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      setResults((prev) => [...r.creatives, ...prev]);
      qc.invalidateQueries({ queryKey: ["promo-studio"] });
      qc.invalidateQueries({ queryKey: ["promo-library"] });
      toast.success(`${r.creatives.length} creative(s) generated`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="space-y-6">
      {/* Brand bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-24 items-center justify-center rounded-md"
            style={{
              background: `linear-gradient(135deg, ${brand.colors.primary}, ${brand.colors.secondary})`,
            }}
          >
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt="Logo" className="h-10 max-w-20 object-contain" />
            ) : (
              <span className="text-xs text-white">No logo</span>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy}
            onClick={() => logoInput.current?.click()}
          >
            {busy === "logo" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload logo"}
          </Button>
          <input
            ref={logoInput}
            type="file"
            accept="image/png,image/svg+xml"
            hidden
            onChange={(e) => onLogo(e.target.files?.[0])}
          />
        </div>
        <div className="text-sm">
          <div className="text-muted-foreground">Offer</div>
          <div className="font-medium">
            {s.offer ? `${s.offer.code} — ${s.offer.label}` : "No live offer"}
          </div>
        </div>
        <div className="text-sm">
          <div className="text-muted-foreground">AI spend this month</div>
          <div className="font-medium">
            ${s.budget.monthSpend.toFixed(3)} / ${Number(s.budget.monthlyCap).toFixed(2)}
          </div>
        </div>
        <div className="text-sm">
          <div className="text-muted-foreground">Link on ads</div>
          <div className="font-medium">{brand.appUrl}</div>
        </div>
      </div>

      {/* Screenshot library */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">App screenshots ({picked.length} selected)</h3>
          <div className="flex items-center gap-2">
            <Select value={uploadTag} onValueChange={setUploadTag}>
              <SelectTrigger className="h-9 w-36">
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
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() => assetInput.current?.click()}
            >
              {busy === "assets" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Upload className="mr-1 h-4 w-4" />
                  Upload
                </>
              )}
            </Button>
            <input
              ref={assetInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              hidden
              onChange={(e) => onAssets(e.target.files)}
            />
          </div>
        </div>
        {s.assets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Upload real screenshots of the app (dashboard, AI Video Studio, voice picker…). Ads look
            most trustworthy with real screens.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
            {s.assets.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => toggle(a.id)}
                className={`relative overflow-hidden rounded-md border-2 ${picked.includes(a.id) ? "border-primary" : "border-transparent"}`}
                title={`${a.label} (${a.featureTag})`}
              >
                <img
                  src={a.url}
                  alt={a.label}
                  className="aspect-[9/16] w-full object-cover object-top"
                />
                {picked.includes(a.id) && (
                  <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 text-[10px] text-white">
                  {a.featureTag}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Options */}
      <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label>Template</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplate(t.id)}
                className={`rounded-lg border p-3 text-left ${template === t.id ? "border-primary bg-primary/5" : ""}`}
              >
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Format</Label>
          <Select
            value={format}
            onValueChange={(v) => {
              setFormat(v as PromoFormat);
              if (v === "story") setSize("9:16");
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="image">Image</SelectItem>
              <SelectItem value="carousel">Carousel</SelectItem>
              <SelectItem value="story">Story (9:16)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Size</Label>
          <Select
            value={format === "story" ? "9:16" : size}
            onValueChange={(v) => setSize(v as PromoSize)}
            disabled={format === "story"}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="4:5">4:5 feed</SelectItem>
              <SelectItem value="1:1">1:1 square</SelectItem>
              <SelectItem value="9:16">9:16 story/reel</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Language</Label>
          <Select value={language} onValueChange={(v) => setLanguage(v as PromoLanguage)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGS.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Variants</Label>
          <Select value={String(variants)} onValueChange={(v) => setVariants(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {format === "carousel" && (
          <div className="space-y-2">
            <Label>Middle slides (plus cover and CTA slide)</Label>
            <Select value={String(slides)} onValueChange={(v) => setSlides(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 4, 5].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {template === "before_after" && (
          <div className="space-y-2">
            <Label>"Before" image (from the library)</Label>
            <Select value={beforeId} onValueChange={setBeforeId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick one" />
              </SelectTrigger>
              <SelectContent>
                {s.assets.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label || a.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label>AI background</Label>
            <p className="text-xs text-muted-foreground">Off = brand gradient (free)</p>
          </div>
          <Switch checked={aiBackground} onCheckedChange={setAiBackground} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Angle / idea (optional)</Label>
          <Textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={300}
            placeholder="e.g. Telugu voiceover videos in 2 minutes"
          />
        </div>
        <div className="md:col-span-2">
          <Button onClick={generate} disabled={!!busy} className="w-full sm:w-auto">
            {busy === "generate" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Generate {variants} creative{variants > 1 ? "s" : ""}
          </Button>
        </div>
      </div>

      {results.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold">Generated (saved as drafts)</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {results.map((c) => (
              <CreativeCard key={c.id} creative={c} brand={brand} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
