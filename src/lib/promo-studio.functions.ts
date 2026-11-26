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
  PROMO_VIDEO_FORMATS,
  PROMO_VIDEO_LENGTHS,
  PROMO_VIDEO_TEMPLATES,
  promoVideoSceneCount,
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
      defaultCta: s.default_cta,
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
  if (!res.ok) return null;
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

/* ================= Step B: Library, edits, status, calendar, showcase ================= */

/* eslint-disable @typescript-eslint/no-explicit-any -- promo tables aren't in the generated types yet */
const VIEW_COLS =
  "id,template,format,size,language,hook,headline,slides,cta,caption,hashtags,copy_warnings,offer_id,offer_code,offer_label,offer_ends_at,asset_ids,before_path,background_path,output_paths,text_version,rendered_text_version,status,schedule_note,scheduled_post_ids,cost_usd,created_at,updated_at";

export type PromoLibraryItem = PromoCreativeView & {
  costUsd: number;
  scheduleNote: string | null;
  scheduledPostIds: string[];
  createdAt: string;
};

/** Rows → views with every image signed in one batch. outputUrls only when the render is current. */
async function toViews(rows: any[]): Promise<PromoLibraryItem[]> {
  const d = await db();
  const assetIds = [...new Set(rows.flatMap((r) => (r.asset_ids ?? []) as string[]))];
  const { data: assets } = assetIds.length
    ? await d.from("promo_assets").select("id,path").in("id", assetIds)
    : { data: [] };
  const assetPath = new Map(((assets ?? []) as any[]).map((a) => [a.id, a.path as string]));
  const signed = await signMany(
    rows.flatMap((r) => [
      r.before_path,
      r.background_path,
      ...(r.output_paths ?? []),
      ...((r.asset_ids ?? []) as string[]).map((id) => assetPath.get(id)),
    ]),
  );
  return rows.map((r) => {
    const current = (r.output_paths ?? []).length > 0 && r.rendered_text_version === r.text_version;
    return {
      id: r.id,
      template: r.template,
      format: r.format,
      size: r.size,
      language: r.language,
      hook: r.hook,
      headline: r.headline,
      slides: r.slides ?? [],
      cta: r.cta,
      caption: r.caption,
      hashtags: r.hashtags ?? [],
      copyWarnings: r.copy_warnings ?? [],
      offer: r.offer_code
        ? { code: r.offer_code, label: r.offer_label ?? "", endsAt: r.offer_ends_at }
        : null,
      assetUrls: ((r.asset_ids ?? []) as string[])
        .map((id) => signed[assetPath.get(id) ?? ""] ?? "")
        .filter(Boolean),
      beforeUrl: r.before_path ? (signed[r.before_path] ?? null) : null,
      backgroundUrl: r.background_path ? (signed[r.background_path] ?? null) : null,
      textVersion: r.text_version,
      status: r.status,
      outputUrls: current
        ? (r.output_paths as string[]).map((p) => signed[p] ?? "").filter(Boolean)
        : [],
      costUsd: Number(r.cost_usd ?? 0),
      scheduleNote: r.schedule_note ?? null,
      scheduledPostIds: r.scheduled_post_ids ?? [],
      createdAt: r.created_at,
    };
  });
}

async function audit(
  adminId: string,
  action: string,
  targetId: string | null,
  details: Record<string, unknown>,
) {
  await (
    await db()
  )
    .from("promo_audit")
    .insert({ admin_id: adminId, action, target_id: targetId, details });
}

