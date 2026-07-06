import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import {
  LayoutDashboard, Plus, Image as ImageIcon, Type,
  Settings, CreditCard, LogOut, Menu, X, Crown, Film, Layers, Mail, Receipt, Zap, Infinity as InfinityIcon, Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAccess, getAvailableCredits } from "@/lib/access";

import { ConfirmDialogHost } from "@/components/confirm-dialog";
import brandLogo from "@/assets/prodxstore-logo.png.asset.json";

const BASE_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/create", label: "New Project", icon: Plus },
  { to: "/videos", label: "Videos", icon: Film },
  { to: "/carousels", label: "Carousels", icon: Layers },
  { to: "/images", label: "Images", icon: ImageIcon },
  { to: "/captions", label: "Captions", icon: Type },
  { to: "/pricing", label: "Pricing", icon: CreditCard },
  { to: "/billing", label: "Billing", icon: Wallet },
  { to: "/invoices", label: "Invoices", icon: Receipt },
  { to: "/contact", label: "Contact Us", icon: Mail },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;


export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: access } = useAccess();

  const NAV = access?.isAdmin
    ? [...BASE_NAV, { to: "/admin" as const, label: "Admin", icon: Crown }]
    : BASE_NAV;

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex md:w-64 shrink-0 flex-col border-r border-border/50 bg-sidebar/60 backdrop-blur-xl overflow-y-auto">
        <div className="flex flex-col items-center gap-3 px-4 py-5 border-b border-border/50">
          <Link
            to="/dashboard"
            aria-label="CreatorVault AI home"
            className="flex items-center justify-center rounded-lg p-1 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <img src={brandLogo.url} alt="" className="h-10 w-auto object-contain" />
          </Link>
          <Link
            to="/dashboard"
            aria-label="CreatorVault AI home"
            className="flex items-center justify-center rounded-lg p-1 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="text-base font-bold tracking-tight whitespace-nowrap bg-gradient-to-r from-[color:var(--brand-orange)] to-[color:var(--neon-pink)] bg-clip-text text-transparent">
              CreatorVault AI
            </span>
          </Link>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((n) => {
            const active = pathname === n.to || (n.to !== "/dashboard" && pathname.startsWith(n.to));
            return (
              <Link key={n.to} to={n.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                  active ? "gradient-primary text-white shadow-lg" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}>
                <n.icon className="w-4 h-4" /> {n.label}
              </Link>
            );
          })}
        </nav>
        <button onClick={signOut}
          className="flex items-center gap-3 mx-3 mb-4 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white/5">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <Link to="/dashboard" className="flex items-center">
          <img src={brandLogo.url} alt="CreatorVault AI" className="h-7 w-auto object-contain" />
        </Link>
        <Link to="/dashboard" className="justify-self-center">
          <span className="text-base font-bold tracking-tight whitespace-nowrap bg-gradient-to-r from-[color:var(--brand-orange)] to-[color:var(--neon-pink)] bg-clip-text text-transparent">
            CreatorVault AI
          </span>
        </Link>
        <div className="flex items-center gap-2 justify-self-end">
          <CreditsChip />
          <button onClick={() => setOpen(!open)} className="p-2 rounded-lg hover:bg-white/5">
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      {open && (
        <div className="md:hidden fixed inset-0 z-30 pt-14 bg-background/95 backdrop-blur-xl overflow-y-auto">
          <nav className="p-4 space-y-1">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm hover:bg-white/5">
                <n.icon className="w-4 h-4" /> {n.label}
              </Link>
            ))}
            <button onClick={signOut}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm hover:bg-white/5">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </nav>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 min-w-0 pt-14 md:pt-0 overflow-y-auto">
        {/* Desktop header with credits */}
        <div className="hidden md:flex sticky top-0 z-20 items-center justify-end gap-3 px-6 md:px-10 py-3 border-b border-border/50 bg-background/70 backdrop-blur-xl">
          <CreditsChip />
        </div>
        <div className="max-w-7xl mx-auto p-6 md:p-10">{children}</div>
      </main>
      <ConfirmDialogHost />
    </div>
  );
}

function CreditsChip() {
  const { data: access } = useAccess();
  if (!access) return null;
  if (access.unlimited) {
    return (
      <Link
        to="/pricing"
        className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-xs font-medium border border-amber-500/40 text-amber-200 hover:bg-white/10 transition">
        <Crown className="w-3.5 h-3.5" /> Unlimited
      </Link>
    );
  }
  const total = getAvailableCredits(access);
  const low = total < 20;
  return (
    <Link
      to="/pricing"
      title={`Balance: ${access.balance.toLocaleString()} · Monthly left: ${access.monthlyRemaining.toLocaleString()}`}
      className={`inline-flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-xs font-medium border transition hover:bg-white/10 ${
        low ? "border-rose-500/50 text-rose-200" : "border-[color:var(--neon-purple)]/40 text-foreground"
      }`}>
      <Zap className={`w-3.5 h-3.5 ${low ? "text-rose-300" : "text-[color:var(--neon-pink)]"}`} />
      <span>{Number.isFinite(total) ? total.toLocaleString() : <InfinityIcon className="w-3.5 h-3.5" />}</span>
      <span className="text-muted-foreground hidden sm:inline">credits</span>
      <span className="text-muted-foreground">·</span>
      <span className="text-[color:var(--brand-orange)]">Top up</span>
    </Link>
  );
}


