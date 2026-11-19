// Server-only helpers for motion clips: a signed job token so the status
// endpoint can trust which user / credit reservation / fal request it is
// polling, without a database table.
import { createHmac, timingSafeEqual } from "crypto";

export type ClipToken = {
  u: string;   // user id
  l: string;   // credit ledger id (the reservation)
  s: string;   // fal status_url
  r: string;   // fal response_url
  e: number;   // expiry (ms epoch)
};

function secret(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.FAL_KEY;
  if (!k) throw new Error("Server is not configured");
  return `motion-clip:${k}`;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

export function signClipToken(t: ClipToken): string {
  const body = b64url(JSON.stringify(t));
  const sig = b64url(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyClipToken(token: string, userId: string): ClipToken | null {
  const [body, sig] = (token || "").split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const t = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ClipToken;
    if (t.u !== userId || Date.now() > t.e) return null;
    // Only ever poll fal's own queue hosts.
    if (!/^https:\/\/queue\.fal\.run\//.test(t.s) || !/^https:\/\/queue\.fal\.run\//.test(t.r)) return null;
    return t;
  } catch {
    return null;
  }
}
