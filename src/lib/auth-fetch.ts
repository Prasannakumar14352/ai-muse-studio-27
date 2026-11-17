// Browser fetch wrapper that attaches the signed-in user's Supabase access
// token. Use for calls to raw server routes under /api/* (server functions
// already get the token via the global attachSupabaseAuth middleware).
import { supabase } from "@/integrations/supabase/client";

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
