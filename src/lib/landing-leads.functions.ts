// Landing lead magnet: a visitor leaves an email (optional name / WhatsApp) to unlock the
// "50 faceless video ideas" list. Public endpoint, so it is narrow: zod validation, a honeypot,
// and a per-IP hourly limit enforced in SQL (submit_landing_lead). Admins get a Telegram ping.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().max(80).optional(),
  whatsapp: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{8,16}$/, "Enter a valid WhatsApp number")
    .optional()
    .or(z.literal("")),
  language: z.enum(["en", "te", "hi", "other"]).default("en"),
  utm: z.record(z.string().max(100)).optional(),
  /** Honeypot: real people never fill this hidden field. */
  website: z.string().max(0).optional().or(z.literal("")),
});

export const submitLandingLead = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    if (data.website) return { ok: true }; // bot: pretend success, store nothing
    const { getRequestIP } = await import("@tanstack/react-start/server");
    const ip = getRequestIP({ xForwardedFor: true }) ?? null;
    const { createHash } = await import("node:crypto");
    const ipHash = ip
      ? createHash("sha256").update(`landing-lead:${ip}`).digest("hex").slice(0, 32)
      : null;
    const utm = Object.fromEntries(
      Object.entries(data.utm ?? {})
        .filter(([k]) => /^utm_(source|medium|campaign|content|term)$/.test(k))
        .map(([k, v]) => [k, String(v).slice(0, 100)]),
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated types yet
    const { data: res, error } = await (supabaseAdmin as any).rpc("submit_landing_lead", {
      _email: data.email,
      _name: data.name || null,
      _whatsapp: data.whatsapp || null,
      _language: data.language,
      _source: "video_ideas",
      _utm: utm,
      _ip_hash: ipHash,
    });
    if (error) return { ok: false, message: "Something went wrong. Please try again." };
    if (res === "rate")
      return { ok: false, message: "Too many tries. Please try again in an hour." };
    if (res !== "ok") return { ok: false, message: "Please check your email address." };

    void (async () => {
      try {
        const { alertAdmins } = await import("@/lib/agents/core.server");
        await alertAdmins(
          `New lead (50 video ideas): ${data.email}${data.whatsapp ? ` · WhatsApp ${data.whatsapp}` : ""}${utm.utm_source ? ` · from ${utm.utm_source}` : ""}`,
        );
      } catch {
        /* alert is best-effort */
      }
    })();
    return { ok: true };
  });
