import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Mail, Lock, User, Loader2, AlertCircle, Apple } from "lucide-react";
import { toast } from "sonner";
import { getAuthCallbackUrl, redirectToSafePath, getSafeAuthRedirect } from "@/lib/auth-redirect";
import { lovable } from "@/integrations/lovable";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
  next: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: searchSchema,
  component: AuthPage,
});

function AuthPage() {
  const { mode: initialMode, next } = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup">(initialMode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Initial session check + handle OAuth redirects that land here directly
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const href = window.location.href;
        const url = new URL(href);
        const hasCode = url.searchParams.has("code");
        const hasHashToken = window.location.hash.includes("access_token");
        const errParam = url.searchParams.get("error_description") || url.searchParams.get("error");

        if (errParam) {
          if (!cancelled) {
            setAuthError(decodeURIComponent(errParam));
            setInitializing(false);
          }
          return;
        }

        if (hasCode) {
          const { error } = await supabase.auth.exchangeCodeForSession(href);
          if (error) {
            const { data } = await supabase.auth.getSession();
            if (!data.session) throw error;
          }
        } else if (hasHashToken) {
          // Let detectSessionInUrl parse the hash
          await new Promise((r) => setTimeout(r, 150));
        }

        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          redirectToSafePath(next);
          return;
        }
        setInitializing(false);
      } catch (err) {
        if (!cancelled) {
          setAuthError(err instanceof Error ? err.message : "Sign-in failed");
          setInitializing(false);
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, [next]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: getAuthCallbackUrl(next),
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Account created! Check your email to confirm.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        redirectToSafePath(next);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setAuthError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    setAuthError(null);
    const redirectTo = getAuthCallbackUrl(next);

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: { prompt: "select_account", access_type: "offline" },
        },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed";
      setAuthError(msg);
      toast.error(msg);
      setLoading(false);
    }
  }

  async function handleLovable(provider: "google" | "apple") {
    setLoading(true);
    setAuthError(null);
    try {
      // Lovable-managed OAuth: return to the app origin, then bounce to `next`.
      const safeNext = getSafeAuthRedirect(next);
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
        extraParams: provider === "google" ? { prompt: "select_account" } : {},
      });
      if (result.error) throw result.error;
      if (result.redirected) return; // full-page redirect
      // Popup flow: session already set by the SDK
      toast.success("Signed in");
      window.location.replace(safeNext);
    } catch (err) {
      const msg = err instanceof Error ? err.message : `${provider} sign-in failed`;
      setAuthError(msg);
      toast.error(msg);
      setLoading(false);
    }
  }

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-[color:var(--neon-purple)]" />
          <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <div className="w-9 h-9 rounded-lg gradient-primary flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-xl">CreatorFlow<span className="gradient-text">AI</span></span>
        </Link>

        <div className="glass rounded-2xl p-8 shadow-[var(--shadow-glow)]">
          <h1 className="text-2xl font-bold text-center">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-center text-sm text-muted-foreground mt-1">
            {mode === "signin" ? "Sign in to keep creating" : "Free forever plan included"}
          </p>

          {authError && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <button onClick={handleGoogle} disabled={loading}
            className="mt-6 w-full flex items-center justify-center gap-3 rounded-lg bg-white text-slate-900 py-2.5 text-sm font-medium hover:bg-white/90 disabled:opacity-60">
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.1 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.1 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C40.9 35.8 44 30.4 44 24c0-1.3-.1-2.3-.4-3.5z"/></svg>
            Continue with Google
            {/* <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-500">Direct</span> */}
          </button>

          {/* <button onClick={() => handleLovable("google")} disabled={loading}
            className="mt-2 w-full flex items-center justify-center gap-3 rounded-lg border border-white/15 bg-white/5 text-white py-2.5 text-sm font-medium hover:bg-white/10 disabled:opacity-60">
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.1 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.1 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C40.9 35.8 44 30.4 44 24c0-1.3-.1-2.3-.4-3.5z"/></svg>
            Continue with Google
            <span className="ml-1 text-[10px] uppercase tracking-wide text-white/50">Lovable</span>
          </button> */}

          {/* <button onClick={() => handleLovable("apple")} disabled={loading}
            className="mt-2 w-full flex items-center justify-center gap-3 rounded-lg bg-black text-white py-2.5 text-sm font-medium hover:bg-black/80 disabled:opacity-60 border border-white/10">
            <Apple className="w-4 h-4" />
            Continue with Apple
          </button> */}

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex-1 h-px bg-border" /> or <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            {mode === "signup" && (
              <div className="relative">
                <User className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <input required value={fullName} onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full name"
                  className="w-full bg-input/50 border border-border rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-[color:var(--neon-purple)]" />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@creator.com"
                className="w-full bg-input/50 border border-border rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-[color:var(--neon-purple)]" />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 6 chars)"
                className="w-full bg-input/50 border border-border rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-[color:var(--neon-purple)]" />
            </div>

            <button type="submit" disabled={loading}
              className="w-full rounded-lg gradient-primary text-white py-2.5 text-sm font-medium shadow-[var(--shadow-glow)] disabled:opacity-60 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
            <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-[color:var(--neon-purple)] hover:underline font-medium">
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
