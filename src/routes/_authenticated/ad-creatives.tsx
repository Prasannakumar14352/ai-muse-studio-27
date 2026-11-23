// Ad Creatives — ready-to-run social ads with exact, editable text.
// AI writes the copy and makes the picture (optionally with the seller's real
// product photos); the text is drawn on top in the browser, never by the image AI.
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, ImagePlus, Loader2, Megaphone, Sparkles, Trash2, Upload, Wand2 } from "lucide-react";
import { useCreditGuard } from "@/lib/use-credit-guard";
import { writeAdCopyFn, type AdCopy } from "@/lib/ad-creative.functions";
import { fetchGeneratedImage } from "@/lib/image-stream";
import { shrinkForVision } from "@/lib/image-shrink";
import {
  AD_SIZES, imageRatioFor, loadAdFonts, loadImage, renderAd,
  type AdFormat, type AdLayout, type AdSpec,
} from "@/lib/ad-creative-render";

export const Route = createFileRoute("/_authenticated/ad-creatives")({
  head: () => ({ meta: [{ title: "Ad Creatives · CreatorFlow AI" }] }),
  component: AdCreativesPage,
});

const LAYOUTS: Array<{ id: AdLayout; label: string; hint: string }> = [
  { id: "poster", label: "Poster", hint: "Dark poster, headline on top, picture card" },
  { id: "photo", label: "Full photo", hint: "Photo fills the ad, text at the bottom" },
  { id: "product", label: "Product card", hint: "Brand colours, product on a white card" },
];
const LANGUAGES = ["English", "Telugu", "Hindi", "Tamil", "Kannada", "Malayalam", "Marathi", "Bengali"];
const PALETTES: Array<[string, string]> = [
  ["#f97316", "#ec4899"], ["#7c3aed", "#06b6d4"], ["#16a34a", "#84cc16"],
  ["#dc2626", "#f59e0b"], ["#0ea5e9", "#6366f1"], ["#be185d", "#7c2d12"],
];

const EMPTY: AdSpec = {
  format: "4:5", layout: "poster", brandName: "", colorA: "#f97316", colorB: "#ec4899",
  headline: "Your Headline Here", highlight: "Headline", subline: "One line about what you sell and why it's great.",
  tags: ["Feature one", "Feature two", "Feature three", "Feature four"], cta: "Order Now", footer: "", badge: "",
};

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function readFile(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Read failed"));
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(f);
  });
}

