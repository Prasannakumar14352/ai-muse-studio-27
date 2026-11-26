// Promo Studio server functions (design §4). Admin-only: every fn except getPromoAdminGate runs
// requireAdmin (signed in + has_role admin). No user credits are touched; provider spend is
// logged to promo_cost_log through withSpend.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/require-admin";
import {
  PROMO_FEATURE_TAGS,
  PROMO_FORMATS,
  PROMO_LANGUAGES,
  PROMO_SIZES,
  PROMO_TEMPLATES,
  SIZE_PX,
  type PromoSize,
} from "@/lib/promo-studio/constants";

type AdminCtx = { adminId: string };
const ctx = (c: unknown) => c as AdminCtx;
const UUID = "[0-9a-f-]{36}";
const SIGN_TTL = 60 * 60; // 1 hour for previews / downloads

/* eslint-disable @typescript-eslint/no-explicit-any -- promo tables aren't in the generated types yet */
async function db(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertEnabled() {
  const { isPromoDisabledByEnv, loadPromoSettings } =
    await import("@/lib/promo-studio/settings.server");
  if (isPromoDisabledByEnv()) throw new Error("Promo Studio is turned off");
  return loadPromoSettings();
}

async function signMany(paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  if (!list.length) return {};
  const { data, error } = await (
    await db()
  ).storage
    .from("renders")
    .createSignedUrls(list, SIGN_TTL);
  if (error) throw new Error(`Couldn't sign files: ${error.message}`);
  const out: Record<string, string> = {};
  for (const r of data ?? []) if (r.path && r.signedUrl) out[r.path] = r.signedUrl;
  return out;
}

type OfferSnapshot = { id: string; code: string; label: string; endsAt: string | null } | null;

/** The offer Promo Studio uses: the one picked in settings if live, else the newest live offer. */
async function liveOfferSnapshot(offerId: string | null): Promise<OfferSnapshot> {
  const { isOfferLive, offerLabel } = await import("@/lib/offers.server");
  const { data } = await (
    await db()
  )
    .from("offers")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(20);
  const live = ((data ?? []) as any[]).filter((o) => isOfferLive(o));
  const o = (offerId && live.find((x) => x.id === offerId)) || live[0];
  if (!o) return null;
  return { id: o.id, code: o.code, label: `${o.title} · ${offerLabel(o)}`, endsAt: o.ends_at };
}

/* ---------------- gate ---------------- */

/** Route guard. Never throws for non-admins and returns no data. */
export const getPromoAdminGate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isPromoDisabledByEnv } = await import("@/lib/promo-studio/settings.server");
    if (isPromoDisabledByEnv()) return { isAdmin: false };
    const { data } = await (
      await db()
    ).rpc("has_role", {
      _user_id: (context as { userId: string }).userId,
      _role: "admin",
    });
    return { isAdmin: data === true };
  });

/* ---------------- studio data ---------------- */

export const getPromoStudio = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const s = await assertEnabled();
    const d = await db();
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [assetsRes, spendRes, offer] = await Promise.all([
      d
        .from("promo_assets")
        .select("id,path,label,feature_tag,width,height,created_at")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(100),
      d
        .from("promo_cost_log")
        .select("est_usd,actual_usd")
        .gte("created_at", monthStart.toISOString()),
      liveOfferSnapshot(s.offer_id),
    ]);
    const assets = (assetsRes.data ?? []) as any[];
    const signed = await signMany([s.logo_path, ...assets.map((a) => a.path)]);
    const monthSpend = ((spendRes.data ?? []) as any[]).reduce(
      (t, r) => t + Number(r.actual_usd ?? r.est_usd ?? 0),
      0,
    );
    return {
      brand: {
        colors: s.colors,
        appUrl: s.app_url,
        defaultCta: s.default_cta,
        logoUrl: s.logo_path ? (signed[s.logo_path] ?? null) : null,
      },
      offer,
      assets: assets.map((a) => ({
        id: a.id as string,
        label: a.label as string,
        featureTag: a.feature_tag as string,
        url: signed[a.path] ?? "",
      })),
      budget: {
        monthSpend,
        monthlyCap: s.monthly_cap_usd,
        perRequestCap: s.per_request_cap_usd,
        enabled: s.enabled,
      },
    };
  });

