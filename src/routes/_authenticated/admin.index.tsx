import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/lib/access";
import { confirmDialog } from "@/components/confirm-dialog";
import { CREDIT_COSTS, CREDIT_GUIDE_INTRO, ASSET_CREDIT_COST } from "@/lib/credit-costs";
import { Crown, Users, Layers, Zap, Plus, Shield, ShieldOff, Ban, Loader2, ChevronDown, ChevronRight, Coins, FileText, FileDown, Printer, Image as ImageIcon, Film, Video } from "lucide-react";
import { promptDialog } from "@/components/prompt-dialog";
import { useServerFn } from "@tanstack/react-start";
import { adminAddCreditsFn, adminSetAdminRoleFn, adminCancelSubscriptionFn } from "@/lib/admin-users.functions";

export const Route = createFileRoute("/_authenticated/admin/")({ component: AdminPanel });

function AdminPanel() {
  const { data: access, isLoading } = useAccess();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  // Writes go through admin-checked server functions (users can't write these columns).
  const addCreditsServer = useServerFn(adminAddCreditsFn);
  const setAdminRoleServer = useServerFn(adminSetAdminRoleFn);
  const cancelSubscriptionServer = useServerFn(adminCancelSubscriptionFn);

  const { data: users, refetch } = useQuery({
    queryKey: ["admin-users"],
    enabled: !!access?.isAdmin,
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles")
        .select("id, email, full_name, plan, is_admin, user_credits, created_at")
        .order("created_at", { ascending: false });
      const ids = (profiles ?? []).map((p) => p.id);
      const [subsRes, projRes] = await Promise.all([
        supabase.from("subscriptions").select("user_id, plan_name, status, monthly_credit_limit, monthly_credits_used, unlimited_usage").in("user_id", ids),
        supabase.from("projects").select("user_id").in("user_id", ids),
      ]);
      const subsByUser = new Map<string, any>();
      (subsRes.data ?? []).forEach((s: any) => {
        if (s.status === "active") subsByUser.set(s.user_id, s);
      });
      const projCount = new Map<string, number>();
      (projRes.data ?? []).forEach((p: any) => projCount.set(p.user_id, (projCount.get(p.user_id) ?? 0) + 1));

      return (profiles ?? []).map((p: any) => ({
        ...p,
        sub: subsByUser.get(p.id) ?? null,
        projects: projCount.get(p.id) ?? 0,
      }));
    },
  });

  if (isLoading) return <div className="glass rounded-2xl h-64 animate-pulse" />;
  if (!access?.isAdmin) return <Navigate to="/dashboard" />;

  async function addCredits(userId: string) {
    const raw = await promptDialog({ title: "Add credits", description: "How many credits should be added to this user's balance?", defaultValue: "100", suggestions: ["50", "100", "500", "1000"], confirmText: "Add credits" });
    const n = raw ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(n) || n <= 0) return;
    setBusy(userId);
    try {
      await addCreditsServer({ data: { userId, amount: n } });
    } catch (e) {
      setBusy(null);
      return toast.error(e instanceof Error ? e.message : "Could not add credits");
    }
    setBusy(null);
    toast.success(`Added ${n} credits`);
    refetch();
    qc.invalidateQueries({ queryKey: ["access"] });
  }

  async function toggleAdmin(userId: string, makeAdmin: boolean) {
    setBusy(userId);
    try {
      await setAdminRoleServer({ data: { userId, makeAdmin } });
    } catch (e) {
      setBusy(null);
      return toast.error(e instanceof Error ? e.message : "Could not change admin role");
    }
    setBusy(null);
    toast.success(makeAdmin ? "User promoted to admin" : "Admin role removed");
    refetch();
  }

  async function deactivateSubscription(userId: string) {
    const ok = await confirmDialog({
      title: "Cancel this subscription?",
      description: "The user will lose access at the end of the current billing period.",
      confirmText: "Cancel subscription",
      tone: "destructive",
    });
    if (!ok) return;
    setBusy(userId);
    try {
      await cancelSubscriptionServer({ data: { userId } });
    } catch (e) {
      setBusy(null);
      return toast.error(e instanceof Error ? e.message : "Could not cancel subscription");
    }
    setBusy(null);
    toast.success("Subscription cancelled");
    refetch();
  }

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl p-6 flex items-center gap-4 border-[color:var(--neon-purple)]/50">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
          <Crown className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Admin Panel</div>
          <h1 className="text-3xl md:text-4xl font-bold">Manage users & subscriptions</h1>
        </div>
        <Link
          to="/admin/payments"
          className="inline-flex items-center gap-2 rounded-lg glass px-3 py-2 text-sm hover:bg-white/10 transition">
          <Zap className="w-4 h-4" /> Payment Settings
        </Link>
        <Link
          to="/admin/currency"
          className="inline-flex items-center gap-2 rounded-lg glass px-3 py-2 text-sm hover:bg-white/10 transition">
          <Coins className="w-4 h-4" /> USD → INR Rate
        </Link>
        <Link
          to="/admin/landing"
          className="inline-flex items-center gap-2 rounded-lg glass px-3 py-2 text-sm hover:bg-white/10 transition">
          <FileText className="w-4 h-4" /> Landing Media
        </Link>
        <Link
          to="/admin/webhooks"
          className="inline-flex items-center gap-2 rounded-lg gradient-primary text-white px-3 py-2 text-sm hover:opacity-90 transition">
          <Zap className="w-4 h-4" /> Razorpay Debugger
        </Link>
      </div>


      <div className="grid grid-cols-3 gap-4">
        <Metric icon={Users} label="Users" value={users?.length ?? 0} />
        <Metric icon={Layers} label="Projects" value={users?.reduce((a, u) => a + u.projects, 0) ?? 0} />
        <Metric icon={Zap} label="Active subs" value={users?.filter((u) => u.sub).length ?? 0} />
      </div>

      <CreditCostCard />

      <TeamPlanSalesCard />

      <CreditGuide />


      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3">Plan</th>
                <th className="text-left px-4 py-3">Credits</th>
                <th className="text-left px-4 py-3">Subscription</th>
                <th className="text-left px-4 py-3">Projects</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((u: any) => (
                <tr key={u.id} className="border-t border-border/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {u.is_admin && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                      <div>
                        <div className="font-medium">{u.full_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize">{u.plan}</td>
                  <td className="px-4 py-3">{u.user_credits}</td>
                  <td className="px-4 py-3 text-xs">
                    {u.sub ? (
                      <div>
                        <div className="capitalize">{u.sub.plan_name} · {u.sub.status}</div>
                        <div className="text-muted-foreground">
                          {u.sub.unlimited_usage ? "Unlimited" : `${u.sub.monthly_credits_used}/${u.sub.monthly_credit_limit} used`}
                        </div>
                      </div>
                    ) : <span className="text-muted-foreground">None</span>}
                  </td>
                  <td className="px-4 py-3">{u.projects}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {busy === u.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground mr-1" />}
                      <IconBtn title="Add credits" onClick={() => addCredits(u.id)}><Plus className="w-3.5 h-3.5" /></IconBtn>
                      {u.is_admin
                        ? <IconBtn title="Remove admin" onClick={() => toggleAdmin(u.id, false)}><ShieldOff className="w-3.5 h-3.5" /></IconBtn>
                        : <IconBtn title="Make admin" onClick={() => toggleAdmin(u.id, true)}><Shield className="w-3.5 h-3.5" /></IconBtn>}
                      {u.sub && <IconBtn title="Cancel subscription" onClick={() => deactivateSubscription(u.id)}><Ban className="w-3.5 h-3.5" /></IconBtn>}
                    </div>
                  </td>
                </tr>
              ))}
              {!users?.length && (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No users yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="glass rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg gradient-primary flex items-center justify-center">
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div>
        <div className="text-lg font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button title={title} onClick={onClick} className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground hover:text-foreground transition">
      {children}
    </button>
  );
}

// -------------------- Credit Cost Per Asset (admin-only) --------------------

function CreditCostCard() {
  return (
    <div className="glass rounded-2xl p-6 border border-[color:var(--neon-pink)]/30">
      <h2 className="font-semibold flex items-center gap-2 mb-4">
        <Coins className="w-4 h-4 text-[color:var(--neon-pink)]" />
        Credit cost per asset
      </h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AssetCost icon={<ImageIcon className="w-4 h-4 text-[color:var(--neon-pink)]" />} label="AI image" cost={ASSET_CREDIT_COST.image} />
        <AssetCost icon={<Layers className="w-4 h-4 text-primary" />} label="Carousel (≈5 slides)" cost={ASSET_CREDIT_COST.carousel} />
        <AssetCost icon={<Film className="w-4 h-4 text-primary" />} label="Short reel (≤ 60s)" cost={ASSET_CREDIT_COST.shortReel} />
        <AssetCost icon={<Video className="w-4 h-4 text-primary" />} label="5-min long video" cost={ASSET_CREDIT_COST.longVideo} />
      </div>
    </div>
  );
}

function AssetCost({ icon, label, cost }: { icon: React.ReactNode; label: string; cost: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-black/20 p-4 flex items-center justify-between">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">{icon} {label}</span>
      <strong className="text-foreground">{cost} {cost === 1 ? "credit" : "credits"}</strong>
    </div>
  );
}

// -------------------- Team Plan Sales Playbook (admin-only) --------------------

const TEAM_PLAN_DETAILS = {
  name: "Team",
  positioning: "For agencies, in-house content teams and multi-creator brands that need shared credits, seats, and brand kits.",
  price: "Custom · starts at $49/mo per seat (min 3 seats)",
  includes: [
    "Multi-seat workspace with per-user access controls",
    "Shared brand kits, presets & saved styles",
    "Custom monthly credit pool that all seats draw from",
    "Priority rendering pool (skip the queue)",
    "Dedicated onboarding call + private Slack channel",
    "Invoiced billing (annual) — NET-30 available",
  ],
  bestFor: [
    "Content / social agencies producing >200 assets / month",
    "In-house marketing teams at 5–50 person companies",
    "Multi-creator YouTube / Reels studios",
  ],
  qualifyingQuestions: [
    "How many seats do you need this quarter?",
    "Roughly how many videos / carousels / images per month?",
    "Do you need SSO, invoiced billing or a signed MSA?",
    "Any brand-kit / style-guide requirements we should preload?",
  ],
  salesFlow: [
    `1. Lead lands via /contact → arrives at ${SUPPORT_EMAIL}`,
    "2. Reply within 1 business day with a 15-min discovery call link",
    "3. On the call, run the qualifying questions above",
    "4. Send a custom quote based on seats × credit pool × support tier",
    "5. Close on invoice or upgrade; manually provision credits and admin here",
  ],
};

function TeamPlanSalesCard() {
  const [open, setOpen] = useState(true);
  const d = TEAM_PLAN_DETAILS;
  return (
    <div className="glass rounded-2xl p-6 border border-[color:var(--brand-orange)]/40">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between text-left">
        <h2 className="font-semibold flex items-center gap-2">
          <Crown className="w-4 h-4 text-[color:var(--brand-orange)]" />
          Team plan — sales playbook
        </h2>
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      <p className="text-xs text-muted-foreground mt-1">
        How to sell the Team plan when a lead comes in from the Contact Us page.
      </p>
      {open && (
        <div className="mt-4 grid md:grid-cols-2 gap-4 text-sm">
          <SalesBlock title="Positioning">
            <p className="text-muted-foreground">{d.positioning}</p>
            <div className="mt-2 rounded-lg border border-border/60 bg-black/20 p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Suggested pricing</div>
              <div className="font-semibold mt-1">{d.price}</div>
            </div>
          </SalesBlock>
          <SalesBlock title="What's included">
            <ul className="space-y-1 text-muted-foreground list-disc pl-4">
              {d.includes.map((i) => <li key={i}>{i}</li>)}
            </ul>
          </SalesBlock>
          <SalesBlock title="Best-fit buyers">
            <ul className="space-y-1 text-muted-foreground list-disc pl-4">
              {d.bestFor.map((i) => <li key={i}>{i}</li>)}
            </ul>
          </SalesBlock>
          <SalesBlock title="Qualifying questions">
            <ul className="space-y-1 text-muted-foreground list-disc pl-4">
              {d.qualifyingQuestions.map((i) => <li key={i}>{i}</li>)}
            </ul>
          </SalesBlock>
          <SalesBlock title="Sales flow" wide>
            <ol className="space-y-1 text-muted-foreground">
              {d.salesFlow.map((i) => <li key={i}>{i}</li>)}
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`mailto:${SUPPORT_EMAIL}`} className="rounded-lg bg-[color:var(--brand-orange)] text-black text-xs px-3 py-1.5 font-medium">
                Email {SUPPORT_EMAIL}
              </a>
            </div>
          </SalesBlock>
        </div>
      )}
    </div>
  );
}

