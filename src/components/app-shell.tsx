import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import {
  LayoutDashboard, Plus, Image as ImageIcon, Type,
  Settings, CreditCard, LogOut, Menu, X, Crown, Film, Layers, Mail, Receipt, Zap, Infinity as InfinityIcon, Wallet, Sparkles, Plug,
  ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccess, getAvailableCredits } from "@/lib/access";
import { MODULE_CONTENT_TYPES, type ModuleId } from "@/lib/content-types";

import { ConfirmDialogHost } from "@/components/confirm-dialog";
import { BrandLogo } from "@/components/brand-logo";

// Map a project's `content_type` to the top-level sidebar tab that should
// show the "active" highlight while the user is editing that project at
// `/projects/$id`.
const CONTENT_TYPE_TO_NAV: Record<string, string> = {
  long_video: "/videos",
  short_reel: "/videos",
  talking_object: "/videos",
  documentary: "/videos",
  product_promo: "/videos",
  ai_image: "/images",
  carousel: "/carousels",
  thumbnail: "/thumbnails",
  caption_only: "/captions",
  seo_pack: "/captions",
};

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Optional module scope used to show a count badge for that content type. */
  moduleId?: ModuleId;
};

const BASE_NAV: readonly NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/create", label: "New Project", icon: Plus },
  { to: "/videos", label: "Videos", icon: Film, moduleId: "videos" },
  { to: "/carousels", label: "Carousels", icon: Layers, moduleId: "carousels" },
  { to: "/images", label: "Images", icon: ImageIcon, moduleId: "images" },
  { to: "/thumbnails", label: "Thumbnails", icon: Sparkles, moduleId: "thumbnails" },
  { to: "/captions", label: "Captions", icon: Type, moduleId: "captions" },
  { to: "/connections", label: "Connections", icon: Plug },
  { to: "/pricing", label: "Pricing", icon: CreditCard },
  { to: "/billing", label: "Billing", icon: Wallet },
  { to: "/invoices", label: "Invoices", icon: Receipt },
  { to: "/contact", label: "Contact Us", icon: Mail },
  { to: "/settings", label: "Settings", icon: Settings },
];

const SIDEBAR_COLLAPSED_KEY = "cvai:sidebar:collapsed";

