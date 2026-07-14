// Server-only Razorpay settings resolver. Reads the DB-backed settings row
// (encrypted secrets) with an env-var fallback so existing installs keep
// working. Never import from browser code.
import { encryptSecret, decryptSecret } from "@/lib/oauth-crypto.server";

export type RazorpaySettingsRow = {
  provider: string;
  environment: "test" | "live";
  enabled: boolean;
  key_id: string | null;
  key_secret_cipher: string | null;
  key_secret_iv: string | null;
  webhook_secret_cipher: string | null;
  webhook_secret_iv: string | null;
  company_name: string | null;
  logo_url: string | null;
  theme_color: string | null;
  currency: string;
  updated_at: string;
};

export type ResolvedRazorpay = {
  keyId: string;
  keySecret: string;
  webhookSecret: string | null;
  environment: "test" | "live";
  enabled: boolean;
  companyName: string | null;
  logoUrl: string | null;
  themeColor: string | null;
  currency: string;
  source: "database" | "environment";
};

async function loadRow(): Promise<RazorpaySettingsRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("payment_provider_settings" as never)
    .select("*")
    .eq("provider", "razorpay")
    .maybeSingle();
  return (data as RazorpaySettingsRow | null) ?? null;
}

/**
 * Reject test/live cross-wired credentials. A mismatched key id + secret is the
 * single most common cause of "checkout opens but UPI QR is blank" — the QR
 * request goes to Razorpay's live endpoint with a test secret and silently
 * returns no QR. Fail fast at order-creation time instead.
 */
function assertKeyModeConsistent(keyId: string, environment: "test" | "live") {
  const isLiveKey = keyId.startsWith("rzp_live_");
  const isTestKey = keyId.startsWith("rzp_test_");
  if (!isLiveKey && !isTestKey) {
    throw new Error(`Invalid Razorpay Key ID format (expected rzp_live_* or rzp_test_*)`);
  }
  if (environment === "live" && !isLiveKey) {
    throw new Error(
      `Razorpay environment is LIVE but Key ID starts with '${keyId.slice(0, 8)}'. ` +
        `Live mode requires an rzp_live_* Key ID and its matching live Key Secret.`,
    );
  }
  if (environment === "test" && !isTestKey) {
    throw new Error(
      `Razorpay environment is TEST but Key ID starts with '${keyId.slice(0, 8)}'. ` +
        `Test mode requires an rzp_test_* Key ID and its matching test Key Secret.`,
    );
  }
}

/** Full resolved credentials for order creation / webhook verification. */
export async function resolveRazorpayCredentials(): Promise<ResolvedRazorpay> {
  const row = await loadRow();

  if (row && row.enabled && row.key_id && row.key_secret_cipher && row.key_secret_iv) {
    assertKeyModeConsistent(row.key_id, row.environment);
    const keySecret = await decryptSecret(row.key_secret_cipher, row.key_secret_iv);
    const webhookSecret =
      row.webhook_secret_cipher && row.webhook_secret_iv
        ? await decryptSecret(row.webhook_secret_cipher, row.webhook_secret_iv)
        : (process.env.RAZORPAY_WEBHOOK_SECRET ?? null);
    return {
      keyId: row.key_id,
      keySecret,
      webhookSecret,
      environment: row.environment,
      enabled: true,
      companyName: row.company_name,
      logoUrl: row.logo_url,
      themeColor: row.theme_color,
      currency: row.currency,
      source: "database",
    };
  }

  // Legacy fallback: env vars.
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay not configured");
  const environment: "test" | "live" =
    (process.env.RAZORPAY_ENV as "test" | "live") ??
    (keyId.startsWith("rzp_live_") ? "live" : "test");
  assertKeyModeConsistent(keyId, environment);
  return {
    keyId,
    keySecret,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? null,
    environment,
    enabled: true,
    companyName: null,
    logoUrl: null,
    themeColor: null,
    currency: "INR",
    source: "environment",
  };
}

/** Safe branding-only slice for browser checkout. Never returns secrets. */
export async function resolveRazorpayBranding() {
  try {
    const r = await resolveRazorpayCredentials();
    return {
      keyId: r.keyId,
      enabled: r.enabled,
      environment: r.environment,
      companyName: r.companyName,
      logoUrl: r.logoUrl,
      themeColor: r.themeColor,
      currency: r.currency,
    };
  } catch {
    return null;
  }
}

/** Admin: raw row for the settings page (secrets NEVER returned in plaintext). */
export async function getAdminSettings() {
  const row = await loadRow();
  return {
    provider: "razorpay",
    environment: row?.environment ?? "test",
    enabled: row?.enabled ?? false,
    keyId: row?.key_id ?? "",
    hasKeySecret: !!row?.key_secret_cipher,
    hasWebhookSecret: !!row?.webhook_secret_cipher,
    companyName: row?.company_name ?? "",
    logoUrl: row?.logo_url ?? "",
    themeColor: row?.theme_color ?? "#0F172A",
    currency: row?.currency ?? "INR",
    updatedAt: row?.updated_at ?? null,
  };
}

export type SaveInput = {
  environment: "test" | "live";
  enabled: boolean;
  keyId: string;
  keySecret?: string | null; // undefined/empty = keep existing
  webhookSecret?: string | null;
  companyName?: string | null;
  logoUrl?: string | null;
  themeColor?: string | null;
  currency?: string;
};

export async function saveAdminSettings(input: SaveInput, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const patch: Record<string, unknown> = {
    provider: "razorpay",
    environment: input.environment,
    enabled: input.enabled,
    key_id: input.keyId || null,
    company_name: input.companyName ?? null,
    logo_url: input.logoUrl ?? null,
    theme_color: input.themeColor ?? null,
    currency: input.currency ?? "INR",
    updated_by: userId,
  };
  if (input.keySecret && input.keySecret.trim().length > 0) {
    const { cipher, iv } = await encryptSecret(input.keySecret.trim());
    patch.key_secret_cipher = cipher;
    patch.key_secret_iv = iv;
  }
  if (input.webhookSecret !== undefined) {
    if (input.webhookSecret && input.webhookSecret.trim().length > 0) {
      const { cipher, iv } = await encryptSecret(input.webhookSecret.trim());
      patch.webhook_secret_cipher = cipher;
      patch.webhook_secret_iv = iv;
    } else if (input.webhookSecret === null) {
      patch.webhook_secret_cipher = null;
      patch.webhook_secret_iv = null;
    }
  }
  const { error } = await supabaseAdmin
    .from("payment_provider_settings" as never)
    .upsert(patch as never, { onConflict: "provider" });
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** Ping Razorpay with current credentials — verifies key id + secret work. */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  const r = await resolveRazorpayCredentials();
  const auth = Buffer.from(`${r.keyId}:${r.keySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/payments?count=1", {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (res.ok) return { ok: true, message: `Connected (${r.environment}, source: ${r.source})` };
  const text = await res.text();
  return { ok: false, message: `HTTP ${res.status}: ${text.slice(0, 200)}` };
}
