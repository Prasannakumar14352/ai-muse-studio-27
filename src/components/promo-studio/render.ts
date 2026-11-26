// Client-side export of Promo Studio slides (design §8): PNG (download) + JPEG (Instagram)
// per slide, uploaded to signed URLs, then committed so the server checks the PNG size.
import { supabase } from "@/integrations/supabase/client";
import { SIZE_PX, type PromoSize } from "@/lib/promo-studio/constants";
import { commitPromoRender, createPromoRenderUpload } from "@/lib/promo-studio.functions";

/** Fetch a signed URL into a same-origin blob: URL so html-to-image can inline it. */
export async function toBlobUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Couldn't load an image for the render");
  return URL.createObjectURL(await res.blob());
}

async function waitForImages(node: HTMLElement) {
  await Promise.all(
    Array.from(node.querySelectorAll("img")).map((img) =>
      img.complete ? img.decode().catch(() => {}) : img.decode(),
    ),
  );
}

export async function exportSlide(
  node: HTMLElement,
  size: PromoSize,
  fontEmbedCSS: string,
  jpegBg: string,
) {
  const { toPng, toJpeg } = await import("html-to-image");
  await waitForImages(node);
  const { width, height } = SIZE_PX[size];
  const opts = { width, height, pixelRatio: 1, cacheBust: true, fontEmbedCSS };
  const pngUrl = await toPng(node, opts);
  const jpgUrl = await toJpeg(node, { ...opts, quality: 0.92, backgroundColor: jpegBg });
  const [png, jpg] = await Promise.all([
    fetch(pngUrl).then((r) => r.blob()),
    fetch(jpgUrl).then((r) => r.blob()),
  ]);
  return { png, jpg };
}

/** Upload rendered slides and commit them. Returns signed PNG URLs for download. */
export async function uploadRender(
  creativeId: string,
  textVersion: number,
  slides: { png: Blob; jpg: Blob }[],
) {
  const { renderVersion, uploads } = await createPromoRenderUpload({
    data: { creativeId, slides: slides.length },
  });
  const bucket = supabase.storage.from("renders");
  for (let i = 0; i < slides.length; i++) {
    const a = await bucket.uploadToSignedUrl(
      uploads[i].png.path,
      uploads[i].png.token,
      slides[i].png,
      { contentType: "image/png" },
    );
    if (a.error) throw new Error(`Upload failed: ${a.error.message}`);
    const b = await bucket.uploadToSignedUrl(
      uploads[i].jpg.path,
      uploads[i].jpg.token,
      slides[i].jpg,
      { contentType: "image/jpeg" },
    );
    if (b.error) throw new Error(`Upload failed: ${b.error.message}`);
  }
  return commitPromoRender({ data: { creativeId, renderVersion, textVersion } });
}

export async function downloadCreative(
  c: {
    id: string;
    template: string;
    size: string;
    language: string;
    caption: string;
    hashtags: string[];
  },
  urls: string[],
) {
  const id8 = c.id.slice(0, 8);
  const save = (blob: Blob, name: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  if (urls.length === 1) {
    const blob = await (await fetch(urls[0])).blob();
    save(blob, `creatorflow-${c.template}-${c.size.replace(":", "x")}-${c.language}-${id8}.png`);
    return;
  }
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  await Promise.all(
    urls.map(async (u, i) =>
      zip.file(`slide-${String(i + 1).padStart(2, "0")}.png`, await (await fetch(u)).blob()),
    ),
  );
  zip.file("caption.txt", `${c.caption}\n\n${c.hashtags.join(" ")}`);
  save(await zip.generateAsync({ type: "blob" }), `creatorflow-carousel-${id8}.zip`);
}