/** Design §7.3: settle scheduled creatives against their scheduled_posts rows. */
async function syncScheduled() {
  const d = await db();
  const { data: sched } = await d
    .from("promo_creatives")
    .select("id,scheduled_post_ids")
    .eq("status", "scheduled")
    .limit(200);
  const list = (sched ?? []) as any[];
  if (!list.length) return;
  const ids = [...new Set(list.flatMap((c) => c.scheduled_post_ids as string[]))];
  const { data: posts } = ids.length
    ? await d.from("scheduled_posts").select("id,status,last_error").in("id", ids)
    : { data: [] };
  const byId = new Map(((posts ?? []) as any[]).map((p) => [p.id, p]));
  for (const c of list) {
    const linked = (c.scheduled_post_ids as string[])
      .map((id) => byId.get(id))
      .filter(Boolean) as any[];
    const ids2 = linked.map((p) => p.id);
    if (!linked.length) {
      await d
        .from("promo_creatives")
        .update({ status: "approved", scheduled_post_ids: [], schedule_note: null })
        .eq("id", c.id)
        .eq("status", "scheduled");
    } else if (linked.every((p) => ["published", "manually_published"].includes(p.status))) {
      await d
        .from("promo_creatives")
        .update({ status: "posted", schedule_note: null })
        .eq("id", c.id)
        .eq("status", "scheduled");
    } else {
      const failed = linked.find((p) => ["failed", "reconnect_required"].includes(p.status));
      await d
        .from("promo_creatives")
        .update({
          scheduled_post_ids: ids2,
          schedule_note: failed
            ? `Post failed: ${failed.last_error ?? failed.status}`.slice(0, 300)
            : null,
        })
        .eq("id", c.id)
        .eq("status", "scheduled");
    }
  }
}

export const listPromoCreatives = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z
          .enum(["draft", "approved", "scheduled", "posted", "archived", "active"])
          .default("active"),
        template: z.enum(PROMO_TEMPLATES).optional(),
        page: z.number().int().min(0).max(1000).default(0),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    await assertEnabled();
    await syncScheduled();
    const d = await db();
    let q = d.from("promo_creatives").select(VIEW_COLS, { count: "exact" });
    q = data.status === "active" ? q.neq("status", "archived") : q.eq("status", data.status);
    if (data.template) q = q.eq("template", data.template);
    const {
      data: rows,
      count,
      error,
    } = await q
      .order("created_at", { ascending: false })
      .range(data.page * 24, data.page * 24 + 23);
    if (error) throw new Error(error.message);
    return { items: await toViews(rows ?? []), total: count ?? 0, pageSize: 24 };
  });

export const getPromoCreative = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await assertEnabled();
    const { data: row } = await (
      await db()
    )
      .from("promo_creatives")
      .select(VIEW_COLS)
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Creative not found");
    return (await toViews([row]))[0];
  });

