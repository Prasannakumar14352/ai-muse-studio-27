import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type { StockItem, StockSearchResult, StockType, StockOrientation } from "@/lib/stock-media.server";

const typeSchema = z.enum(["photo", "illustration", "vector", "video"]);

const searchSchema = z.object({
  query: z.string().max(100).default(""),
  type: typeSchema.default("photo"),
  page: z.number().int().min(1).max(20).default(1),
  orientation: z.enum(["all", "horizontal", "vertical"]).default("all"),
});

/** Search free Pixabay photos, illustrations, vectors and videos (0 credits). */
export const searchStockFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => searchSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { searchStock } = await import("@/lib/stock-media.server");
    return searchStock(context.userId, data);
  });

/** Copy a picked Pixabay item into the user's Asset Library and return our own URL. */
export const importStockFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.number().int().positive(), type: typeSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { importStock } = await import("@/lib/stock-media.server");
    return importStock(context.userId, data);
  });

export const stockStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { isStockConfigured } = await import("@/lib/stock-media.server");
    return { configured: isStockConfigured() };
  });
