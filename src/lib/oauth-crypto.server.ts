// AES-256-GCM encryption for OAuth secrets and user tokens.
// Uses the OAUTH_TOKEN_ENCRYPTION_KEY environment variable (>=32 chars).
import { webcrypto } from "node:crypto";

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}
function unb64(str: string): Uint8Array {
  const bin = atob(str);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function getKey(): Promise<CryptoKey> {
  const raw = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error("OAUTH_TOKEN_ENCRYPTION_KEY is missing or too short (need >=32 chars).");
  }
  // Derive a stable 32-byte key from the secret using SHA-256.
  const hash = await webcrypto.subtle.digest("SHA-256", enc.encode(raw));
  return webcrypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plaintext: string): Promise<{ cipher: string; iv: string }> {
  const key = await getKey();
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  return { cipher: b64(ct), iv: b64(iv) };
}

export async function decryptSecret(cipher: string, iv: string): Promise<string> {
  const key = await getKey();
  const pt = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(cipher));
  return dec.decode(pt);
}

export function randomToken(bytes = 24): string {
  const arr = new Uint8Array(bytes);
  webcrypto.getRandomValues(arr);
  return b64(arr).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" }[c] as string));
}