export const updatePromoCreativeText = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        headline: z.string().trim().min(1).max(120).optional(),
        hook: z.string().trim().min(1).max(120).optional(),
        cta: z.string().trim().min(1).max(40).optional(),
        caption: z.string().max(2200).optional(),
        hashtags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
        slides: z
          .array(z.object({ title: z.string().trim().min(1).max(80), body: z.string().max(200) }))
          .min(3)
          .max(5)
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { adminId } = ctx(context);
    const d = await db();
    const { data: c } = await d
      .from("promo_creatives")
      .select("id,status,format,slides,text_version")
      .eq("id", data.id)
      .maybeSingle();
    if (!c) throw new Error("Creative not found");
    if (!["draft", "approved"].includes(c.status))
      throw new Error("Only drafts or approved creatives can be edited");
    if (
      data.slides &&
      (c.format !== "carousel" || data.slides.length !== (c.slides as unknown[]).length)
    )
      throw new Error("Keep the same number of slides");
    const patch: Record<string, unknown> = { text_version: Number(c.text_version) + 1 };
    for (const k of ["headline", "hook", "cta", "caption", "slides"] as const)
      if (data[k] !== undefined) patch[k] = data[k];
    if (data.hashtags) patch.hashtags = data.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`));
    if (c.status === "approved")
      Object.assign(patch, { status: "draft", approved_by: null, approved_at: null });
    const { data: upd, error } = await d
      .from("promo_creatives")
      .update(patch)
      .eq("id", c.id)
      .eq("text_version", c.text_version)
      .select(VIEW_COLS);
    if (error) throw new Error(error.message);
    if (!(upd ?? []).length)
      throw new Error("Someone else just edited this. Reload and try again.");
    await audit(adminId, "creative.edit", c.id, { fields: Object.keys(patch) });
    return (await toViews(upd))[0];
  });

async function assertOfferStillLive(c: any) {
  if (!c.offer_code) return;
  const { isOfferLive } = await import("@/lib/offers.server");
  const { data: o } = c.offer_id
    ? await (await db()).from("offers").select("*").eq("id", c.offer_id).maybeSingle()
    : { data: null };
  if (!o || o.code !== c.offer_code || !isOfferLive(o))
    throw new Error("This offer has ended. Regenerate or remove the offer.");
  return o;
}

export const setPromoCreativeStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), to: z.enum(["approved", "draft", "posted", "archived"]) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { adminId } = ctx(context);
    const d = await db();
    const { data: c } = await d.from("promo_creatives").select("*").eq("id", data.id).maybeSingle();
    if (!c) throw new Error("Creative not found");
    const allowed: Record<string, string[]> = {
      approved: ["draft"],
      draft: ["approved", "archived"],
      posted: ["approved"],
      archived: ["draft", "approved"],
    };
    if (!allowed[data.to].includes(c.status))
      throw new Error(`Can't move a ${c.status} creative to ${data.to}.`);
    const patch: Record<string, unknown> = { status: data.to };
    if (data.to === "approved") {
      if (!(c.output_paths ?? []).length || c.rendered_text_version !== c.text_version)
        throw new Error("Render the creative before approving it");
      await assertOfferStillLive(c);
      Object.assign(patch, { approved_by: adminId, approved_at: new Date().toISOString() });
    }
    if (data.to === "draft" && c.status === "approved")
      Object.assign(patch, { approved_by: null, approved_at: null });
    const { data: upd, error } = await d
      .from("promo_creatives")
      .update(patch)
      .eq("id", c.id)
      .eq("status", c.status)
      .select(VIEW_COLS);
    if (error) throw new Error(error.message);
    if (!(upd ?? []).length) throw new Error(`Can't move a ${c.status} creative to ${data.to}.`);
    await audit(adminId, "creative.transition", c.id, { from: c.status, to: data.to });
    return (await toViews(upd))[0];
  });

/** Admin's own connected accounts that can take an image post. */
export const getPromoConnections = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { adminId } = ctx(context);
    const { data } = await (
      await db()
    )
      .from("platform_connections")
      .select("id,platform,account_label,status")
      .eq("user_id", adminId)
      .in("platform", ["instagram", "facebook", "linkedin"]);
    return ((data ?? []) as any[]).map((c) => ({
      id: c.id as string,
      platform: c.platform as "instagram" | "facebook" | "linkedin",
      label: (c.account_label as string) || c.platform,
      ok: c.status === "connected",
    }));
  });

