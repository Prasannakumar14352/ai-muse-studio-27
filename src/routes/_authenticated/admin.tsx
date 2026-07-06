import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/lib/access";
import { confirmDialog } from "@/components/confirm-dialog";
import { CREDIT_COSTS, CREDIT_GUIDE_INTRO, ASSET_CREDIT_COST } from "@/lib/credit-costs";
import { Crown, Users, Layers, Zap, Plus, Shield, ShieldOff, Ban, Loader2, ChevronDown, ChevronRight, Coins, FileText, FileDown, Printer, Image as ImageIcon, Film, Video } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({ component: AdminPanel });

function AdminPanel() {
  const { data: access, isLoading } = useAccess();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

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
    const raw = window.prompt("Add how many credits?", "100");
    const n = raw ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(n) || n <= 0) return;
    setBusy(userId);
    const { data: cur } = await supabase.from("profiles").select("user_credits").eq("id", userId).single();
    const newBal = (cur?.user_credits ?? 0) + n;
    const { error } = await supabase.from("profiles").update({ user_credits: newBal } as any).eq("id", userId);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Added ${n} credits`);
    refetch();
    qc.invalidateQueries({ queryKey: ["access"] });
  }

  async function toggleAdmin(userId: string, makeAdmin: boolean) {
    setBusy(userId);
    const { error: pErr } = await supabase.from("profiles")
      .update({ is_admin: makeAdmin, role: makeAdmin ? "admin" : "user" } as any).eq("id", userId);
    if (pErr) { setBusy(null); return toast.error(pErr.message); }
    if (makeAdmin) {
      await (supabase.from("user_roles") as any).insert({ user_id: userId, role: "admin" });
    } else {
      await (supabase.from("user_roles") as any).delete().eq("user_id", userId).eq("role", "admin");
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
    const { error } = await supabase.from("subscriptions")
      .update({ status: "cancelled" } as any).eq("user_id", userId).eq("status", "active");
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Subscription cancelled");
    refetch();
  }

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl p-6 flex items-center gap-4 border-[color:var(--neon-purple)]/50">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
          <Crown className="w-6 h-6 text-white" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Admin Panel</div>
          <h1 className="text-2xl font-bold">Manage users & subscriptions</h1>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Metric icon={Users} label="Users" value={users?.length ?? 0} />
        <Metric icon={Layers} label="Projects" value={users?.reduce((a, u) => a + u.projects, 0) ?? 0} />
        <Metric icon={Zap} label="Active subs" value={users?.filter((u) => u.sub).length ?? 0} />
      </div>

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
      <div class="sub">CreatorVault · generated ${escapeHtml(stamp)}</div>
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
