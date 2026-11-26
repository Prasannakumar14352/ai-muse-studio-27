// settings.server: load, validated patch, audit of every change, bg-model allowlist, env kill switch.
import { describe, it, expect, afterEach } from "vitest";
import {
  loadPromoSettings,
  savePromoSettings,
  allowedBgModels,
  isPromoDisabledByEnv,
  type SettingsDb,
} from "@/lib/promo-studio/settings.server";

const ADMIN = "11111111-1111-4111-8111-111111111111";

function fakeDb(row: Record<string, unknown>) {
  const updates: Array<Record<string, unknown>> = [];
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const db: SettingsDb = {
    from(table) {
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { ...row }, error: null }) }) }),
        update: (patch) => ({
          eq: () => {
            updates.push(patch);
            Object.assign(row, patch);
            return Promise.resolve({ data: null, error: null });
          },
        }),
        insert: (r) => {
          inserts.push({ table, row: r });
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
  return { db, updates, inserts };
}

const baseRow = () => ({
  id: 1,
  enabled: true,
  logo_path: null,
  colors: { primary: "#7C3AED", secondary: "#0EA5E9", accent: "#F59E0B", text: "#FFFFFF" },
  app_url: "https://creatorflowai.prodxstore.com",
  default_cta: "Start free",
  offer_id: null,
  monthly_cap_usd: "10.00",
  per_request_cap_usd: "1.00",
  rate_10m: 40,
  rate_24h: 300,
  bg_models: ["fal-ai/flux/schnell", "fal-ai/nano-banana"],
  bg_max_megapixels: "1.00",
  cap_alerted_month: null,
  updated_by: null,
  updated_at: "2026-11-26T00:00:00Z",
});

afterEach(() => {
  delete process.env.PROMO_STUDIO_DISABLED;
});

describe("promo settings", () => {
  it("loads the SPK defaults with numeric money fields", async () => {
    const s = await loadPromoSettings({ db: fakeDb(baseRow()).db });
    expect(s.monthly_cap_usd).toBe(10);
    expect(s.per_request_cap_usd).toBe(1);
    expect(s.bg_max_megapixels).toBe(1);
  });

  it("only allowlisted background models survive, whatever the DB says", async () => {
    const s = await loadPromoSettings({ db: fakeDb(baseRow()).db });
    expect(allowedBgModels(s)).toEqual(["fal-ai/flux/schnell"]);
  });

  it("writes and audits only the changed fields (old → new)", async () => {
    const f = fakeDb(baseRow());
    await savePromoSettings(ADMIN, { monthlyCapUsd: 20, perRequestCapUsd: 1, rate10m: 40 }, { db: f.db });
    expect(f.updates).toHaveLength(1);
    expect(f.updates[0]).toMatchObject({ monthly_cap_usd: 20, updated_by: ADMIN });
    expect(f.updates[0]).not.toHaveProperty("per_request_cap_usd");
    expect(f.inserts).toEqual([
      {
        table: "promo_audit",
        row: {
          admin_id: ADMIN,
          action: "settings.update",
          target_id: null,
          details: { monthly_cap_usd: { old: 10, new: 20 } },
        },
      },
    ]);
  });

  it("a no-op patch writes nothing", async () => {
    const f = fakeDb(baseRow());
    await savePromoSettings(ADMIN, { monthlyCapUsd: 10 }, { db: f.db });
    expect(f.updates).toHaveLength(0);
    expect(f.inserts).toHaveLength(0);
  });

  it("rejects out-of-range money, unknown fields and non-https URLs", async () => {
    const f = fakeDb(baseRow());
    for (const bad of [
      { monthlyCapUsd: 501 },
      { monthlyCapUsd: -1 },
      { perRequestCapUsd: 0 },
      { perRequestCapUsd: 26 },
      { rate10m: 0 },
      { appUrl: "http://example.com" },
      { colors: { primary: "red", secondary: "#000000", accent: "#000000", text: "#000000" } },
      { bgModels: ["fal-ai/nano-banana"] },
      { bgMaxMegapixels: 4 },
    ]) {
      await expect(savePromoSettings(ADMIN, bad, { db: f.db })).rejects.toThrow();
    }
    expect(f.updates).toHaveLength(0);
  });

  it("PROMO_STUDIO_DISABLED=1 is the env kill switch", () => {
    expect(isPromoDisabledByEnv()).toBe(false);
    process.env.PROMO_STUDIO_DISABLED = "1";
    expect(isPromoDisabledByEnv()).toBe(true);
  });
});
