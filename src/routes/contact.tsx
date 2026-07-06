import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Mail, Send, Copy, Check, Building2, ArrowLeft, Home } from "lucide-react";

export const Route = createFileRoute("/contact")({ component: ContactPage });

import { BRAND, SUPPORT_EMAIL } from "@/lib/constants";


const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  subject: z.string().trim().min(1, "Subject is required").max(150),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(2000),
});

function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    const body = `From: ${parsed.data.name} <${parsed.data.email}>\n\n${parsed.data.message}`;
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(parsed.data.subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
    toast.success("Opening your email app…", { description: `We'll get back to you at ${parsed.data.email}` });
  }

  async function copyEmail() {
    await navigator.clipboard.writeText(SUPPORT_EMAIL);
    setCopied(true);
    toast.success("Email copied");
    setTimeout(() => setCopied(false), 1800);
  }

  const router = useRouter();
  const canGoBack = typeof window !== "undefined" && window.history.length > 1;

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => (canGoBack ? router.history.back() : router.navigate({ to: "/" }))}
          className="inline-flex items-center gap-2 rounded-lg glass hover:bg-white/10 px-3 py-2 text-sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <Link to="/" className="inline-flex items-center gap-2 rounded-lg glass hover:bg-white/10 px-3 py-2 text-sm">
          <Home className="w-4 h-4" /> Home
        </Link>
      </div>

      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs text-muted-foreground mb-4">
          <Building2 className="w-3 h-3 text-[color:var(--brand-orange)]" /> {BRAND} · Digital Products Marketplace
        </div>
        <h1 className="text-3xl md:text-5xl font-bold">Get in <span className="gradient-text">touch</span></h1>
        <p className="text-muted-foreground mt-2 max-w-xl mx-auto">
          Questions, feedback, team pricing or partnership? Reach the {BRAND} team directly.
        </p>
      </div>


      <div className="grid md:grid-cols-5 gap-6">
        {/* Left: Contact card */}
        <div className="md:col-span-2 space-y-4">
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                <Mail className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Support email</div>
                <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-base md:text-lg hover:underline break-all">
                  {SUPPORT_EMAIL}
                </a>
              </div>
            </div>
            <button
              onClick={copyEmail}
              className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg glass hover:bg-white/10 py-2.5 text-sm">
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy email"}
            </button>
          </div>

          <div className="glass rounded-2xl p-6 space-y-2 text-sm">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Brand</div>
            <div className="text-lg font-semibold">{BRAND}</div>
            <p className="text-muted-foreground">
              A premium digital products marketplace. We usually respond within 1 business day.
            </p>
          </div>
        </div>

        {/* Right: Form */}
        <form onSubmit={onSubmit} className="md:col-span-3 glass rounded-2xl p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Your name" error={errors.name}>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg bg-black/30 border border-border/60 px-3 py-2.5 text-sm outline-none focus:border-[color:var(--neon-purple)]/70 transition" placeholder="Jane Doe" maxLength={100} />
            </Field>
            <Field label="Email" error={errors.email}>
              <input
                value={form.email} type="email"
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg bg-black/30 border border-border/60 px-3 py-2.5 text-sm outline-none focus:border-[color:var(--neon-purple)]/70 transition" placeholder="you@company.com" maxLength={255} />
            </Field>
          </div>
          <Field label="Subject" error={errors.subject}>
            <input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="w-full rounded-lg bg-black/30 border border-border/60 px-3 py-2.5 text-sm outline-none focus:border-[color:var(--neon-purple)]/70 transition" placeholder="Team plan enquiry" maxLength={150} />
          </Field>
          <Field label="Message" error={errors.message}>
            <textarea
              value={form.message} rows={6}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="w-full rounded-lg bg-black/30 border border-border/60 px-3 py-2.5 text-sm outline-none focus:border-[color:var(--neon-purple)]/70 transition resize-y" placeholder="Tell us what you need…" maxLength={2000} />
          </Field>
          <button
            type="submit"
            className="w-full rounded-lg gradient-primary text-white py-3 font-medium flex items-center justify-center gap-2">
            <Send className="w-4 h-4" /> Send message
          </button>
          <p className="text-[11px] text-muted-foreground text-center">
            This opens your email app addressed to <span className="text-foreground">{SUPPORT_EMAIL}</span>.
          </p>
        </form>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </label>
  );
}