export const schedulePromoCreative = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({
        creativeId: z.string().uuid(),
        targets: z
          .array(
            z.object({
              platform: z.enum(["instagram", "facebook", "linkedin"]),
              connectionId: z.string().uuid(),
            }),
          )
          .min(1)
          .max(3),
        scheduledAt: z.string().datetime(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { adminId } = ctx(context);
    const supabase = (context as unknown as { supabase: any }).supabase;
    const d = await db();
    const { data: c } = await d
      .from("promo_creatives")
      .select("*")
      .eq("id", data.creativeId)
      .maybeSingle();
    if (!c) throw new Error("Creative not found");
    if (c.status !== "approved") throw new Error("Approve this creative first");
    const at = new Date(data.scheduledAt).getTime();
    if (at < Date.now() + 5 * 60_000) throw new Error("Pick a time at least 5 minutes from now.");
    if (at > Date.now() + 45 * 86_400_000) throw new Error("Pick a time within the next 45 days.");
    const offer = await assertOfferStillLive(c);
    const ends = offer?.ends_at ?? c.offer_ends_at;
    if (ends && at > new Date(ends).getTime())
      throw new Error("This post would go out after the offer ends.");

    const { platformMediaProblem, assertPublishConnection } =
      await import("@/lib/publishing.functions");
    const paths = (c.publish_paths ?? []) as string[];
    if (!paths.length || c.rendered_text_version !== c.text_version)
      throw new Error("Render the creative before scheduling it");
    const { data: urls, error: sErr } = await d.storage
      .from("renders")
      .createSignedUrls(paths, 45 * 86_400);
    if (sErr) throw new Error("Couldn't prepare the images");
    const media = ((urls ?? []) as any[]).map((u) => u.signedUrl as string);
    for (const t of data.targets) {
      const problem = platformMediaProblem(t.platform, media);
      if (problem) throw new Error(problem);
      if (t.platform === "instagram" && c.size === "9:16")
        throw new Error(
          "Instagram feed posts need 4:5 or 1:1. Download the story and post it manually.",
        );
      await assertPublishConnection(supabase, adminId, t.platform, t.connectionId);
    }
    const ids: string[] = [];
    for (const t of data.targets) {
      const { data: row, error } = await supabase
        .from("scheduled_posts")
        .insert({
          user_id: adminId,
          project_id: null,
          platform: t.platform,
          connection_id: t.connectionId,
          title: String(c.headline).slice(0, 100),
          caption: c.caption,
          hashtags: (c.hashtags ?? []).join(" "),
          media_urls: media,
          scheduled_at: data.scheduledAt,
          status: "scheduled",
        })
        .select("id")
        .single();
      if (error) {
        if (ids.length) await d.from("scheduled_posts").delete().in("id", ids);
        throw new Error(error.message);
      }
      ids.push(row.id);
    }
    const { data: upd } = await d
      .from("promo_creatives")
      .update({ status: "scheduled", scheduled_post_ids: ids, schedule_note: null })
      .eq("id", c.id)
      .eq("status", "approved")
      .select("id");
    if (!(upd ?? []).length) {
      await d.from("scheduled_posts").delete().in("id", ids);
      throw new Error("This creative changed. Reload and try again.");
    }
    await audit(adminId, "creative.schedule", c.id, {
      targets: data.targets.map((t) => t.platform),
      at: data.scheduledAt,
    });
    return { ok: true, postIds: ids };
  });

export const cancelPromoSchedule = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ creativeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { adminId } = ctx(context);
    const d = await db();
    const { data: c } = await d
      .from("promo_creatives")
      .select("id,status,scheduled_post_ids")
      .eq("id", data.creativeId)
      .maybeSingle();
    if (!c || c.status !== "scheduled") throw new Error("This creative isn't scheduled");
    const ids = (c.scheduled_post_ids ?? []) as string[];
    if (ids.length) {
      const { data: live } = await d.from("scheduled_posts").select("id,status").in("id", ids);
      if (
        ((live ?? []) as any[]).some((p) =>
          ["publishing", "published", "manually_published"].includes(p.status),
        )
      )
        throw new Error("This post is already going out.");
      await d
        .from("scheduled_posts")
        .delete()
        .in("id", ids)
        .eq("user_id", adminId)
        .in("status", ["scheduled", "failed", "reconnect_required"]);
    }
    await d
      .from("promo_creatives")
      .update({ status: "approved", scheduled_post_ids: [], schedule_note: null })
      .eq("id", c.id)
      .eq("status", "scheduled");
    await audit(adminId, "creative.unschedule", c.id, {});
    return { ok: true };
  });

/** Copies the first slide to the public landing bucket and adds a DRAFT showcase item (publish it in Admin → Landing). */
export const addPromoToShowcase = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ creativeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEnabled();
    const { adminId } = ctx(context);
    const d = await db();
    const { data: c } = await d
      .from("promo_creatives")
      .select("*")
      .eq("id", data.creativeId)
      .maybeSingle();
    if (!c) throw new Error("Creative not found");
    if (!["approved", "scheduled", "posted"].includes(c.status))
      throw new Error("Approve this creative first");
    const src = (c.output_paths ?? [])[0];
    if (!src) throw new Error("Render the creative first");
    const { data: existing } = await d
      .from("landing_media")
      .select("id")
      .eq("kind", "showcase")
      .eq("source_ref", `promo:${c.id}`)
      .limit(1);
    if ((existing ?? []).length) return { ok: true, already: true };
    const { data: blob, error: dErr } = await d.storage.from("renders").download(src);
    if (dErr || !blob) throw new Error("Couldn't read the rendered image");
    const path = `showcase/promo-${c.id}.png`;
    const { error: uErr } = await d.storage
      .from("landing")
      .upload(path, blob, { contentType: "image/png", upsert: true });
    if (uErr) throw new Error(`Upload failed: ${uErr.message}`);
    const url = d.storage.from("landing").getPublicUrl(path).data.publicUrl as string;
    const { count } = await d
      .from("landing_media")
      .select("id", { count: "exact", head: true })
      .eq("kind", "showcase");
    const { error } = await d.from("landing_media").insert({
      kind: "showcase",
      status: "draft",
      title: c.headline,
      poster_url: url,
      prompt: c.hook,
      tool: "Promo Studio",
      source_ref: `promo:${c.id}`,
      display_order: count ?? 0,
      consent_confirmed: false,
    });
    if (error) throw new Error(error.message);
    await audit(adminId, "creative.showcase", c.id, { url });
    return { ok: true, already: false };
  });
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ================= Step C: Brand Kit, budget, weekly pack ================= */