function SalesBlock({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`rounded-xl border border-border/60 bg-black/20 p-4 ${wide ? "md:col-span-2" : ""}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">{title}</div>
      {children}
    </div>
  );
}

// -------------------- Credits & Pricing Guide --------------------



function CreditGuide() {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("cv:collapse:admin-credit-guide") === "1";
  });
  function toggle() {
    setOpen((o) => {
      const next = !o;
      try { window.localStorage.setItem("cv:collapse:admin-credit-guide", next ? "1" : "0"); } catch { /* quota */ }
      return next;
    });
  }

  const grouped = CREDIT_COSTS.reduce<Record<string, typeof CREDIT_COSTS>>((acc, row) => {
    (acc[row.category] ??= []).push(row);
    return acc;
  }, {});
  const categories = Object.keys(grouped);

  function buildHtml(): string {
    const stamp = new Date().toLocaleString();
    const rowsHtml = CREDIT_COSTS.map((r) => `
      <tr>
        <td>${escapeHtml(r.category)}</td>
        <td><strong>${escapeHtml(r.label)}</strong></td>
        <td style="text-align:center;"><strong>${escapeHtml(String(r.credits))}</strong></td>
        <td>${escapeHtml(r.unit)}</td>
        <td>${escapeHtml(r.notes)}</td>
      </tr>`).join("");
    const intro = CREDIT_GUIDE_INTRO.map((l) => `<li>${escapeHtml(l)}</li>`).join("");
    return `<!doctype html><html><head><meta charset="utf-8"/>
      <title>Credits & Pricing Guide</title>
      <style>
        body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #111; padding: 32px; }
        h1 { margin: 0 0 4px; font-size: 22px; }
        .sub { color: #666; font-size: 12px; margin-bottom: 20px; }
        ul { margin: 0 0 20px 20px; padding: 0; font-size: 13px; color: #333; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #ddd; padding: 8px 10px; vertical-align: top; text-align: left; }
        th { background: #f4f4f6; text-transform: uppercase; letter-spacing: 0.04em; font-size: 11px; }
        tr:nth-child(even) td { background: #fafafa; }
        .foot { margin-top: 24px; font-size: 11px; color: #888; }
      </style></head><body>
      <h1>Credits &amp; Pricing Guide</h1>
      <div class="sub">CreatorFlow · generated ${escapeHtml(stamp)}</div>
      <ul>${intro}</ul>
      <table>
        <thead><tr><th>Category</th><th>Action</th><th>Credits</th><th>Unit</th><th>Notes</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="foot">Failed generations are refunded automatically. Prices may change — this document reflects current in-app values.</div>
      </body></html>`;
  }

  function exportDoc() {
    const blob = new Blob(["\ufeff", buildHtml()], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `credits-pricing-guide-${Date.now()}.doc`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast.success("Downloaded .doc (opens in Word / Pages / Google Docs)");
  }

  function exportPdf() {
    // Open the formatted HTML in a new window and trigger the browser's print
    // dialog — the user can then "Save as PDF" to their local machine. This
    // avoids adding a heavy PDF dependency and preserves formatting.
    const w = window.open("", "_blank", "noopener,width=900,height=800");
    if (!w) { toast.error("Popup blocked — allow popups to export PDF."); return; }
    w.document.open();
    w.document.write(buildHtml());
    w.document.close();
    // Give the window a beat to layout, then print.
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* ignore */ } }, 250);
  }

  return (
    <div className="glass rounded-2xl p-6 border border-[color:var(--neon-purple)]/30">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <h2 className="font-semibold flex items-center gap-2">
          <Coins className="w-4 h-4 text-[color:var(--neon-pink)]" />
          Credits & pricing guide
          <span className="text-xs text-muted-foreground font-normal">· how much each generation costs</span>
        </h2>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button onClick={exportPdf} className="rounded-lg glass border border-border hover:bg-white/5 px-3 py-1.5 text-xs flex items-center gap-1.5">
              <Printer className="w-3.5 h-3.5" /> Export PDF
            </button>
            <button onClick={exportDoc} className="rounded-lg glass border border-border hover:bg-white/5 px-3 py-1.5 text-xs flex items-center gap-1.5">
              <FileDown className="w-3.5 h-3.5" /> Export DOC
            </button>
          </div>

          <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
            {CREDIT_GUIDE_INTRO.map((line) => <li key={line}>{line}</li>)}
          </ul>

          <div className="space-y-4">
            {categories.map((cat) => (
              <div key={cat}>
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
                  <FileText className="w-3 h-3" /> {cat}
                </div>
                <div className="overflow-hidden rounded-xl border border-border/60">
                  <table className="w-full text-sm">
                    <thead className="bg-white/5 text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">Action</th>
                        <th className="text-center px-3 py-2 w-24">Credits</th>
                        <th className="text-left px-3 py-2 w-48">Unit</th>
                        <th className="text-left px-3 py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped[cat].map((row) => (
                        <tr key={row.id} className="border-t border-border/40">
                          <td className="px-3 py-2 font-medium">{row.label}</td>
                          <td className="px-3 py-2 text-center font-mono text-[color:var(--neon-pink)]">{row.credits}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{row.unit}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{row.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