function useModuleCounts() {
  return useQuery({
    queryKey: ["module-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("content_type");
      if (error) throw error;
      const counts: Record<ModuleId, number> = {
        videos: 0, carousels: 0, images: 0, thumbnails: 0, captions: 0,
      };
      const inv: Record<string, ModuleId> = {};
      (Object.keys(MODULE_CONTENT_TYPES) as ModuleId[]).forEach((m) => {
        MODULE_CONTENT_TYPES[m].forEach((ct) => { inv[ct] = m; });
      });
      for (const row of data ?? []) {
        const m = row.content_type ? inv[row.content_type] : undefined;
        if (m) counts[m] += 1;
      }
      return counts;
    },
    staleTime: 30_000,
  });
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: access } = useAccess();
  const { data: counts } = useModuleCounts();

  const NAV: readonly NavItem[] = access?.isAdmin
    ? [...BASE_NAV, { to: "/admin", label: "Admin", icon: Crown }]
    : BASE_NAV;

  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      }
      return next;
    });
  }

  const projectMatch = /^\/projects\/([^/]+)/.exec(pathname);
  const projectId = projectMatch?.[1];
  const projectData = projectId
    ? (qc.getQueryData<{ project: { content_type?: string | null } | null }>(["project", projectId]))
    : undefined;
  const derivedNav = projectId
    ? (projectData?.project?.content_type
        ? (CONTENT_TYPE_TO_NAV[projectData.project.content_type] ?? "/dashboard")
        : "/dashboard")
    : null;

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Sidebar desktop */}
      <aside
        className={`hidden md:flex shrink-0 flex-col border-r border-border/50 bg-sidebar/60 backdrop-blur-xl overflow-y-auto transition-[width] duration-200 ${
          collapsed ? "md:w-16" : "md:w-64"
        }`}
      >
        <div className={`flex ${collapsed ? "flex-col items-center gap-2 py-4 px-2" : "flex-col items-center gap-3 py-5 px-4"} border-b border-border/50`}>
          <Link
            to="/dashboard"
            aria-label="CreatorVault AI home"
            className="flex items-center justify-center rounded-lg p-1 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <BrandLogo alt="" className={collapsed ? "h-8 w-auto object-contain" : "h-10 w-auto object-contain"} />
          </Link>
          {!collapsed && (
            <Link
              to="/dashboard"
              aria-label="CreatorVault AI home"
              className="flex items-center justify-center rounded-lg p-1 transition hover:bg-white/5"
            >
              <span className="text-base font-bold tracking-tight whitespace-nowrap bg-gradient-to-r from-[color:var(--brand-orange)] to-[color:var(--neon-pink)] bg-clip-text text-transparent">
                CreatorVault AI
              </span>
            </Link>
          )}
          <button
            type="button"
            onClick={toggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="mt-1 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
          >
            {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
          </button>
        </div>
        <nav className={`flex-1 ${collapsed ? "px-2" : "px-3"} py-4 space-y-1`}>
          {NAV.map((n) => {
            const active = derivedNav
              ? derivedNav === n.to
              : pathname === n.to || (n.to !== "/dashboard" && pathname.startsWith(n.to));
            const count = n.moduleId ? counts?.[n.moduleId] ?? 0 : null;
            return (
              <Link
                key={n.to}
                to={n.to}
                title={collapsed ? n.label : undefined}
                className={`flex items-center gap-3 ${collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"} rounded-lg text-sm transition ${
                  active ? "gradient-primary text-white shadow-lg" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                <n.icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="flex-1 truncate">{n.label}</span>}
                {!collapsed && count !== null && count > 0 && (
                  <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full ${
                    active ? "bg-white/20 text-white" : "bg-white/5 text-muted-foreground"
                  }`}>
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={signOut}
          title={collapsed ? "Sign out" : undefined}
          className={`flex items-center gap-3 ${collapsed ? "justify-center mx-2" : "mx-3"} mb-4 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white/5`}
        >
          <LogOut className="w-4 h-4 shrink-0" /> {!collapsed && "Sign out"}
        </button>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-5 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <Link
          to="/dashboard"
          aria-label="CreatorVault AI home"
          className="flex items-center justify-center rounded-lg p-1 transition hover:bg-white/5"
        >
          <BrandLogo alt="" className="h-7 w-auto object-contain" />
        </Link>
        <Link
          to="/dashboard"
          aria-label="CreatorVault AI home"
          className="justify-self-center flex items-center justify-center rounded-lg p-1 transition hover:bg-white/5"
        >
          <span className="text-base font-bold tracking-tight whitespace-nowrap bg-gradient-to-r from-[color:var(--brand-orange)] to-[color:var(--neon-pink)] bg-clip-text text-transparent">
            CreatorVault AI
          </span>
        </Link>
        <div className="flex items-center gap-2 justify-self-end">
          <CreditsChip />
          <button
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="p-2 rounded-lg transition hover:bg-white/5"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      {open && (
        <div className="md:hidden fixed inset-0 z-30 pt-14 bg-background/95 backdrop-blur-xl overflow-y-auto">
          <nav className="p-4 space-y-1">
            {NAV.map((n) => {
              const count = n.moduleId ? counts?.[n.moduleId] ?? 0 : null;
              return (
                <Link key={n.to} to={n.to} onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm hover:bg-white/5">
                  <n.icon className="w-4 h-4" />
                  <span className="flex-1">{n.label}</span>
                  {count !== null && count > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-muted-foreground">{count}</span>
                  )}
                </Link>
              );
            })}
            <button onClick={signOut}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm hover:bg-white/5">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </nav>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 min-w-0 pt-14 md:pt-0 overflow-y-auto">
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