function AdCreativesPage() {
  const writeCopy = useServerFn(writeAdCopyFn);
  const { runWithCredits, InsufficientDialog } = useCreditGuard();

  // Brief
  const [business, setBusiness] = useState("");
  const [product, setProduct] = useState("");
  const [offer, setOffer] = useState("");
  const [audience, setAudience] = useState("");
  const [contact, setContact] = useState("");
  const [language, setLanguage] = useState("English");

  // Ad
  const [spec, setSpec] = useState<AdSpec>(EMPTY);
  const set = <K extends keyof AdSpec>(k: K, v: AdSpec[K]) => setSpec((s) => ({ ...s, [k]: v }));
  const [photos, setPhotos] = useState<string[]>([]);
  const [logo, setLogo] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [useHd, setUseHd] = useState(false);
  const [writing, setWriting] = useState(false);
  const [painting, setPainting] = useState(false);

  // Preview
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [logoEl, setLogoEl] = useState<HTMLImageElement | null>(null);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => { loadAdFonts().then(() => setFontsReady(true)); }, []);
  useEffect(() => {
    let live = true;
    if (!image) { setImgEl(null); return; }
    loadImage(image).then((el) => live && setImgEl(el)).catch(() => live && setImgEl(null));
    return () => { live = false; };
  }, [image]);
  useEffect(() => {
    let live = true;
    if (!logo) { setLogoEl(null); return; }
    loadImage(logo).then((el) => live && setLogoEl(el)).catch(() => live && setLogoEl(null));
    return () => { live = false; };
  }, [logo]);
  useEffect(() => {
    if (canvasRef.current) renderAd(canvasRef.current, spec, { image: imgEl, logo: logoEl });
  }, [spec, imgEl, logoEl, fontsReady]);

  const usingPhotos = photos.length > 0;
  const imageCost = usingPhotos || useHd ? 8 : 1;
  const copyReady = business.trim().length >= 2 && product.trim().length >= 2;

  async function aiCopy() {
    if (!copyReady || writing) return;
    setWriting(true);
    try {
      const copy = await runWithCredits(
        { action: "ad_copy", amount: 1, description: `Ad copy — ${business}`.slice(0, 200), inputHash: newKey() },
        () => writeCopy({ data: { business, product, offer, audience, language, contact } }) as Promise<AdCopy>,
      );
      setSpec((s) => ({
        ...s,
        brandName: s.brandName || business,
        headline: copy.headline, highlight: copy.highlight, subline: copy.subline,
        tags: [0, 1, 2, 3].map((i) => copy.tags[i] ?? ""), cta: copy.cta,
        footer: copy.footer || contact, badge: copy.badge,
      }));
      if (copy.imagePrompt) setImagePrompt(copy.imagePrompt);
      toast.success("Ad text written — edit anything you like");
    } catch (e) {
      if ((e as { code?: string })?.code !== "insufficient_credits") console.error("[ad-creatives] copy failed", e);
    } finally {
      setWriting(false);
    }
  }

  async function aiImage() {
    if (painting) return;
    const scene = imagePrompt.trim() || `${product || "the product"} for ${business || "a small business"}, attractive advertising setting`;
    const refs = photos.slice(0, 3);
    const lock = refs.length
      ? `Use the exact product from the reference photo${refs.length > 1 ? "s" : ""} — keep its shape, colours, printed design and logo unchanged. ${spec.layout === "product" ? "Clean studio product shot on a soft plain background, product centred and large." : "Place it naturally in this scene:"} `
      : "";
    const prompt = `${lock}${scene}. Photorealistic advertising photo, sharp focus, attractive lighting. Absolutely no text, letters, words, numbers, logos or watermarks in the image.`;
    setPainting(true);
    try {
      const res = await fetchGeneratedImage({
        prompt,
        ratio: imageRatioFor(spec.layout, spec.format),
        quality: useHd ? "high" : "medium",
        ...(refs.length ? { referenceImages: refs } : {}),
      });
      if (!res.image) { toast.error(res.error ?? "Couldn't make the picture — please try again."); return; }
      setImage(res.image);
      toast.success(`Picture ready (${imageCost} credit${imageCost === 1 ? "" : "s"})`);
    } finally {
      setPainting(false);
    }
  }

  async function onPhotos(files: FileList | null) {
    if (!files) return;
    const next: string[] = [];
    for (const f of Array.from(files).slice(0, 3)) {
      if (f.size > 10_000_000) { toast.error(`${f.name} is over 10 MB — skipped`); continue; }
      next.push(await shrinkForVision(await readFile(f), 1024, 0.85));
    }
    setPhotos((p) => [...p, ...next].slice(0, 3));
  }
  async function onOwnImage(f: File | null) {
    if (!f) return;
    setImage(await shrinkForVision(await readFile(f), 2048, 0.9));
  }
  async function onLogo(f: File | null) {
    if (!f) return;
    if (f.size > 3_000_000) { toast.error("Logo must be under 3 MB"); return; }
    setLogo(await readFile(f));
  }

  function download(format: AdFormat) {
    const c = document.createElement("canvas");
    renderAd(c, { ...spec, format }, { image: imgEl, logo: logoEl });
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const slug = (spec.brandName || "ad").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ad";
      a.download = `${slug}-${format.replace(":", "x")}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, "image/png");
  }
  function downloadAll() {
    (Object.keys(AD_SIZES) as AdFormat[]).forEach((f, i) => setTimeout(() => download(f), i * 400));
  }

  const input = "w-full text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500/60";
  const label = "text-xs text-muted-foreground block mb-1";
  const section = "glass rounded-2xl p-5 border border-white/10 space-y-3";
  const ratioStyle = useMemo(() => ({ aspectRatio: `${AD_SIZES[spec.format].w} / ${AD_SIZES[spec.format].h}` }), [spec.format]);

  return (
    <div className="max-w-6xl space-y-6">
      {InsufficientDialog}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold flex items-center gap-2"><Megaphone className="w-7 h-7" /> Ad <span className="gradient-text">Creatives</span></h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Make Facebook &amp; Instagram ads for any business. AI writes the text and makes the picture — with your real product
          photos if you add them — and every word stays exact and editable.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_420px] gap-6 items-start">
        <div className="space-y-5">
          {/* 1. Brief */}
          <div className={section}>
            <div className="font-semibold">1 · What are you promoting?</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className={label}>Business / brand name *</label>
                <input value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="Sri Gifts & Prints" className={input} /></div>
              <div><label className={label}>Ad language</label>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className={input}>
                  {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
                </select></div>
            </div>
            <div><label className={label}>Product or service *</label>
              <textarea value={product} onChange={(e) => setProduct(e.target.value)} rows={2} placeholder="Custom photo mugs, T-shirts and keychains — printed with your photo or name" className={input} /></div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div><label className={label}>Offer (optional)</label>
                <input value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="20% off this week" className={input} /></div>
              <div><label className={label}>Who is it for? (optional)</label>
                <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Birthday & festival gifts" className={input} /></div>
              <div><label className={label}>How to order (optional)</label>
                <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="WhatsApp 98xxxxxx10" className={input} /></div>
            </div>
            <button onClick={aiCopy} disabled={!copyReady || writing}
              className="rounded-lg gradient-primary text-white px-4 py-2 text-sm inline-flex items-center gap-2 disabled:opacity-60">
              {writing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Write ad text with AI · 1 credit
            </button>
          </div>

          {/* 2. Picture */}
          <div className={section}>
            <div className="font-semibold">2 · Picture</div>
            <div>
              <label className={label}>Your real product photos (optional, up to 3) — the AI keeps your product exactly as it is</label>
              <div className="flex flex-wrap gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-white/10">
                    <img src={p} alt={`Product photo ${i + 1}`} className="w-full h-full object-cover" />
                    <button aria-label="Remove photo" onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 bg-black/70 rounded p-0.5"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
                {photos.length < 3 && (
                  <label className="w-20 h-20 rounded-lg border border-dashed border-white/20 flex flex-col items-center justify-center text-[10px] text-muted-foreground cursor-pointer hover:bg-white/5">
                    <ImagePlus className="w-5 h-5 mb-1" /> Add photo
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onPhotos(e.target.files); e.target.value = ""; }} />
                  </label>
                )}
              </div>
            </div>
            <div><label className={label}>Describe the scene</label>
              <textarea value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} rows={2}
                placeholder="The mug on a festive Diwali table with diyas and warm light" className={input} /></div>
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={aiImage} disabled={painting}
                className="rounded-lg gradient-primary text-white px-4 py-2 text-sm inline-flex items-center gap-2 disabled:opacity-60">
                {painting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate picture · {imageCost} credit{imageCost === 1 ? "" : "s"}
              </button>
              {!usingPhotos && (
                <label className="text-xs text-muted-foreground inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={useHd} onChange={(e) => setUseHd(e.target.checked)} className="accent-orange-500" /> HD quality
                </label>
              )}
              <label className="text-xs underline text-muted-foreground cursor-pointer inline-flex items-center gap-1">
                <Upload className="w-3.5 h-3.5" /> or use my own picture
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { onOwnImage(e.target.files?.[0] ?? null); e.target.value = ""; }} />
              </label>
            </div>
            {usingPhotos && <p className="text-[11px] text-muted-foreground">With product photos, pictures are made in HD so your product stays accurate.</p>}
          </div>

          {/* 3. Text & look */}
          <div className={section}>
            <div className="font-semibold">3 · Text &amp; look</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className={label}>Headline</label>
                <input value={spec.headline} onChange={(e) => set("headline", e.target.value)} maxLength={80} className={input} /></div>
              <div><label className={label}>Highlight these words (coloured)</label>
                <input value={spec.highlight} onChange={(e) => set("highlight", e.target.value)} maxLength={40} className={input} /></div>
            </div>
            <div><label className={label}>Sub-line</label>
              <input value={spec.subline} onChange={(e) => set("subline", e.target.value)} maxLength={120} className={input} /></div>
            <div><label className={label}>Feature tags (leave empty to hide)</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <input key={i} value={spec.tags[i] ?? ""} maxLength={28}
                    onChange={(e) => set("tags", [0, 1, 2, 3].map((j) => (j === i ? e.target.value : spec.tags[j] ?? "")))} className={input} />
                ))}
              </div></div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div><label className={label}>Button text</label>
                <input value={spec.cta} onChange={(e) => set("cta", e.target.value)} maxLength={28} className={input} /></div>
              <div><label className={label}>Offer badge (optional)</label>
                <input value={spec.badge} onChange={(e) => set("badge", e.target.value)} maxLength={20} placeholder="20% OFF" className={input} /></div>
              <div><label className={label}>Bottom line (optional)</label>
                <input value={spec.footer} onChange={(e) => set("footer", e.target.value)} maxLength={80} placeholder="Order on WhatsApp 98xxxxxx10" className={input} /></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className={label}>Brand name on the ad</label>
                <input value={spec.brandName} onChange={(e) => set("brandName", e.target.value)} maxLength={40} className={input} /></div>
              <div><label className={label}>Logo (optional)</label>
                <div className="flex items-center gap-2">
                  <label className="rounded-lg glass border border-border px-3 py-2 text-sm cursor-pointer inline-flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" /> {logo ? "Change logo" : "Upload logo"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { onLogo(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                  </label>
                  {logo && <button onClick={() => setLogo(null)} className="text-xs text-rose-300">Remove</button>}
                </div></div>
            </div>
            <div>
              <label className={label}>Colours</label>
              <div className="flex flex-wrap items-center gap-2">
                {PALETTES.map(([a, b]) => (
                  <button key={a + b} aria-label={`Colours ${a} and ${b}`} onClick={() => setSpec((s) => ({ ...s, colorA: a, colorB: b }))}
                    className={`w-9 h-9 rounded-full border-2 ${spec.colorA === a && spec.colorB === b ? "border-white" : "border-transparent"}`}
                    style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} />
                ))}
                <input type="color" value={spec.colorA} onChange={(e) => set("colorA", e.target.value)} aria-label="First colour" className="w-9 h-9 rounded bg-transparent" />
                <input type="color" value={spec.colorB} onChange={(e) => set("colorB", e.target.value)} aria-label="Second colour" className="w-9 h-9 rounded bg-transparent" />
              </div>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-3 lg:sticky lg:top-4">
          <div className="flex flex-wrap gap-2">
            {LAYOUTS.map((l) => (
              <button key={l.id} title={l.hint} onClick={() => set("layout", l.id)}
                className={`px-3 py-1.5 rounded-full text-xs border ${spec.layout === l.id ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>{l.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(AD_SIZES) as AdFormat[]).map((f) => (
              <button key={f} onClick={() => set("format", f)}
                className={`px-3 py-1.5 rounded-full text-xs border ${spec.format === f ? "bg-white text-black border-transparent" : "glass border-border"}`}>{AD_SIZES[f].label}</button>
            ))}
          </div>
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-black mx-auto" style={{ ...ratioStyle, maxHeight: "70vh" }}>
            <canvas ref={canvasRef} className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => download(spec.format)} className="rounded-lg gradient-primary text-white px-4 py-2 text-sm inline-flex items-center gap-2">
              <Download className="w-4 h-4" /> Download PNG
            </button>
            <button onClick={downloadAll} className="rounded-lg glass border border-border px-4 py-2 text-sm inline-flex items-center gap-2">
              <Download className="w-4 h-4" /> All 3 sizes
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Feed 4:5 for Facebook &amp; Instagram feeds, Square 1:1 for posts and WhatsApp, 9:16 for Stories and Reels.
            The picture is cropped to fit each size, so check each one before you run it.
          </p>
        </div>
      </div>
    </div>
  );
}
