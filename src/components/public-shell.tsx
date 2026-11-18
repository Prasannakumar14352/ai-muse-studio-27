import { Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/brand-logo";
import { useAccess } from "@/lib/access";
import type { ReactNode } from "react";

/**
 * Marketing shell for public pages (pricing, features, how-it-works).
 * Renders a top nav + footer. Adapts CTA based on auth state.
 */
export function PublicShell({ children }: { children: ReactNode }) {
  const { data: access } = useAccess();
  const authed = !!access?.email;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/60 border-b border-border/40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" aria-label="CreatorFlow AI home">
            <BrandLogo alt="CreatorFlow AI" className="h-9 md:h-10 w-auto object-contain" />
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <Link to="/features" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>Features</Link>
            <Link to="/how-it-works" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>How it works</Link>
            <Link to="/pricing" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>Pricing</Link>
            <Link to="/contact" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>Contact</Link>
          </nav>
          <div className="flex items-center gap-3">
            {authed ? (
              <Link to="/dashboard" className="rounded-lg gradient-primary px-4 py-2 text-sm font-medium text-white shadow-lg">
                Open app
              </Link>
            ) : (
              <>
                <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">Sign in</Link>
                <Link to="/auth" className="rounded-lg gradient-primary px-4 py-2 text-sm font-medium text-white shadow-lg">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border/40 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-10 grid gap-8 md:grid-cols-4 text-sm">
          <div>
            <BrandLogo alt="CreatorFlow AI" className="h-8 w-auto object-contain mb-3" />
            <p className="text-muted-foreground text-xs leading-relaxed">
              AI content studio for creators — scripts, videos, carousels, thumbnails in one flow.
            </p>
          </div>
          <div>
            <div className="font-semibold mb-3 text-xs uppercase tracking-wider text-muted-foreground">Product</div>
            <ul className="space-y-2 text-muted-foreground">
              <li><Link to="/features" className="hover:text-foreground">Features</Link></li>
              <li><Link to="/how-it-works" className="hover:text-foreground">How it works</Link></li>
              <li><Link to="/pricing" className="hover:text-foreground">Pricing</Link></li>
            </ul>
          </div>
          <div>
            <div className="font-semibold mb-3 text-xs uppercase tracking-wider text-muted-foreground">Company</div>
            <ul className="space-y-2 text-muted-foreground">
              <li><Link to="/contact" className="hover:text-foreground">Contact</Link></li>
              <li><Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link></li>
              <li><Link to="/terms" className="hover:text-foreground">Terms of Service</Link></li>
            </ul>
          </div>
          <div>
            <div className="font-semibold mb-3 text-xs uppercase tracking-wider text-muted-foreground">Start free</div>
            <p className="text-muted-foreground text-xs mb-3">50 free credits when you sign up. No card required.</p>
            <Link to="/auth" className="inline-flex rounded-lg gradient-primary text-white px-4 py-2 text-xs font-medium">
              Get Started
            </Link>
          </div>
        </div>
        <div className="border-t border-border/40 py-5 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} CreatorFlow AI. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
