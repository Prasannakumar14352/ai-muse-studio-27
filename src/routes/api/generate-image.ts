import { createFileRoute } from "@tanstack/react-router";

/**
 * Image generation / editing endpoint, served by fal.ai.
 *
 *   - Plain generation → fal-ai/flux/schnell (1 credit)
 *   - quality "high" → fal-ai/nano-banana, Google's Gemini image model (HD credits)
 *   - Any input image or edit op (upscale, remove background, inpaint,
 *     outpaint, eraser, references) → fal-ai/nano-banana/edit
 *
 * Returns JSON { image: <data URL> }; the client helper (image-stream.ts)
 * already accepts this non-streaming shape. Requires FAL_KEY.
 */
export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getUserIdFromRequest, unauthorized } = await import("@/lib/route-auth.server");
        const userId = await getUserIdFromRequest(request);
        if (!userId) return unauthorized();
        const {
          prompt,
          style,
          ratio,
          background,
          quality,
          model: modelOverride,
          image,
          referenceImages,
          styleImages,
          negativePrompt,
          seed,
          cfg,
          styleStrength,
          operation,
          maskHint,
          outpaintDirection,
        } = (await request.json()) as {
          prompt: string;
          style?: string;
          ratio?: string;
          background?: "transparent" | "opaque";
          quality?: "low" | "medium" | "high";
          model?: string;
          image?: string;
          referenceImages?: string[];
          styleImages?: string[];
          negativePrompt?: string;
          seed?: number;
          cfg?: number;
          styleStrength?: number;
          operation?: "generate" | "upscale" | "removeBg" | "inpaint" | "outpaint" | "eraser";
          maskHint?: string;
          outpaintDirection?: "left" | "right" | "top" | "bottom" | "all";
        };

        const key = process.env.FAL_KEY;
        if (!key) {
          return json({ error: "Image generation is not configured (missing FAL_KEY)." }, 500);
        }
        if (!prompt || !prompt.trim()) {
          return json({ error: "Prompt required" }, 400);
        }

        const stylePrefix = style ? `${style} style. ` : "";

        // Editing op prefix — natural-language instruction the model can follow.
        let opPrefix = "";
        switch (operation) {
          case "upscale":
            opPrefix = "Upscale this image to higher resolution. Preserve every detail; sharpen textures; do not restyle or recompose. ";
            break;
          case "removeBg":
            opPrefix = "Remove the background completely. Output the subject on a fully transparent background (or pure white if transparency unavailable). Preserve edges and hair. ";
            break;
          case "inpaint":
            opPrefix = `Inpaint / replace this region: ${maskHint || "the described area"}. Match lighting, perspective, and grain of the rest of the image. `;
            break;
          case "outpaint":
            opPrefix = `Extend / outpaint this image on the ${outpaintDirection ?? "all"} side(s). Seamlessly continue the scene, lighting, and style. `;
            break;
          case "eraser":
            opPrefix = `Magic-erase: remove ${maskHint || "the described object"} from the image and cleanly fill the background where it was. Do not add anything else. `;
            break;
        }

        const negativeSuffix = negativePrompt?.trim()
          ? ` Avoid: ${negativePrompt.trim()}.`
          : "";
        const hintsSuffix = [
          seed !== undefined ? `seed:${seed}` : null,
          cfg !== undefined ? `guidance:${cfg}` : null,
          styleStrength !== undefined ? `style_strength:${styleStrength}` : null,
        ]
          .filter(Boolean)
          .join(" ");
        const hintsLine = hintsSuffix ? ` [${hintsSuffix}]` : "";

        const fullPrompt = `${opPrefix}${stylePrefix}${prompt}${negativeSuffix}${hintsLine}`;

        // Collect all attached images (edit source + refs + style refs).
        const allImages: string[] = [];
        if (image) allImages.push(image);
        if (referenceImages?.length) allImages.push(...referenceImages);
        if (styleImages?.length) allImages.push(...styleImages);

        const isEdit = allImages.length > 0 || (!!operation && operation !== "generate");
        if (isEdit && allImages.length === 0) {
          return json({ error: "This edit needs an input image." }, 400);
        }
        // Standard renders use FLUX Schnell (~$0.003); HD ("high" quality) and every
        // edit use Nano Banana (~$0.04), so they cost more credits.
        const hd = isEdit || quality === "high";
        const endpoint = isEdit ? "fal-ai/nano-banana/edit" : hd ? "fal-ai/nano-banana" : "fal-ai/flux/schnell";
        const { ACTION_COSTS } = await import("@/lib/credits-guard.server");
        const credits = hd ? ACTION_COSTS.image_hd : ACTION_COSTS.image;
        const RATIOS = ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"];
        const aspect = ratio && RATIOS.includes(ratio) ? ratio : isEdit ? "auto" : "1:1";

        const FLUX_SIZE: Record<string, string> = {
          "1:1": "square_hd", "9:16": "portrait_16_9", "16:9": "landscape_16_9",
          "4:3": "landscape_4_3", "3:4": "portrait_4_3", "4:5": "portrait_4_3", "5:4": "landscape_4_3",
        };
        const input: Record<string, unknown> = {
          prompt: fullPrompt,
          num_images: 1,
          ...(endpoint === "fal-ai/flux/schnell"
            ? { image_size: FLUX_SIZE[aspect] ?? "square_hd", enable_safety_checker: true }
            : { aspect_ratio: aspect }),
          output_format: background === "transparent" || operation === "removeBg" ? "png" : "jpeg",
          sync_mode: true,
        };
        if (isEdit) input.image_urls = allImages;
        if (typeof seed === "number") input.seed = seed;
        void modelOverride;

        // Reserve credits before calling the provider; refunded below on failure.
        const { chargeCredits } = await import("@/lib/credits-guard.server");
        let reservation: Awaited<ReturnType<typeof chargeCredits>>;
        try {
          reservation = await chargeCredits({
            userId,
            action: hd ? "image_hd" : "image",
            amount: credits,
            description: hd ? (isEdit ? `Image ${operation ?? "edit"} (HD)` : "AI image (HD)") : "AI image",
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.startsWith("insufficient_credits:")) {
            return json({ error: `Not enough credits: this image needs ${credits}.` }, 402);
          }
          return json({ error: msg }, 400);
        }

        type FalOut = { images?: Array<{ url?: string; content_type?: string }>; detail?: unknown };
        const callFal = async (ep: string, body: Record<string, unknown>) => {
          const res = await fetch(`https://fal.run/${ep}`, {
            method: "POST",
            headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          return { res, out: (await res.json().catch(() => ({}))) as FalOut };
        };
        const isPolicyBlock = (o: FalOut) => JSON.stringify(o.detail ?? "").includes("content_policy_violation");

        let upstream: Response;
        let out: FalOut;
        let usedModel = endpoint;
        try {
          ({ res: upstream, out } = await callFal(endpoint, input));
          // Nano Banana (Gemini) refuses some edits on photos with people.
          // Retry a single-image edit once on FLUX Kontext, which handles them.
          if (!upstream.ok && isEdit && allImages.length === 1 && isPolicyBlock(out)) {
            const KONTEXT_RATIOS = ["21:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16"];
            usedModel = "fal-ai/flux-pro/kontext";
            ({ res: upstream, out } = await callFal(usedModel, {
              prompt: fullPrompt,
              image_url: allImages[0],
              num_images: 1,
              ...(KONTEXT_RATIOS.includes(aspect) ? { aspect_ratio: aspect } : {}),
              output_format: input.output_format,
              safety_tolerance: "2",
              sync_mode: true,
              ...(typeof seed === "number" ? { seed } : {}),
            }));
          }
        } catch (error) {
          await reservation.refund("provider_unreachable");
          return json({ error: error instanceof Error ? error.message : "Image service unreachable" }, 502);
        }

        if (!upstream.ok) {
          await reservation.refund(`provider_${upstream.status}`);
          if (isPolicyBlock(out)) {
            return json({
              error: "The AI safety filter declined this edit. Try rewording it (for example, describe exactly what to remove). Your credits were refunded.",
            }, 422);
          }
          const detail = typeof out.detail === "string" ? out.detail : JSON.stringify(out.detail ?? out);
          return json({ error: `Image generation failed (${upstream.status}). Credits refunded. ${detail.slice(0, 160)}` }, upstream.status);
        }
        let url = out.images?.[0]?.url;
        if (!url) {
          await reservation.refund("no_image");
          return json({ error: "No image returned" }, 502);
        }

        // sync_mode returns a data URI; fall back to fetching a hosted URL.
        if (!url.startsWith("data:")) {
          const img = await fetch(url);
          const buf = Buffer.from(await img.arrayBuffer());
          url = `data:${img.headers.get("content-type") ?? "image/png"};base64,${buf.toString("base64")}`;
        }
        await reservation.finalize();
        return json({ image: url, model: usedModel, credits });
      },
    },
  },
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