/* ---------------- uploads (screenshots, logo, "before" image) ---------------- */

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export const createPromoUpload = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["logo", "asset", "before"]),
        mime: z.enum(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]),
        bytes: z.number().int().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { adminId } = ctx(context);
    if (data.kind === "logo") {
      if (!["image/png", "image/svg+xml"].includes(data.mime))
        throw new Error("Logo must be a PNG or SVG.");
      if (data.bytes > 1_048_576) throw new Error("Logo must be 1 MB or smaller.");
    } else {
      if (data.mime === "image/svg+xml") throw new Error("Use a PNG, JPG or WebP image.");
      if (data.bytes > 5 * 1_048_576) throw new Error("Image must be 5 MB or smaller.");
    }
    const folder = data.kind === "logo" ? "brand" : data.kind === "asset" ? "assets" : "before";
    const path = `${adminId}/promo-studio/${folder}/${crypto.randomUUID()}.${EXT[data.mime]}`;
    const { data: up, error } = await (
      await db()
    ).storage
      .from("renders")
      .createSignedUploadUrl(path);
    if (error || !up) throw new Error(`Couldn't start the upload: ${error?.message ?? "unknown"}`);
    return { path, token: up.token as string };
  });

async function assertObjectExists(path: string) {
  const dir = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await (
    await db()
  ).storage
    .from("renders")
    .list(dir, { search: name, limit: 1 });
  if (error || !(data ?? []).some((f: { name: string }) => f.name === name))
    throw new Error("Upload not found. Try again.");
}

export const commitPromoAssets = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({
        items: z
          .array(
            z.object({
              path: z.string(),
              label: z.string().trim().max(80).default(""),
              featureTag: z.enum(PROMO_FEATURE_TAGS).default("other"),
              width: z.number().int().min(1).max(10000).optional(),
              height: z.number().int().min(1).max(10000).optional(),
            }),
          )
          .min(1)
          .max(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { adminId } = ctx(context);
    const re = new RegExp(`^${adminId}/promo-studio/assets/${UUID}\\.(png|jpg|webp)$`);
    for (const it of data.items) {
      if (!re.test(it.path)) throw new Error("Invalid upload path");
      await assertObjectExists(it.path);
    }
    const { error } = await (await db()).from("promo_assets").insert(
      data.items.map((it) => ({
        path: it.path,
        label: it.label,
        feature_tag: it.featureTag,
        width: it.width ?? null,
        height: it.height ?? null,
        created_by: adminId,
      })),
    );
    if (error) throw new Error(`Couldn't save screenshots: ${error.message}`);
    return { ok: true };
  });

export const commitPromoLogo = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ path: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { adminId } = ctx(context);
    if (!new RegExp(`^${adminId}/promo-studio/brand/${UUID}\\.(png|svg)$`).test(data.path))
      throw new Error("Invalid upload path");
    await assertObjectExists(data.path);
    const d = await db();
    const { error } = await d
      .from("promo_settings")
      .update({ logo_path: data.path, updated_by: adminId })
      .eq("id", 1);
    if (error) throw new Error(`Couldn't save the logo: ${error.message}`);
    await d
      .from("promo_audit")
      .insert({ admin_id: adminId, action: "settings.logo", details: { path: data.path } });
    return { ok: true };
  });

/* ---------------- generation ---------------- */

const generateSchema = z
  .object({
    template: z.enum(PROMO_TEMPLATES),
    format: z.enum(PROMO_FORMATS),
    size: z.enum(PROMO_SIZES),
    language: z.enum(PROMO_LANGUAGES),
    variants: z.number().int().min(1).max(4),
    slides: z.number().int().min(3).max(5).optional(), // + cover + CTA ≤ 7 rendered slides
    assetIds: z.array(z.string().uuid()).max(7).default([]),
    beforeAssetId: z.string().uuid().optional(),
    beforePath: z.string().optional(),
    aiBackground: z.boolean().default(false),
    topic: z.string().trim().max(300).optional(),
    planItemId: z.string().uuid().optional(),
    regenerate: z.boolean().default(false),
    batchId: z.string().uuid().optional(),
  })
  .superRefine((v, c) => {
    if (v.format === "story" && v.size !== "9:16")
      c.addIssue({ code: "custom", message: "Stories are 9:16" });
    if (v.format === "carousel" && !v.slides)
      c.addIssue({ code: "custom", message: "Carousel needs a slide count" });
    if (v.format !== "carousel" && v.slides)
      c.addIssue({ code: "custom", message: "Slides only apply to carousels" });
  });

export type GenerateInput = z.input<typeof generateSchema>;

