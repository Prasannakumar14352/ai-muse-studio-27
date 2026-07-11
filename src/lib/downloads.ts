// Universal download helpers. Client-only.
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { toast } from "sonner";

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function downloadFromUrl(url: string, filename: string) {
  try {
    if (url.startsWith("data:")) {
      const res = await fetch(url);
      const blob = await res.blob();
      saveBlob(blob, filename);
      return;
    }
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    saveBlob(blob, filename);
  } catch (e) {
    // Fallback: open in new tab so the user can right-click save.
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    console.warn("[download] fell back to direct link:", e);
  }
}

export async function copyText(text: string, label = "Copied") {
  await navigator.clipboard.writeText(text);
  toast.success(label);
}

export function safeName(name: string, fallback = "file"): string {
  const base = (name || fallback).trim().replace(/[^a-z0-9-_ ]+/gi, "").slice(0, 60);
  return base || fallback;
}

// ---- Carousel ----

export async function downloadCarouselZip(opts: {
  title: string;
  images: (string | null | undefined)[];
  caption?: string;
  hashtags?: string;
}) {
  const zip = new JSZip();
  const folder = zip.folder(safeName(opts.title, "carousel"))!;
  let n = 0;
  for (let i = 0; i < opts.images.length; i++) {
    const src = opts.images[i];
    if (!src) continue;
    try {
      const res = await fetch(src);
      const buf = await res.arrayBuffer();
      const ext = src.includes("image/png") ? "png" : "jpg";
      folder.file(`slide-${String(i + 1).padStart(2, "0")}.${ext}`, buf);
      n++;
    } catch (e) {
      console.warn("[zip] failed slide", i, e);
    }
  }
  if (opts.caption) folder.file("caption.txt", opts.caption);
  if (opts.hashtags) folder.file("hashtags.txt", opts.hashtags);
  if (n === 0) throw new Error("No slides to package");
  const blob = await zip.generateAsync({ type: "blob" });
  saveBlob(blob, `${safeName(opts.title, "carousel")}.zip`);
}

export async function downloadCarouselPdf(opts: {
  title: string;
  images: (string | null | undefined)[];
}) {
  const pdf = new jsPDF({ unit: "px", format: [1080, 1080] });
  let added = 0;
  for (let i = 0; i < opts.images.length; i++) {
    const src = opts.images[i];
    if (!src) continue;
    const dataUrl = await toDataURL(src);
    if (added > 0) pdf.addPage([1080, 1080]);
    pdf.addImage(dataUrl, "JPEG", 0, 0, 1080, 1080, undefined, "FAST");
    added++;
  }
  if (added === 0) throw new Error("No slides");
  pdf.save(`${safeName(opts.title, "carousel")}.pdf`);
}

async function toDataURL(src: string): Promise<string> {
  if (src.startsWith("data:")) return src;
  const res = await fetch(src);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => resolve(r.result as string);
    r.readAsDataURL(blob);
  });
}

// ---- Platform package ----

export type PlatformPackageInput = {
  title: string;
  platform: "instagram" | "facebook" | "youtube" | "linkedin";
  caption?: string;
  hashtags?: string;
  altText?: string;
  cta?: string;
  description?: string;
  tags?: string[];
  media?: Array<{ url: string; kind: "image" | "video" | "thumbnail"; name?: string }>;
};

export async function downloadPlatformPackage(pkg: PlatformPackageInput) {
  const zip = new JSZip();
  const folder = zip.folder(`${safeName(pkg.title)}-${pkg.platform}`)!;
  const meta: Record<string, string> = { platform: pkg.platform, title: pkg.title };
  if (pkg.caption) folder.file("caption.txt", pkg.caption);
  if (pkg.hashtags) folder.file("hashtags.txt", pkg.hashtags);
  if (pkg.altText) folder.file("alt-text.txt", pkg.altText);
  if (pkg.cta) folder.file("cta.txt", pkg.cta);
  if (pkg.description) folder.file("description.txt", pkg.description);
  if (pkg.tags?.length) folder.file("tags.txt", pkg.tags.join(", "));
  folder.file("meta.json", JSON.stringify(meta, null, 2));
  if (pkg.media) {
    for (let i = 0; i < pkg.media.length; i++) {
      const m = pkg.media[i];
      try {
        const res = await fetch(m.url);
        const buf = await res.arrayBuffer();
        const name = m.name ?? `${m.kind}-${i + 1}`;
        folder.file(name, buf);
      } catch (e) {
        console.warn("[pkg] media fail", e);
      }
    }
  }
  const blob = await zip.generateAsync({ type: "blob" });
  saveBlob(blob, `${safeName(pkg.title)}-${pkg.platform}.zip`);
}

// ---- LinkedIn text export ----
export function buildLinkedInPost(opts: { caption: string; hashtags?: string; cta?: string }): string {
  const parts = [opts.caption?.trim()];
  if (opts.cta) parts.push("", opts.cta.trim());
  if (opts.hashtags) parts.push("", opts.hashtags.trim());
  return parts.filter(Boolean).join("\n");
}
