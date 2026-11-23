// Shared layout for Privacy Policy and Terms of Service.
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { PublicShell } from "@/components/public-shell";

export const LEGAL_UPDATED = "18 November 2026";

export function LegalPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <PublicShell>
      <article className="max-w-3xl mx-auto px-6 py-14">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Last updated {LEGAL_UPDATED}</div>
        <h1 className="mt-2 text-4xl font-bold">{title}</h1>
        <div className="mt-4 text-muted-foreground leading-relaxed">{intro}</div>
        <div className="mt-10 space-y-10 legal-body">{children}</div>
        <div className="mt-14 pt-6 border-t border-border/40 text-sm text-muted-foreground flex gap-5">
          <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-foreground">Terms of Service</Link>
          <Link to="/contact" className="hover:text-foreground">Contact</Link>
        </div>
      </article>
    </PublicShell>
  );
}

export function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl font-semibold mb-3">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-foreground/85 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:text-primary [&_a]:underline">
        {children}
      </div>
    </section>
  );
}
