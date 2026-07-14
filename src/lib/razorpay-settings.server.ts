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

/**
 * Diagnostic: creates a tiny INR order (never charged) and probes the merchant's
 * enabled payment methods to surface UPI/QR availability. Use from the admin
 * Razorpay debugger — safe to run repeatedly. No refund/void needed: an order
 * that is never paid simply expires.
 */
export type RazorpayDiagnostic = {
  ok: boolean;
  environment: "test" | "live";
  source: "database" | "environment";
  keyMode: "live" | "test" | "unknown";
  keyIdMasked: string;
  order?: { id: string; amount: number; currency: string; status: string; receipt: string };
  methods?: {
    upi?: boolean;
    upiFlows?: Record<string, boolean> | null;
    card?: boolean;
    netbanking?: boolean;
    wallet?: boolean;
    rawJson?: string | null;
  };
  warnings: string[];
  errors: string[];
};

export async function runDiagnostic(): Promise<RazorpayDiagnostic> {
  const warnings: string[] = [];
  const errors: string[] = [];
  let creds: ResolvedRazorpay;
  try {
    creds = await resolveRazorpayCredentials();
  } catch (e) {
    return {
      ok: false,
      environment: "test",
      source: "environment",
      keyMode: "unknown",
      keyIdMasked: "—",
      warnings,
      errors: [e instanceof Error ? e.message : String(e)],
    };
  }

  const keyMode: "live" | "test" | "unknown" = creds.keyId.startsWith("rzp_live_")
    ? "live"
    : creds.keyId.startsWith("rzp_test_")
      ? "test"
      : "unknown";
  const keyIdMasked = `${creds.keyId.slice(0, 12)}…${creds.keyId.slice(-4)}`;
  const auth = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64");

  // 1) Create a probe order (100 paise = ₹1). Never charged — expires unpaid.
  const receipt = `probe_${Date.now().toString(36)}`.slice(0, 40);
  let order: RazorpayDiagnostic["order"];
  try {
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount: 100,
        currency: "INR",
        receipt,
        notes: { diagnostic: true },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      errors.push(`Order create failed: HTTP ${res.status} — ${text.slice(0, 240)}`);
    } else {
      const j = (await res.json()) as { id: string; amount: number; currency: string; status: string; receipt: string };
      order = { id: j.id, amount: j.amount, currency: j.currency, status: j.status, receipt: j.receipt };
      if (j.currency !== "INR") errors.push(`Order currency is ${j.currency}, expected INR.`);
      if (j.amount !== 100) errors.push(`Order amount mismatch: got ${j.amount}, expected 100 paise.`);
    }
  } catch (e) {
    errors.push(`Order create exception: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2) Enabled payment methods (surfaces UPI QR availability).
  let methods: RazorpayDiagnostic["methods"];
  try {
    const res = await fetch("https://api.razorpay.com/v1/methods", {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (res.ok) {
      const j = (await res.json()) as Record<string, unknown>;
      const upi = !!j.upi;
      const upiFlows =
        j.upi && typeof j.upi === "object"
          ? ((j.upi as Record<string, unknown>).flows as Record<string, boolean> | undefined) ?? null
          : null;
      methods = {
        upi,
        upiFlows: upiFlows ?? null,
        card: !!j.card,
        netbanking: !!j.netbanking,
        wallet: !!j.wallet,
        rawJson: JSON.stringify(j),
      };
      if (!upi) {
        warnings.push(
          "UPI is NOT enabled on this merchant account. Enable UPI in the Razorpay Dashboard → Account & Settings → Payment Methods.",
        );
      } else if (upiFlows && upiFlows.qr === false) {
        warnings.push(
          "UPI is enabled but UPI QR flow is disabled. Enable 'UPI QR / Collect' in Razorpay Dashboard → Payment Methods → UPI.",
        );
      } else if (upiFlows && !("qr" in upiFlows)) {
        warnings.push(
          "UPI QR flow status could not be confirmed from /v1/methods. Verify UPI QR is activated in Razorpay Dashboard → Payment Methods → UPI.",
        );
      }
      const m = methods;
      if (keyMode === "live" && !m.card && !m.netbanking && !m.upi) {
        warnings.push("Live account appears to have no active payment methods — activation may be incomplete.");
      }
    } else {
      const text = await res.text();
      warnings.push(`Could not fetch /v1/methods (HTTP ${res.status}) — cannot confirm UPI QR availability. ${text.slice(0, 200)}`);
    }
  } catch (e) {
    warnings.push(`/v1/methods exception: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    ok: errors.length === 0,
    environment: creds.environment,
    source: creds.source,
    keyMode,
    keyIdMasked,
    order,
    methods,
    warnings,
    errors,
  };
}
