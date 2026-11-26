// Promo Studio AI background (design §6.2): fal flux/schnell, ≤1 MP, abstract on-brand shapes,
// never text. Caller wraps it in withSpend; on failure the template falls back to a gradient.
import { falRunSync } from "@/lib/providers/fal-image.server";
import { SpendCallError } from "./budget.server";
import { BG_SIZE_PX } from "./prices.server";
import type { PromoColors } from "./settings.server";
import type { PromoSize } from "./constants";

export function backgroundInput(size: PromoSize, colors: PromoColors, festive: boolean) {
  const { width, height } = BG_SIZE_PX[size];
  const prompt =
    `Abstract modern advertising background, soft gradient shapes and gentle light, colours ${colors.primary}, ${colors.secondary} and ${colors.accent}` +
    (festive ? ", subtle festive sparkles and bokeh" : "") +
    ", clean empty space in the middle, no text, no letters, no logos, no UI, no people.";
  return {
    width,
    height,
    input: {
      prompt,
      image_size: { width, height },
      num_images: 1,
      num_inference_steps: 4,
      enable_safety_checker: true,
      output_format: "jpeg",
      sync_mode: true,
    },
  };
}

/** Generate one background and upload it to renders/<admin>/promo-studio/bg/<creativeId>.jpg. */
export async function generateBackground(args: {
  model: string;
  size: PromoSize;
  colors: PromoColors;
  festive: boolean;
  adminId: string;
  creativeId: string;
}): Promise<{
  value: string;
  actualUsd: null;
  units: number;
  requestId: string | null;
  creativeId: string;
}> {
  const { width, height, input } = backgroundInput(args.size, args.colors, args.festive);
  const units = (width * height) / 1e6;
  const { res, out } = await falRunSync(args.model, input, { signal: AbortSignal.timeout(20_000) });
  const requestId = res.headers.get("x-fal-request-id");
  const nsfw = (out as { has_nsfw_concepts?: boolean[] }).has_nsfw_concepts?.[0] === true;
  const url = out.images?.[0]?.url;
  if (!res.ok || !url || nsfw) {
    throw new SpendCallError(
      nsfw ? "Background blocked by the safety filter" : `Background failed (${res.status})`,
      {
        units,
        requestId,
      },
    );
  }
  const bytes = url.startsWith("data:")
    ? Buffer.from(url.slice(url.indexOf(",") + 1), "base64")
    : Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(10_000) })).arrayBuffer());

  const path = `${args.adminId}/promo-studio/bg/${args.creativeId}.jpg`;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.storage
    .from("renders")
    .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (error)
    throw new SpendCallError(`Background upload failed: ${error.message}`, { units, requestId });
  return { value: path, actualUsd: null, units, requestId, creativeId: args.creativeId };
}
