import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

function supabaseFetch(input: RequestInfo | URL, init?: RequestInit) {
  // New-style publishable keys are not JWTs: send them only as `apikey`.
  const headers = new Headers(init?.headers);
  if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
  headers.set("apikey", key);
  return fetch(input, { ...init, headers });
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "cf-hq-auth" },
  global: { fetch: supabaseFetch },
});