/* eslint-disable @typescript-eslint/no-explicit-any -- promo tables aren't in the generated types yet */
export const getPromoBrandKit = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { isPromoDisabledByEnv, loadPromoSettings } =
      await import("@/lib/promo-studio/settings.server");
    if (isPromoDisabledByEnv()) throw new Error("Promo Studio is turned off");
    const s = await loadPromoSettings();
    const { isOfferLive, offerLabel } = await import("@/lib/offers.server");
    const d = await db();
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [offersRes, spendRes, countRes] = await Promise.all([
      d
        .from("offers")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(50),
      d
        .from("promo_cost_log")
        .select("est_usd,actual_usd")
        .gte("created_at", monthStart.toISOString()),
      d
        .from("promo_creatives")
        .select("id", { count: "exact", head: true })
        .gte("created_at", monthStart.toISOString()),
    ]);
    const offers = ((offersRes.data ?? []) as any[])
      .filter((o) => isOfferLive(o))
      .map((o) => ({
        id: o.id as string,
        code: o.code as string,
        label: `${o.title} · ${offerLabel(o)}`,
        endsAt: o.ends_at as string | null,
      }));
    const monthSpend = ((spendRes.data ?? []) as any[]).reduce(
      (t, r) => t + Number(r.actual_usd ?? r.est_usd ?? 0),
      0,
    );
    const creativesThisMonth = countRes.count ?? 0;
    return {
      settings: {
        enabled: s.enabled,
        colors: s.colors,
        appUrl: s.app_url,
        defaultCta: s.default_cta,
        offerId: s.offer_id,
        monthlyCapUsd: s.monthly_cap_usd,
        perRequestCapUsd: s.per_request_cap_usd,
        rate10m: s.rate_10m,
        rate24h: s.rate_24h,
      },
      offerEnded: !!s.offer_id && !offers.some((o) => o.id === s.offer_id),
      offers,
      stats: {
        monthSpend,
        creativesThisMonth,
        avgCost: creativesThisMonth ? monthSpend / creativesThisMonth : 0,
      },
    };
  });

export const savePromoBrandKit = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => d)
  .handler(async ({ data, context }) => {
    const { adminId } = ctx(context);
    const { isPromoDisabledByEnv, savePromoSettings, promoSettingsPatchSchema } =
      await import("@/lib/promo-studio/settings.server");
    if (isPromoDisabledByEnv()) throw new Error("Promo Studio is turned off");
    const patch = promoSettingsPatchSchema.parse(data);
    if (patch.offerId) {
      const { isOfferLive } = await import("@/lib/offers.server");
      const { data: o } = await (
        await db()
      )
        .from("offers")
        .select("*")
        .eq("id", patch.offerId)
        .maybeSingle();
      if (!o || !isOfferLive(o)) throw new Error("That offer isn't live. Pick a live offer.");
    }
    await savePromoSettings(adminId, patch);
    return { ok: true };
  });

