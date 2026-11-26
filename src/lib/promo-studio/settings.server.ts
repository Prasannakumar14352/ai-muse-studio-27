/**
 * Promo Studio settings singleton (promo_settings, id = 1). Server-only.
 * Callers must already have passed requireAdmin; writes use the service role and every change is
 * recorded in promo_audit (old → new).
 *
 * offerId is accepted here; savePromoBrandKit checks the offer is live (isOfferLive) before saving,
 * so only a live offer can be saved (design §4.3 savePromoSettings).
 */
import { z } from "zod";
import { PROMO_BG_MODEL_ALLOWLIST } from "./prices.server";

export type PromoColors = { primary: string; secondary: string; accent: string; text: string };

export type PromoSettings = {
  id: 1;
  enabled: boolean;
  logo_path: string | null;
  colors: PromoColors;
  app_url: string;
  default_cta: string;
  offer_id: string | null;
  monthly_cap_usd: number;
  per_request_cap_usd: number;
  rate_10m: number;
  rate_24h: number;
  bg_models: string[];
  bg_max_megapixels: number;
  cap_alerted_month: string | null;
  updated_by: string | null;
  updated_at: string;
};

type Res<T> = PromiseLike<{ data: T; error: { message: string } | null }>;

/** The slice of the service-role client this module uses (promo tables aren't in the generated types yet). */
export type SettingsDb = {
  from(table: string): {
    select(cols: string): { eq(col: string, val: unknown): { maybeSingle(): Res<Record<string, unknown> | null> } };
    update(patch: Record<string, unknown>): { eq(col: string, val: unknown): Res<unknown> };
    insert(row: Record<string, unknown>): Res<unknown>;
  };
};

async function serviceDb(): Promise<SettingsDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // promo_settings / promo_audit aren't in the generated Database types until types.ts is regenerated.
  return supabaseAdmin as unknown as SettingsDb;
}

/** Env kill switch (design §9): PROMO_STUDIO_DISABLED=1 turns the whole tool off. */
export function isPromoDisabledByEnv(): boolean {
  const v = (process.env.PROMO_STUDIO_DISABLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}

function toSettings(row: Record<string, unknown>): PromoSettings {
  return {
    ...(row as unknown as PromoSettings),
    // numeric columns come back from PostgREST as numbers or strings depending on precision
    monthly_cap_usd: Number(row.monthly_cap_usd),
    per_request_cap_usd: Number(row.per_request_cap_usd),
    bg_max_megapixels: Number(row.bg_max_megapixels),
    rate_10m: Number(row.rate_10m),
    rate_24h: Number(row.rate_24h),
    bg_models: Array.isArray(row.bg_models) ? (row.bg_models as string[]) : [],
  };
}

export async function loadPromoSettings(opts: { db?: SettingsDb } = {}): Promise<PromoSettings> {
  const db = opts.db ?? (await serviceDb());
  const { data, error } = await db.from("promo_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error(`Couldn't load Promo Studio settings: ${error.message}`);
  if (!data) throw new Error("Promo Studio settings are missing (run the promo_studio migration).");
  return toSettings(data);
}

/** Background models usable now: the DB list ∩ the code allowlist (the DB alone can't enable a model). */
export function allowedBgModels(s: Pick<PromoSettings, "bg_models">): string[] {
  return s.bg_models.filter((m) => PROMO_BG_MODEL_ALLOWLIST.includes(m));
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Admin-editable fields. Bounds mirror the promo_settings CHECK constraints. */
export const promoSettingsPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    colors: z
      .object({
        primary: z.string().regex(HEX),
        secondary: z.string().regex(HEX),
        accent: z.string().regex(HEX),
        text: z.string().regex(HEX),
      })
      .strict()
      .optional(),
    appUrl: z.string().trim().url().startsWith("https://").max(200).optional(),
    defaultCta: z.string().trim().min(1).max(40).optional(),
    offerId: z.string().uuid().nullable().optional(),
    monthlyCapUsd: z.number().finite().min(0).max(500).optional(),
    perRequestCapUsd: z.number().finite().min(0.01).max(25).optional(),
    rate10m: z.number().int().min(1).max(500).optional(),
    rate24h: z.number().int().min(1).max(5000).optional(),
  })
  .strict();

export type PromoSettingsPatch = z.infer<typeof promoSettingsPatchSchema>;

const COLUMN: Record<keyof PromoSettingsPatch, keyof PromoSettings> = {
  enabled: "enabled",
  colors: "colors",
  appUrl: "app_url",
  defaultCta: "default_cta",
  offerId: "offer_id",
  monthlyCapUsd: "monthly_cap_usd",
  perRequestCapUsd: "per_request_cap_usd",
  rate10m: "rate_10m",
  rate24h: "rate_24h",
};

/**
 * Apply a validated patch and audit it. Only changed fields are written and audited.
 * Returns the fresh settings.
 */
export async function savePromoSettings(
  adminId: string,
  rawPatch: unknown,
  opts: { db?: SettingsDb } = {},
): Promise<PromoSettings> {
  const patch = promoSettingsPatchSchema.parse(rawPatch);
  const db = opts.db ?? (await serviceDb());
  const current = await loadPromoSettings({ db });

  const update: Record<string, unknown> = {};
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const [k, v] of Object.entries(patch) as Array<[keyof PromoSettingsPatch, unknown]>) {
    if (v === undefined) continue;
    const col = COLUMN[k];
    const old = current[col];
    if (JSON.stringify(old) === JSON.stringify(v)) continue;
    update[col] = v;
    changes[col] = { old, new: v };
  }
  if (Object.keys(update).length === 0) return current;

  const { error } = await db
    .from("promo_settings")
    .update({ ...update, updated_by: adminId, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw new Error(`Couldn't save Promo Studio settings: ${error.message}`);

  const { error: auditErr } = await db.from("promo_audit").insert({
    admin_id: adminId,
    action: "settings.update",
    target_id: null,
    details: changes,
  });
  if (auditErr) throw new Error(`Settings saved, but the audit entry failed: ${auditErr.message}`);

  return loadPromoSettings({ db });
}