export type PromoCreativeView = {
  id: string;
  template: string;
  format: string;
  size: PromoSize;
  language: string;
  hook: string;
  headline: string;
  slides: { title: string; body: string }[];
  cta: string;
  caption: string;
  hashtags: string[];
  copyWarnings: string[];
  offer: { code: string; label: string; endsAt: string | null } | null;
  assetUrls: string[];
  beforeUrl: string | null;
  backgroundUrl: string | null;
  textVersion: number;
  status: string;
  outputUrls: string[];
};

type GenResult =
  | { ok: true; creatives: PromoCreativeView[]; estUsd: number; skipped?: string }
  | { ok: false; code: string; message: string };

export const generatePromoCreatives = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => generateSchema.parse(d))
  .handler(async ({ data, context }): Promise<GenResult> => {
    const { adminId } = ctx(context);
    const { isPromoDisabledByEnv, loadPromoSettings, allowedBgModels } =
      await import("@/lib/promo-studio/settings.server");
    const s = await loadPromoSettings();
    if (isPromoDisabledByEnv() || !s.enabled)
      return { ok: false, code: "disabled", message: "Promo Studio is turned off." };
    const d = await db();

    // Template rules (no spend before these pass).
    const offer = await liveOfferSnapshot(s.offer_id);
    if (data.template === "offer_festival" && !offer)
      return {
        ok: false,
        code: "needs_offer",
        message: "No live offer. Create or activate one in Admin → Offers first.",
      };
    if (data.template !== "offer_festival" && data.assetIds.length === 0)
      return { ok: false, code: "needs_screenshot", message: "Pick at least one app screenshot." };
    let beforePath: string | null = null;
    if (data.template === "before_after") {
      if (data.beforeAssetId) {
        const { data: a } = await d
          .from("promo_assets")
          .select("path")
          .eq("id", data.beforeAssetId)
          .maybeSingle();
        beforePath = a?.path ?? null;
      } else if (
        data.beforePath &&
        new RegExp(`^${adminId}/promo-studio/before/${UUID}\\.(png|jpg|webp)$`).test(
          data.beforePath,
        )
      ) {
        beforePath = data.beforePath;
      }
      if (!beforePath)
        return { ok: false, code: "needs_screenshot", message: 'Add a "before" image.' };
    }
    const { data: assetRows } = data.assetIds.length
      ? await d
          .from("promo_assets")
          .select("id,path,label,feature_tag")
          .in("id", data.assetIds)
          .is("archived_at", null)
      : { data: [] };
    const assets = data.assetIds
      .map((id) => ((assetRows ?? []) as any[]).find((a) => a.id === id))
      .filter(Boolean) as any[];
    if (data.assetIds.length && assets.length !== data.assetIds.length)
      return {
        ok: false,
        code: "invalid",
        message: "A selected screenshot was removed. Pick again.",
      };

    if (data.planItemId && !data.regenerate) {
      const { data: ex } = await d
        .from("promo_creatives")
        .select("id")
        .eq("plan_item_id", data.planItemId)
        .neq("status", "archived")
        .limit(1);
      if ((ex ?? []).length)
        return { ok: true, creatives: [], estUsd: 0, skipped: "Already has a creative" };
    }

    // Prompt + estimate + per-request cap.
    const { HONESTY_RULES } = await import("@/lib/agents/marketing.server");
    const { liveKb } = await import("@/lib/agents/support-kb");
    const { buildCopyPrompt, writeCopy, lintCopy } = await import("@/lib/promo-studio/copy.server");
    const { estimateRequestUsd, estimateCopyUsd, PROMO_COPY_MODEL } =
      await import("@/lib/promo-studio/prices.server");
    const { withSpend, checkPerRequestCap, claimCapAlert } =
      await import("@/lib/promo-studio/budget.server");
    const bgModel = allowedBgModels(s)[0];
    const aiBackground = data.aiBackground && !!bgModel;

    const prompt = buildCopyPrompt({
      kb: await liveKb(d),
      appUrl: s.app_url,
      honestyRules: HONESTY_RULES,
      template: data.template,
      format: data.format,
      language: data.language,
      variants: data.variants,
      slides: data.slides,
      topic: data.topic,
      assets: assets.map((a) => ({ label: a.label, featureTag: a.feature_tag })),
      offerTitle: offer ? offer.label.split(" · ")[0] : null,
    });
    const estUsd = estimateRequestUsd({
      size: data.size,
      variants: data.variants,
      aiBackground,
      inputChars: prompt.system.length + prompt.user.length,
    });
    const cap = checkPerRequestCap(estUsd, s);
    if (!cap.ok) return { ok: false, code: cap.code, message: cap.message };

    const batchId = data.batchId ?? crypto.randomUUID();
    let alert = false;

    // 1) Copy.
    const copy = await withSpend(
      {
        adminId,
        step: "copy",
        provider: "openrouter",
        model: PROMO_COPY_MODEL,
        batchId,
        unitType: "input_tokens+output_tokens",
      },
      estimateCopyUsd({ inputChars: prompt.system.length + prompt.user.length }),
      () =>
        writeCopy(prompt, {
          variants: data.variants,
          slides: data.slides,
          language: data.language,
        }),
    );
    if (!copy.ok) {
      if (copy.code === "provider")
        return { ok: false, code: "copy_failed", message: "Couldn't write the copy. Try again." };
      return { ok: false, code: copy.code, message: copy.message };
    }
    alert ||= copy.alert;

    // 2) Optional backgrounds, in parallel; a failure falls back to the gradient.
    const ids = copy.value.map(() => crypto.randomUUID());
    const bgPaths: (string | null)[] = ids.map(() => null);
    if (aiBackground) {
      const { generateBackground } = await import("@/lib/promo-studio/background.server");
      const { estimateBackgroundUsd, BG_SIZE_PX } =
        await import("@/lib/promo-studio/prices.server");
      const est = estimateBackgroundUsd(BG_SIZE_PX[data.size]);
      const results = await Promise.all(
        ids.map((id) =>
          withSpend(
            {
              adminId,
              step: "background",
              provider: "fal",
              model: bgModel,
              batchId,
              creativeId: id,
              unitType: "megapixels",
            },
            est,
            () =>
              generateBackground({
                model: bgModel,
                size: data.size,
                colors: s.colors,
                festive: data.template === "offer_festival",
                adminId,
                creativeId: id,
              }),
          ),
        ),
      );
      results.forEach((r, i) => {
        if (r.ok) {
          bgPaths[i] = r.value;
          alert ||= r.alert;
        }
      });
    }

    // 3) Insert drafts.
    const utm = (id: string) =>
      `${s.app_url}?utm_source=promo_studio&utm_medium=social&utm_campaign=${data.template}&utm_content=${id.slice(0, 8)}`;
    const rows = copy.value.map((v, i) => ({
      id: ids[i],
      batch_id: batchId,
      template: data.template,
      format: data.format,
      size: data.size,
      language: data.language,
      variant_index: i,
      hook: v.hook,
      headline: v.headline,
      slides: data.format === "carousel" ? (v.slides ?? []) : [],
      cta: v.cta,
      caption: `${v.caption}\n\n${utm(ids[i])}`,
      hashtags: v.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)),
      copy_warnings: lintCopy(v, offer?.code ?? null),
      offer_id: offer?.id ?? null,
      offer_code: offer?.code ?? null,
      offer_label: offer?.label ?? null,
      offer_ends_at: offer?.endsAt ?? null,
      asset_ids: assets.map((a) => a.id),
      before_path: beforePath,
      background_path: bgPaths[i],
      plan_item_id: data.planItemId ?? null,
      created_by: adminId,
    }));
    const { error: insErr } = await d.from("promo_creatives").insert(rows);
    if (insErr) throw new Error(`Couldn't save creatives: ${insErr.message}`);
    await Promise.all(ids.map((id) => d.rpc("promo_refresh_creative_cost", { _creative: id })));

    if (alert) {
      void (async () => {
        try {
          if (await claimCapAlert()) {
            const { alertAdmins } = await import("@/lib/agents/core.server");
            await alertAdmins(
              `Promo Studio has used 80% of its $${s.monthly_cap_usd} budget this month`,
            );
          }
        } catch {
          /* fire-and-forget */
        }
      })();
    }

    const signed = await signMany([...assets.map((a) => a.path), beforePath, ...bgPaths]);
    return {
      ok: true,
      estUsd,
      creatives: rows.map((r) => ({
        id: r.id,
        template: r.template,
        format: r.format,
        size: r.size,
        language: r.language,
        hook: r.hook,
        headline: r.headline,
        slides: r.slides,
        cta: r.cta,
        caption: r.caption,
        hashtags: r.hashtags,
        copyWarnings: r.copy_warnings,
        offer: offer ? { code: offer.code, label: offer.label, endsAt: offer.endsAt } : null,
        assetUrls: assets.map((a) => signed[a.path] ?? ""),
        beforeUrl: beforePath ? (signed[beforePath] ?? null) : null,
        backgroundUrl: r.background_path ? (signed[r.background_path] ?? null) : null,
        textVersion: 1,
        status: "draft",
        outputUrls: [],
      })),
    };
  });