export const updatePromoAsset = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        label: z.string().trim().max(80).optional(),
        featureTag: z.enum(PROMO_FEATURE_TAGS).optional(),
        archived: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await assertEnabled();
    const patch: Record<string, unknown> = {};
    if (data.label !== undefined) patch.label = data.label;
    if (data.featureTag) patch.feature_tag = data.featureTag;
    if (data.archived !== undefined)
      patch.archived_at = data.archived ? new Date().toISOString() : null;
    const { error } = await (await db()).from("promo_assets").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function istDate(offsetDays: number): string {
  const t = new Date(Date.now() + 5.5 * 3_600_000 + offsetDays * 86_400_000);
  return t.toISOString().slice(0, 10);
}

const MEDIA_TAG: Record<string, string> = {
  thumbnails: "thumbnails",
  thumbnail: "thumbnails",
  carousel: "carousels",
  carousels: "carousels",
  images: "images",
  image: "images",
  video: "video",
  voice: "voice",
  voiceover: "voice",
  captions: "captions",
  research: "research",
  planner: "planner",
  pricing: "pricing",
};

export type WeeklyPackRow = {
  planItemId: string;
  date: string;
  idea: string;
  template: "feature_spotlight" | "offer_festival" | "before_after";
  format: "image" | "carousel" | "story";
  size: PromoSize;
  language: "en" | "te" | "hi";
  slides?: number;
  assetIds: string[];
  existingCreativeId: string | null;
  note: string | null;
};

/** Design §8 H1–H9: map this week's content plan (IST) to one creative per item. Read-only. */
export const planWeeklyPack = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const s = await assertEnabled();
    const d = await db();
    const [itemsRes, assetsRes, offer] = await Promise.all([
      d
        .from("content_plan_items")
        .select("id,plan_date,idea,format,build,media_id,status")
        .gte("plan_date", istDate(0))
        .lte("plan_date", istDate(6))
        .in("status", ["planned", "drafted"])
        .order("plan_date", { ascending: true })
        .limit(7),
      d
        .from("promo_assets")
        .select("id,feature_tag,created_at")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(100),
      liveOfferSnapshot(s.offer_id),
    ]);
    const items = (itemsRes.data ?? []) as any[];
    const assets = (assetsRes.data ?? []) as any[];
    const ids = items.map((i) => i.id);
    const { data: existing } = ids.length
      ? await d
          .from("promo_creatives")
          .select("id,plan_item_id")
          .in("plan_item_id", ids)
          .neq("status", "archived")
      : { data: [] };
    const existingBy = new Map(((existing ?? []) as any[]).map((e) => [e.plan_item_id, e.id]));
    const { estimateRequestUsd } = await import("@/lib/promo-studio/prices.server");

    const rows: WeeklyPackRow[] = items.map((it) => {
      const idea = String(it.idea ?? "");
      const format: WeeklyPackRow["format"] =
        it.format === "carousel" ? "carousel" : it.format === "image" ? "image" : "story";
      const size: PromoSize = format === "story" ? "9:16" : "4:5";
      let template: WeeklyPackRow["template"] = "feature_spotlight";
      let note: string | null = null;
      const offerish =
        /offer|deal|sale|festival|diwali|christmas|sankranti|ugadi|discount/i.test(idea) ||
        (!!offer && idea.toUpperCase().includes(offer.code.toUpperCase()));
      if (offerish) {
        if (offer) template = "offer_festival";
        else note = "No live offer, so this uses Feature spotlight.";
      }
      const language: WeeklyPackRow["language"] = /telugu/i.test(idea)
        ? "te"
        : /hindi/i.test(idea)
          ? "hi"
          : "en";
      const tag =
        it.build === "walkthrough" ? MEDIA_TAG[String(it.media_id ?? "").toLowerCase()] : undefined;
      const asset = (tag && assets.find((a) => a.feature_tag === tag)) || assets[0];
      if (template !== "offer_festival" && !asset) note = "Upload at least one screenshot first.";
      return {
        planItemId: it.id,
        date: it.plan_date,
        idea,
        template,
        format,
        size,
        language,
        slides: format === "carousel" ? 3 : undefined,
        assetIds: asset ? [asset.id] : [],
        existingCreativeId: existingBy.get(it.id) ?? null,
        note,
      };
    });
    const perItem = estimateRequestUsd({ size: "4:5", variants: 1, aiBackground: false });
    return { rows, estimateUsd: perItem * rows.length };
  });
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ================= Promo videos (Step 1): script + voice; render happens in the browser ================= */

