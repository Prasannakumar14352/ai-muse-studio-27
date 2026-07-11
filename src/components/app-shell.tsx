import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import {
  LayoutDashboard, Plus, Image as ImageIcon, Type,
  Settings, CreditCard, LogOut, Menu, X, Crown, Film, Layers, Mail, Receipt, Zap, Infinity as InfinityIcon, Wallet, Sparkles, Plug,
  ChevronLeft, ChevronRight, Linkedin,
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
  moduleId?: ModuleId;
};

type NavSection = {
  label: string;
  items: readonly NavItem[];
  adminOnly?: boolean;
};

const SECTIONS: readonly NavSection[] = [
  {
    label: "Create",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/create", label: "New Project", icon: Plus },
      { to: "/videos", label: "Videos", icon: Film, moduleId: "videos" },
      { to: "/carousels", label: "Carousels", icon: Layers, moduleId: "carousels" },
      { to: "/images", label: "Images", icon: ImageIcon, moduleId: "images" },
      { to: "/thumbnails", label: "Thumbnails", icon: Sparkles, moduleId: "thumbnails" },
      { to: "/captions", label: "Captions", icon: Type, moduleId: "captions" },
    ],
  },
  {
    label: "Publishing",
    items: [
      { to: "/connections", label: "Connections", icon: Plug },
      { to: "/connections", label: "LinkedIn Posts", icon: Linkedin },
    ],
  },
  {
    label: "Manage",
    items: [
      { to: "/pricing", label: "Pricing", icon: CreditCard },
      { to: "/billing", label: "Billing", icon: Wallet },
      { to: "/invoices", label: "Invoices", icon: Receipt },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    label: "Admin",
    adminOnly: true,
    items: [
      { to: "/admin", label: "Admin", icon: Crown },
      { to: "/admin/integrations", label: "Social Publishing", icon: Plug },
    ],
  },
  {
    label: "Support",
    items: [
      { to: "/contact", label: "Contact Us", icon: Mail },
    ],
  },
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

  const sections = SECTIONS.filter((s) => !s.adminOnly || access?.isAdmin);

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

  function isActive(to: string): boolean {
    if (derivedNav) return derivedNav === to;
    if (to === "/dashboard") return pathname === "/dashboard";
    return pathname === to || pathname.startsWith(to + "/");
  }

  function renderNavItem(n: NavItem, onClick?: () => void) {
    const active = isActive(n.to);
    const count = n.moduleId ? counts?.[n.moduleId] ?? 0 : null;
    return (
      <Link
        key={`${n.to}-${n.label}`}
        to={n.to}
        onClick={onClick}
        title={collapsed ? n.label : undefined}
        className={`group relative flex items-center ${collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2"} rounded-xl text-sm font-medium transition-all duration-200 ${
          active
            ? "gradient-primary text-white shadow-[0_8px_24px_-8px_oklch(0.68_0.19_55/0.55)]"
            : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
        }`}
      >
        {active && !collapsed && (
          <span className="absolute -left-3 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-white/80" aria-hidden />
        )}
        <n.icon className={`w-4 h-4 shrink-0 transition-transform duration-200 ${!active ? "group-hover:scale-110" : ""}`} />
        {!collapsed && <span className="flex-1 truncate">{n.label}</span>}
        {!collapsed && count !== null && count > 0 && (
          <span className={`ml-auto inline-flex items-center justify-center min-w-[22px] h-[20px] px-1.5 text-[10px] font-semibold rounded-full ${
            active
              ? "bg-white/25 text-white"
              : "bg-white/[0.06] text-muted-foreground group-hover:bg-white/10 group-hover:text-foreground"
          }`}>
            {count}
          </span>
        )}
      </Link>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Sidebar desktop */}
      <aside
        className={`hidden md:flex shrink-0 flex-col border-r border-border/40 bg-sidebar/70 backdrop-blur-2xl overflow-hidden transition-[width] duration-300 ease-out ${
          collapsed ? "md:w-[72px]" : "md:w-[264px]"
        }`}
      >
        {/* Brand section — compact workspace header */}
        <div className="relative px-3 pt-4 pb-3 border-b border-border/40">
          {collapsed ? (
            <Link
              to="/dashboard"
              aria-label="CreatorVault AI home"
              className="flex items-center justify-center rounded-xl p-1.5 transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BrandLogo alt="" className="h-9 w-auto object-contain" />
            </Link>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                to="/dashboard"
                aria-label="CreatorVault AI home"
                className="shrink-0 flex items-center justify-center rounded-lg p-1 transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <BrandLogo alt="" className="h-[52px] w-auto max-w-[64px] object-contain" />
              </Link>
              <div className="min-w-0 flex-1 flex flex-col gap-1">
                <div className="flex flex-col leading-tight">
                  <span className="text-[15px] font-semibold tracking-tight text-foreground truncate">
                    CreatorVault AI
                  </span>
                  <span className="text-[11px] text-muted-foreground/80 truncate">
                    by ProdXStore
                  </span>
                </div>
                <PlanPill />
              </div>
            </div>
          )}

          {/* Circular collapse toggle */}
          <button
            type="button"
            onClick={toggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute -right-3 top-6 z-10 h-7 w-7 rounded-full border border-border/60 bg-background/95 backdrop-blur text-muted-foreground shadow-md flex items-center justify-center transition-all duration-200 hover:text-foreground hover:scale-110 hover:border-[color:var(--brand-orange)]/50 hover:shadow-[0_0_16px_-2px_oklch(0.68_0.19_55/0.55)]"
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>


        {/* Navigation */}
        <nav className={`flex-1 overflow-y-auto ${collapsed ? "px-2" : "px-3"} pb-3 space-y-4 scrollbar-thin`}>
          {sections.map((section) => (
            <div key={section.label} className="space-y-1">
              {!collapsed && (
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-[0.14em] uppercase text-muted-foreground/60">
                  {section.label}
                </div>
              )}
              {collapsed && <div className="mx-3 my-2 h-px bg-border/40" />}
              <div className="space-y-0.5">
                {section.items.map((n) => renderNavItem(n))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div className={`${collapsed ? "px-2" : "px-3"} pb-4 pt-3 border-t border-border/40`}>
          <button
            onClick={signOut}
            title={collapsed ? "Sign out" : undefined}
            className={`w-full flex items-center ${collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2"} rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
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
          <nav className="p-4 space-y-5">
            {sections.map((section) => (
              <div key={section.label} className="space-y-1">
                <div className="px-3 text-[10px] font-semibold tracking-[0.14em] uppercase text-muted-foreground/60">
                  {section.label}
                </div>
                {section.items.map((n) => {
                  const count = n.moduleId ? counts?.[n.moduleId] ?? 0 : null;
                  const active = isActive(n.to);
                  return (
                    <Link
                      key={`${n.to}-${n.label}`}
                      to={n.to}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm ${
                        active ? "gradient-primary text-white" : "hover:bg-white/5"
                      }`}
                    >
                      <n.icon className="w-4 h-4" />
                      <span className="flex-1">{n.label}</span>
                      {count !== null && count > 0 && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${active ? "bg-white/25 text-white" : "bg-white/10 text-muted-foreground"}`}>{count}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
            <button onClick={signOut}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm hover:bg-white/5 border-t border-border/40 mt-4 pt-4">
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

function PlanPill() {
  const { data: access } = useAccess();
  if (!access) return null;
  const unlimited = access.unlimited;
  const planName = unlimited ? "Unlimited Plan" : "Creator Plan";
  return (
    <Link
      to="/pricing"
      className={`inline-flex items-center gap-1.5 self-start rounded-full px-2 py-0.5 text-[10.5px] font-medium border transition ${
        unlimited
          ? "border-amber-500/30 bg-amber-500/[0.08] text-amber-200 hover:bg-amber-500/[0.14]"
          : "border-border/60 bg-white/[0.03] text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
      }`}
    >
      <Crown className={`w-3 h-3 ${unlimited ? "text-amber-300" : "text-muted-foreground"}`} />
      <span>{planName}</span>
    </Link>
  );
}