/* ---------------- render upload + commit ---------------- */

export const createPromoRenderUpload = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z.object({ creativeId: z.string().uuid(), slides: z.number().int().min(1).max(7) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { adminId } = ctx(context);
    const d = await db();
    const { data: c } = await d
      .from("promo_creatives")
      .select("id,status,render_version,format,slides")
      .eq("id", data.creativeId)
      .maybeSingle();
    if (!c) throw new Error("Creative not found");
    if (!["draft", "approved"].includes(c.status))
      throw new Error("Only drafts or approved creatives can be rendered");
    const expected = c.format === "carousel" ? (c.slides as unknown[]).length + 2 : 1;
    if (data.slides !== expected) throw new Error(`Expected ${expected} slide(s)`);
    const rv = Number(c.render_version) + 1;
    const { data: upd, error } = await d
      .from("promo_creatives")
      .update({ render_version: rv })
      .eq("id", c.id)
      .eq("render_version", c.render_version)
      .select("id");
    if (error || !(upd ?? []).length) throw new Error("Render already in progress. Try again.");
    const storage = d.storage.from("renders");
    const uploads = [];
    for (let i = 0; i < data.slides; i++) {
      const base = `${adminId}/promo-studio/out/${c.id}/v${rv}-${String(i + 1).padStart(2, "0")}`;
      const png = await storage.createSignedUploadUrl(`${base}.png`);
      const jpg = await storage.createSignedUploadUrl(`${base}.jpg`);
      if (png.error || jpg.error) throw new Error("Couldn't start the upload");
      uploads.push({
        png: { path: `${base}.png`, token: png.data.token as string },
        jpg: { path: `${base}.jpg`, token: jpg.data.token as string },
      });
    }
    return { renderVersion: rv, uploads };
  });