/* eslint-disable @typescript-eslint/no-explicit-any -- promo tables aren't in the generated types yet */
const videoSchema = z
  .object({
    template: z.enum(PROMO_VIDEO_TEMPLATES),
    format: z.enum(PROMO_VIDEO_FORMATS),
    seconds: z.number().int(),
    language: z.enum(PROMO_LANGUAGES),
    assetIds: z.array(z.string().uuid()).min(1).max(8),
    topic: z.string().trim().max(300).optional(),
  })
  .superRefine((v, c) => {
    if (!PROMO_VIDEO_LENGTHS[v.format].includes(v.seconds))
      c.addIssue({ code: "custom", message: "Pick a listed length" });
    if (v.template === "telugu_voiceover" && v.language !== "te")
      c.addIssue({ code: "custom", message: "Telugu voiceover videos are in Telugu" });
  });

export type PromoVideoPlan = {
  batchId: string;
  format: "short" | "regular";
  seconds: number;
  language: "en" | "te" | "hi";
  template: string;
  script: import("@/lib/promo-studio/video-script.server").PromoVideoScript;
  assetUrls: string[];
  offer: { code: string; label: string } | null;
  link: string;
  estVoiceUsd: number;
};

export const generatePromoVideoScript = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => videoSchema.parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<
      { ok: true; plan: PromoVideoPlan } | { ok: false; code: string; message: string }
    > => {
      const { adminId } = ctx(context);
      const { isPromoDisabledByEnv, loadPromoSettings } =
        await import("@/lib/promo-studio/settings.server");
      const s = await loadPromoSettings();
      if (isPromoDisabledByEnv() || !s.enabled)
        return { ok: false, code: "disabled", message: "Promo Studio is turned off." };
      const d = await db();
      const offer = await liveOfferSnapshot(s.offer_id);
      if (data.template === "offer" && !offer)
        return {
          ok: false,
          code: "needs_offer",
          message: "No live offer. Create or activate one in Admin → Offers first.",
        };
      const { data: rows } = await d
        .from("promo_assets")
        .select("id,path,label,feature_tag")
        .in("id", data.assetIds)
        .is("archived_at", null);
      const assets = data.assetIds
        .map((id) => ((rows ?? []) as any[]).find((a) => a.id === id))
        .filter(Boolean) as any[];
      if (assets.length !== data.assetIds.length)
        return {
          ok: false,
          code: "invalid",
          message: "A selected screenshot was removed. Pick again.",
        };

      const scenes = promoVideoSceneCount(data.seconds);
      const { HONESTY_RULES } = await import("@/lib/agents/marketing.server");
      const { liveKb } = await import("@/lib/agents/support-kb");
      const { buildVideoPrompt, writeVideoScript } =
        await import("@/lib/promo-studio/video-script.server");
      const {
        estimateCopyUsd,
        estimateVoiceUsd,
        PROMO_COPY_MODEL,
        PROMO_VOICE_TURBO,
        PROMO_VOICE_V3,
      } = await import("@/lib/promo-studio/prices.server");
      const { withSpend } = await import("@/lib/promo-studio/budget.server");
      const prompt = buildVideoPrompt({
        kb: await liveKb(d),
        honestyRules: HONESTY_RULES,
        appUrl: s.app_url,
        template: data.template,
        format: data.format,
        seconds: data.seconds,
        scenes,
        language: data.language,
        assets: assets.map((a) => ({ label: a.label, featureTag: a.feature_tag })),
        offerTitle: offer ? offer.label.split(" · ")[0] : null,
        defaultCta: s.default_cta,
        topic: data.topic,
      });
      const batchId = crypto.randomUUID();
      const r = await withSpend(
        {
          adminId,
          step: "copy",
          provider: "openrouter",
          model: PROMO_COPY_MODEL,
          batchId,
          unitType: "input_tokens+output_tokens",
        },
        estimateCopyUsd({ inputChars: prompt.system.length + prompt.user.length }),
        () => writeVideoScript(prompt, { scenes, assets: assets.length, language: data.language }),
      );
      if (!r.ok) {
        if (r.code === "provider")
          return {
            ok: false,
            code: "copy_failed",
            message: "Couldn't write the script. Try again.",
          };
        return { ok: false, code: r.code, message: r.message };
      }
      const script = r.value;
      const link = `${s.app_url}?utm_source=youtube&utm_medium=video&utm_campaign=promo_${data.template}&utm_content=${batchId.slice(0, 8)}`;
      script.description = `${script.description}\n\nTry it free (50 credits): ${link}`;
      const chars =
        script.scenes.reduce((t, x) => t + x.voiceover.length, 0) + script.end.voiceover.length;
      const model = data.language === "te" ? PROMO_VOICE_V3 : PROMO_VOICE_TURBO;
      const signed = await signMany(assets.map((a) => a.path));
      return {
        ok: true,
        plan: {
          batchId,
          format: data.format,
          seconds: data.seconds,
          language: data.language,
          template: data.template,
          script,
          assetUrls: assets.map((a) => signed[a.path] ?? ""),
          offer: offer ? { code: offer.code, label: offer.label } : null,
          link,
          estVoiceUsd: estimateVoiceUsd(model, chars),
        },
      };
    },
  );

