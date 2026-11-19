const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-IN");

export const rupees = (v: number) => (Math.abs(v) < 100 && v % 1 !== 0 ? inr2 : inr0).format(v);
export const count = (v: number) => num.format(v);
export const pct = (v: number) => `${Math.round(v * 100)}%`;

export function delta(now: number, before: number): { text: string; dir: "up" | "down" | "flat" } {
  if (now === before) return { text: "same", dir: "flat" };
  if (before === 0) return { text: `+${num.format(now)}`, dir: now > 0 ? "up" : "down" };
  const change = (now - before) / Math.abs(before);
  return { text: `${change > 0 ? "+" : ""}${Math.round(change * 100)}%`, dir: change > 0 ? "up" : "down" };
}

const LABELS: Record<string, string> = {
  image: "Image", image_hd: "HD image", voiceover: "Voiceover", video_script: "Video script",
  publish_kit: "Publish kit", carousel_plan: "Carousel plan", model_image: "Model studio image",
  linkedin_generate: "LinkedIn post", linkedin_carousel: "LinkedIn carousel",
};
export const featureName = (a: string) => LABELS[a] ?? a.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function ago(iso: string | null): string {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