async function pngSize(url: string): Promise<{ w: number; h: number } | null> {
  const res = await fetch(url, {
    headers: { Range: "bytes=0-23" },
    signal: AbortSignal.timeout(10_000),
  });
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length < 24 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return { w: view.getUint32(16), h: view.getUint32(20) };
}

export const commitPromoRender = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({
        creativeId: z.string().uuid(),
        renderVersion: z.number().int().min(1),
        textVersion: z.number().int().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { adminId } = ctx(context);
    const d = await db();
    const { data: c } = await d
      .from("promo_creatives")
      .select("id,status,size,format,slides,render_version,text_version")
      .eq("id", data.creativeId)
      .maybeSingle();
    if (!c) throw new Error("Creative not found");
    if (!["draft", "approved"].includes(c.status))
      throw new Error("Only drafts or approved creatives can be rendered");
    if (Number(c.render_version) !== data.renderVersion)
      throw new Error("A newer render started. Try again.");
    if (Number(c.text_version) !== data.textVersion) throw new Error("Text changed, re-render");
    const n = c.format === "carousel" ? (c.slides as unknown[]).length + 2 : 1;
    const base = (i: number) =>
      `${adminId}/promo-studio/out/${c.id}/v${data.renderVersion}-${String(i + 1).padStart(2, "0")}`;
    const pngs = Array.from({ length: n }, (_, i) => `${base(i)}.png`);
    const jpgs = Array.from({ length: n }, (_, i) => `${base(i)}.jpg`);
    const signed = await signMany([...pngs, ...jpgs]);
    const want = SIZE_PX[c.size as PromoSize];
    for (const p of pngs) {
      if (!signed[p]) throw new Error("Upload not found. Try again.");
      const sz = await pngSize(signed[p]);
      if (!sz) throw new Error("Upload not found or not a PNG. Try again.");
      if (sz.w !== want.width || sz.h !== want.height)
        throw new Error(
          `Rendered image is the wrong size (expected ${want.width}×${want.height}).`,
        );
    }
    if (jpgs.some((p) => !signed[p])) throw new Error("Upload not found. Try again.");
    const { error } = await d
      .from("promo_creatives")
      .update({
        output_paths: pngs,
        publish_paths: jpgs,
        rendered_text_version: data.textVersion,
        updated_at: new Date().toISOString(),
      })
      .eq("id", c.id)
      .eq("render_version", data.renderVersion);
    if (error) throw new Error(`Couldn't save the render: ${error.message}`);
    return { outputUrls: pngs.map((p) => signed[p]) };
  });
/* eslint-enable @typescript-eslint/no-explicit-any */