/** One voice clip, paid from the Promo Studio budget (never user credits). Returns MP3 as base64. */
export const promoVideoVoice = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({
        batchId: z.string().uuid(),
        text: z.string().trim().min(1).max(400),
        language: z.enum(PROMO_LANGUAGES),
        voice: z.string().regex(/^[A-Za-z]{2,20}$/),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<
      { ok: true; audioBase64: string } | { ok: false; code: string; message: string }
    > => {
      const { adminId } = ctx(context);
      await assertEnabled();
      const { VOICE_CATALOG } = await import("@/lib/voice-catalog");
      if (!VOICE_CATALOG.some((v) => v.id === data.voice))
        return { ok: false, code: "invalid", message: "Unknown voice" };
      const { estimateVoiceUsd, PROMO_VOICE_TURBO, PROMO_VOICE_V3 } =
        await import("@/lib/promo-studio/prices.server");
      const { withSpend, SpendCallError } = await import("@/lib/promo-studio/budget.server");
      const model = data.language === "te" ? PROMO_VOICE_V3 : PROMO_VOICE_TURBO;
      const code = data.language === "en" ? null : data.language;
      const chars = data.text.length;
      const r = await withSpend(
        {
          adminId,
          step: "voice",
          provider: "fal",
          model,
          batchId: data.batchId,
          units: chars,
          unitType: "characters",
        },
        estimateVoiceUsd(model, chars),
        async () => {
          const key = process.env.FAL_KEY;
          if (!key) throw new Error("Voice is not configured (missing FAL_KEY).");
          const call = (withCode: boolean) =>
            fetch(`https://fal.run/${model}`, {
              method: "POST",
              headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                text: data.text,
                voice: data.voice,
                ...(withCode && code ? { language_code: code } : {}),
              }),
              signal: AbortSignal.timeout(40_000),
            });
          let res = await call(true);
          if (!res.ok && code && (res.status === 400 || res.status === 422))
            res = await call(false);
          const out = (await res.json().catch(() => ({}))) as { audio?: { url?: string } };
          if (!res.ok || !out.audio?.url)
            throw new SpendCallError(`Voice failed (${res.status})`, { units: chars });
          const audio = await fetch(out.audio.url, { signal: AbortSignal.timeout(20_000) });
          if (!audio.ok)
            throw new SpendCallError("Couldn't download the voice clip", { units: chars });
          const buf = Buffer.from(await audio.arrayBuffer());
          return {
            value: buf.toString("base64"),
            actualUsd: null,
            units: chars,
            requestId: res.headers.get("x-fal-request-id"),
          };
        },
      );
      if (!r.ok)
        return {
          ok: false,
          code: r.code,
          message: r.code === "provider" ? "Voice generation failed. Try again." : r.message,
        };
      return { ok: true, audioBase64: r.value };
    },
  );
/* eslint-enable @typescript-eslint/no-explicit-any */
