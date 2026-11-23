import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSafeAuthRedirect, redirectToSafePath } from "@/lib/auth-redirect";

const callbackSearchSchema = z.object({
  next: z.string().optional(),
  code: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export const Route = createFileRoute("/auth-callback")({
  ssr: false,
  validateSearch: callbackSearchSchema,
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const search = useSearch({ from: "/auth-callback" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function finishSignIn() {
      try {
        if (search.error) {
          throw new Error(search.error_description || search.error);
        }

        const href = window.location.href;
        const hasCode = search.code || new URL(href).searchParams.get("code");
        const hasHashToken = window.location.hash.includes("access_token");

        if (hasCode) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(href);
          if (exchangeError) {
            const { data } = await supabase.auth.getSession();
            if (!data.session) throw exchangeError;
          }
        } else if (!hasHashToken) {
          // Wait briefly for detectSessionInUrl to finish
          await new Promise((r) => setTimeout(r, 100));
        }

        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!data.session) throw new Error("No active session was created. Please try signing in again.");

        if (!cancelled) redirectToSafePath(search.next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Sign-in failed");
      }
    }

    finishSignIn();
    return () => { cancelled = true; };
  }, [search.code, search.error, search.error_description, search.next]);

  const retryHref = `/auth?next=${encodeURIComponent(getSafeAuthRedirect(search.next))}`;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center glass rounded-2xl p-8 shadow-[var(--shadow-glow)]">
        <div className="mx-auto mb-6 flex h-11 w-11 items-center justify-center rounded-lg gradient-primary">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        {error ? (
          <>
            <h1 className="text-2xl font-bold">Sign-in failed</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <a href={retryHref} className="mt-6 inline-flex rounded-lg gradient-primary px-5 py-2.5 text-sm font-medium text-white">
              Try again
            </a>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
            <h1 className="mt-4 text-2xl font-bold">Finishing sign-in</h1>
            <p className="mt-2 text-sm text-muted-foreground">Taking you to your dashboard.</p>
          </>
        )}
      </div>
    </div>
  );
}