import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useMemo, useState } from "react";
import {
  LayoutDashboard, Plus, Image as ImageIcon, Type,
  Settings, CreditCard, LogOut, Menu, X, Crown, Film, Layers, Mail, Receipt, Zap, Infinity as InfinityIcon, Wallet, Sparkles, Plug, Linkedin,
  ChevronLeft, Search, Bot, Palette, Split, BarChart3, Store, Target, Calendar as CalendarIcon, Library, Megaphone, Tag,
  Bell, User as UserIcon, FolderKanban, Command as CommandIcon, Clapperboard, Lock, Repeat, Wand2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAccess, getAvailableCredits } from "@/lib/access";
import { MODULE_CONTENT_TYPES, type ModuleId } from "@/lib/content-types";
import { usePlanAccess, useUpgradeDialog, userTier } from "@/lib/use-plan-access";
import { TIER_LABEL } from "@/lib/plan-access";
import { CommandPalette, openCommandPalette } from "@/components/command-palette";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


import { ConfirmDialogHost } from "@/components/confirm-dialog";
import { BrandLogo } from "@/components/brand-logo";
import { getSupportChat } from "@/lib/support-chat.functions";
import { isHiddenPath, CONNECTIONS_PATH } from "@/lib/hidden-features";
import { useSocialPublishingAvailable } from "@/lib/use-social-publishing";
import { PromptDialogHost } from "@/components/prompt-dialog";

// Map a project's `content_type` to the top-level sidebar tab that should
// show the "active" highlight while the user is editing that project at
// `/projects/$id`.
const CONTENT_TYPE_TO_NAV: Record<string, string> = {
  long_video: "/videos",
  short_reel: "/videos",
  talking_object: "/videos",
  documentary: "/videos",
  product_promo: "/videos",
  promo_video: "/promo-videos",
  ai_image: "/images",
  carousel: "/carousels",
  thumbnail: "/thumbnails",
  caption_only: "/captions",
  seo_pack: "/captions",
};
// Pages that live under another item's URL but belong to a different sidebar item
// (e.g. /create/carousel would otherwise light up "AI Studio" via the /create prefix).
const ROUTE_NAV_ALIASES: Array<[prefix: string, nav: string]> = [
  ["/create/carousel", "/carousels"],
];


type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  moduleId?: ModuleId;
  /** Shown with a "Soon" badge: a coming-soon page, not a working feature. */
  soon?: boolean;
};

type NavSection = {
  label: string;
  items: readonly NavItem[];
  adminOnly?: boolean;
};

const SECTIONS: readonly NavSection[] = [
  {
    label: "Home",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Create",
    items: [
      { to: "/videos", label: "Projects", icon: FolderKanban, moduleId: "videos" },
      { to: "/series", label: "Series Autopilot", icon: Repeat, soon: true },
      { to: "/tools", label: "AI Tools", icon: Wand2, soon: true },
      { to: "/create", label: "AI Studio", icon: Bot },
      { to: "/model-studio", label: "Model Studio", icon: Clapperboard },
      { to: "/promo-videos", label: "Promo Video", icon: Megaphone, moduleId: "promo_videos" },
      { to: "/carousels", label: "Carousels", icon: Layers, moduleId: "carousels" },
      { to: "/images", label: "Images", icon: ImageIcon, moduleId: "images" },
      { to: "/thumbnails", label: "Thumbnails", icon: Sparkles, moduleId: "thumbnails" },
      { to: "/captions", label: "Captions", icon: Type, moduleId: "captions" },
      { to: "/seo", label: "SEO Package", icon: Type },
      { to: "/linkedin-posts", label: "LinkedIn Posts", icon: Linkedin, moduleId: "linkedin" },
      { to: "/repurpose", label: "Repurpose", icon: Split },
      { to: "/templates", label: "Templates", icon: Sparkles },
      { to: "/marketplace", label: "Marketplace", icon: Store },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { to: "/research", label: "Research", icon: Search },
      { to: "/strategy", label: "AI Strategy", icon: Target },
      { to: "/agents", label: "AI Agents", icon: Bot },
      { to: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Plan & Assets",
    items: [
      { to: "/calendar", label: "Planner", icon: CalendarIcon },
      { to: "/brand-kit", label: "Brand Kit", icon: Palette },
      { to: "/library", label: "Media Library", icon: Library },
    ],
  },
  {
    label: "Publish",
    items: [
      { to: "/connections", label: "Connections", icon: Plug },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/settings", label: "Settings", icon: Settings },
      { to: "/pricing", label: "Pricing", icon: CreditCard },
      { to: "/billing", label: "Billing", icon: Wallet },
      { to: "/invoices", label: "Invoices", icon: Receipt },
    ],
  },
  {
    label: "Admin",
    adminOnly: true,
    items: [
      { to: "/admin", label: "Admin", icon: Crown },
      { to: "/admin/templates", label: "Templates CMS", icon: Sparkles },
      { to: "/admin/integrations", label: "Social Publishing", icon: Plug },
      { to: "/admin/marketplace", label: "Marketplace CMS", icon: Store },
      { to: "/admin/readiness", label: "Feature Readiness", icon: Crown },
      { to: "/admin/plan-access", label: "Plan Access", icon: Lock },
      { to: "/admin/payments", label: "Payment Settings", icon: CreditCard },
      { to: "/admin/offers", label: "Offers & Codes", icon: Tag },
      { to: "/admin/agents", label: "Agent HQ", icon: Bot },
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
      // Count only the signed-in user's own projects, with the same rules each page's
      // list uses — admins can read everyone's rows, so an unfiltered count was wrong.
      const { data: auth } = await supabase.auth.getSession();
      const userId = auth.session?.user.id;
      if (!userId) throw new Error("Not signed in yet");
      const { data, error } = await supabase
        .from("projects")
        .select("content_type, thumbnail_url")
        .eq("user_id", userId);
      if (error) throw error;
      const counts: Record<ModuleId, number> = {
        videos: 0, promo_videos: 0, carousels: 0, images: 0, thumbnails: 0, captions: 0, linkedin: 0,
      };
      const inv: Record<string, ModuleId> = {};
      (Object.keys(MODULE_CONTENT_TYPES) as ModuleId[]).forEach((m) => {
        MODULE_CONTENT_TYPES[m].forEach((ct) => { inv[ct] = m; });
      });
      for (const row of data ?? []) {
        const m = row.content_type ? inv[row.content_type] : undefined;
        // /images lists only images that have a file (thumbnail_url).
        if (m === "images" && !row.thumbnail_url) continue;
        if (m) counts[m] += 1;
      }
      return counts;
    },
    staleTime: 30_000,
  });
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { canPath } = usePlanAccess();
  const openUpgrade = useUpgradeDialog();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: access } = useAccess();
  const { data: counts } = useModuleCounts();

  const socialAvailable = useSocialPublishingAvailable();
  const sections = SECTIONS.filter((s) => !s.adminOnly || access?.isAdmin).map((s) => ({
    ...s,
    items: s.items.filter((n) => !isHiddenPath(n.to)
      && (n.to !== CONNECTIONS_PATH || socialAvailable || access?.isAdmin)),
  }));

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
        ? (CONTENT_TYPE_TO_NAV[projectData.project.content_type] ?? "/videos")
        : "/videos")
    : (ROUTE_NAV_ALIASES.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/"))?.[1] ?? null);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  // Longest-prefix wins: pick exactly one active nav item across ALL sections.
  // This prevents sibling items from staying active (e.g. /admin AND /admin/templates).
  const allNavRoutes = useMemo<string[]>(
    () => SECTIONS.flatMap((s) => s.items.map((i) => i.to)),
    []
  );
  const activeRoute = useMemo(() => {
    if (derivedNav) return derivedNav;
    // Exact match beats everything.
    const exact = allNavRoutes.find((r) => r === pathname);
    if (exact) return exact;
    // Otherwise pick the longest prefix match on a "/segment" boundary.
    let best: string | null = null;
    for (const r of allNavRoutes) {
      if (r === "/") continue;
      if (pathname === r || pathname.startsWith(r + "/")) {
        if (!best || r.length > best.length) best = r;
      }
    }
    return best;
  }, [allNavRoutes, pathname, derivedNav]);

  function isActive(to: string): boolean {
    return activeRoute === to;
  }


  function renderNavItem(n: NavItem, onClick?: () => void) {
    const active = isActive(n.to);
    const count = n.moduleId ? counts?.[n.moduleId] ?? 0 : null;
    const lock = canPath(n.to);
    return (
      <Link
        key={`${n.to}-${n.label}`}
        to={n.to}
        onClick={(e) => {
          if (!lock.allowed) {
            e.preventDefault();
            openUpgrade({ label: n.label, required: lock.required });
            return;
          }
          onClick?.();
        }}
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
        {!collapsed && <span className={`flex-1 truncate ${!lock.allowed ? "opacity-60" : ""}`}>{n.label}</span>}
        {!collapsed && n.soon && (
          <span className="ml-auto text-[9px] uppercase tracking-wide font-semibold rounded-full px-1.5 py-0.5 bg-violet-500/15 text-violet-200">Soon</span>
        )}
        {!lock.allowed && (collapsed ? (
          <Lock className="absolute top-1 right-1 w-2.5 h-2.5 text-muted-foreground" aria-label="Locked" />
        ) : (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-1.5 h-[20px] bg-white/[0.06] text-muted-foreground" title={`Requires ${TIER_LABEL[lock.required]}`}>
            <Lock className="w-3 h-3" /> {TIER_LABEL[lock.required]}
          </span>
        ))}
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
              aria-label="CreatorFlow AI home"
              className="flex items-center justify-center rounded-xl p-1.5 transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BrandLogo alt="" className="h-9 w-auto object-contain" />
            </Link>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                to="/dashboard"
                aria-label="CreatorFlow AI home"
                className="shrink-0 flex items-center justify-center rounded-lg p-1 transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <BrandLogo alt="" className="h-[52px] w-auto max-w-[64px] object-contain" />
              </Link>
              <div className="min-w-0 flex-1 flex flex-col gap-1">
                <div className="flex flex-col leading-tight">
                  <span className="text-[15px] font-semibold tracking-tight text-foreground truncate">
                    CreatorFlow AI
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
            aria-pressed={collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="group absolute -right-3 top-6 z-10 h-7 w-7 rounded-full border border-border/60 bg-background/95 backdrop-blur text-muted-foreground shadow-md flex items-center justify-center transition-all duration-300 ease-out hover:text-foreground hover:scale-110 hover:border-[color:var(--brand-orange)]/60 hover:shadow-[0_0_18px_-2px_oklch(0.68_0.19_55/0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-orange)]/60 active:scale-95"
          >
            <ChevronLeft
              className={`w-3.5 h-3.5 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                collapsed ? "rotate-180" : "rotate-0"
              }`}
            />
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
          aria-label="CreatorFlow AI home"
          className="flex items-center justify-center rounded-lg p-1 transition hover:bg-white/5"
        >
          <BrandLogo alt="" className="h-7 w-auto object-contain" />
        </Link>
        <Link
          to="/dashboard"
          aria-label="CreatorFlow AI home"
          className="justify-self-center flex items-center justify-center rounded-lg p-1 transition hover:bg-white/5"
        >
          <span className="text-base font-bold tracking-tight whitespace-nowrap bg-gradient-to-r from-[color:var(--brand-orange)] to-[color:var(--neon-pink)] bg-clip-text text-transparent">
            CreatorFlow AI
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
                  const lock = canPath(n.to);
                  return (
                    <Link
                      key={`${n.to}-${n.label}`}
                      to={n.to}
                      onClick={(e) => {
                        setOpen(false);
                        if (!lock.allowed) {
                          e.preventDefault();
                          openUpgrade({ label: n.label, required: lock.required });
                        }
                      }}
                      className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm ${
                        active ? "gradient-primary text-white" : "hover:bg-white/5"
                      }`}
                    >
                      <n.icon className="w-4 h-4" />
                      <span className={`flex-1 ${!lock.allowed ? "opacity-60" : ""}`}>{n.label}</span>
                      {!lock.allowed && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-muted-foreground">
                          <Lock className="w-3 h-3" /> {TIER_LABEL[lock.required]}
                        </span>
                      )}
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
        <div className="hidden md:flex sticky top-0 z-20 items-center gap-3 px-6 md:px-10 py-3 border-b border-border/50 bg-background/70 backdrop-blur-xl">
          <button
            onClick={openCommandPalette}
            className="group flex-1 max-w-xl flex items-center gap-2 rounded-xl border border-border/60 bg-white/[0.03] hover:bg-white/[0.06] px-3 py-2 text-sm text-muted-foreground transition"
          >
            <Search className="w-4 h-4" />
            <span className="flex-1 text-left">Search or run a command…</span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
              <kbd className="rounded border border-border/70 bg-white/[0.04] px-1.5 py-0.5">{modKey()}</kbd>
              <kbd className="rounded border border-border/70 bg-white/[0.04] px-1.5 py-0.5">K</kbd>
            </span>
          </button>
          <Link
            to="/create"
            className="hidden lg:inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-white gradient-primary shadow-[var(--shadow-glow)] hover:opacity-95"
          >
            <Plus className="w-4 h-4" /> New
          </Link>
          <NotificationsMenu />
          <CreditsChip />
          <ProfileMenu onSignOut={signOut} />
        </div>
        {/* Extra bottom padding so the floating support button never covers the last action on a page. */}
        <div className="max-w-7xl mx-auto p-6 md:p-10 pb-28 md:pb-28">{children}</div>
      </main>
      <ConfirmDialogHost />
      <PromptDialogHost />
      <CommandPalette />
    </div>
  );

}

function ProfileMenu({ onSignOut }: { onSignOut: () => void }) {
  const { data: access } = useAccess();
  const initial = access?.email ? access.email.charAt(0).toUpperCase() : "";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Account menu"
          className={`grid h-9 w-9 place-items-center rounded-full text-sm font-semibold text-white hover:opacity-95 transition ${initial ? "gradient-primary" : "bg-white/10 animate-pulse"}`}
        >
          {initial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">
          <div className="text-xs text-muted-foreground">Signed in as</div>
          <div className="truncate text-sm font-medium">{access?.email ?? "—"}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings"><Settings className="mr-2 h-4 w-4" /> Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/billing"><Wallet className="mr-2 h-4 w-4" /> Billing</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/invoices"><Receipt className="mr-2 h-4 w-4" /> Invoices</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={openCommandPalette}>
          <CommandIcon className="mr-2 h-4 w-4" /> Command palette
          <span className="ml-auto text-[10px] text-muted-foreground">{modKey()}+K</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut} className="text-rose-400 focus:text-rose-300">
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  // "Low" = under 25 credits or under 10% of the monthly allowance (one short reel ≈ 25).
  const low = total < Math.max(25, Math.ceil(access.monthlyLimit * 0.1));
  const empty = total <= 0;
  const title = `Balance: ${access.balance.toLocaleString()} · Monthly left: ${access.monthlyRemaining.toLocaleString()} · Lifetime: ${access.lifetimeCredits.toLocaleString()}`;

  // Out of / running low on credits: a highlighted "Buy credits" button that opens top-up packs.
  if (low) {
    return (
      <Link
        to="/billing"
        hash="topup"
        title={title}
        className={`relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-white gradient-primary shadow-[var(--shadow-glow)] transition hover:brightness-110 ${empty ? "ring-2 ring-rose-400/70" : ""}`}>
        <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
        </span>
        <Zap className="w-3.5 h-3.5" />
        {empty ? (
          <span>Out of credits · Buy credits</span>
        ) : (
          <span>
            {total.toLocaleString()} left<span className="hidden sm:inline"> · Buy credits</span>
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link
      to="/billing"
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-xs font-medium border transition hover:bg-white/10 border-[color:var(--neon-purple)]/40 text-foreground">
      <Zap className="w-3.5 h-3.5 text-[color:var(--neon-pink)]" />
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
  const tier = userTier(access);
  const planName = unlimited
    ? access.isAdmin ? "Admin" : "Unlimited Plan"
    : `${TIER_LABEL[tier]}${access.planType === "lifetime" ? " Lifetime" : access.planType === "yearly" ? " Yearly" : ""} Plan`;
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

/** "⌘" on Apple devices, "Ctrl" elsewhere. */
function modKey(): string {
  if (typeof navigator === "undefined") return "Ctrl";
  const p = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(p) ? "⌘" : "Ctrl";
}

/** Bell menu: replies from the team in support chat, payment problems. */
function NotificationsMenu() {
  const { data: access } = useAccess();
  const getChat = useServerFn(getSupportChat);
  const { data: chat } = useQuery({ queryKey: ["support-chat"], queryFn: () => getChat(), staleTime: 30_000, refetchInterval: 90_000 });
  const unread = (chat?.messages ?? []).filter((m) => !m.seen_by_user && m.role !== "user");
  const items: Array<{ id: string; title: string; body: string; action: () => void }> = unread.slice(-5).reverse().map((m) => ({
    id: m.id,
    title: m.role === "admin" ? "Reply from the CreatorFlow team" : "Support reply",
    body: m.text.length > 120 ? `${m.text.slice(0, 120)}…` : m.text,
    action: () => window.dispatchEvent(new CustomEvent("cf:open-support-chat")),
  }));
  const lowCredits = access && !access.unlimited && (access.monthlyRemaining + access.balance + access.lifetimeCredits) < 10;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label={items.length ? `Notifications (${items.length} new)` : "Notifications"}
          className="relative rounded-xl p-2 border border-border/60 bg-white/[0.03] hover:bg-white/[0.06] transition">
          <Bell className="w-4 h-4" />
          {(items.length > 0 || lowCredits) && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-background" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {lowCredits && (
          <DropdownMenuItem asChild>
            <Link to="/billing" className="flex flex-col items-start gap-0.5">
              <span className="text-sm font-medium">You're almost out of credits</span>
              <span className="text-xs text-muted-foreground">Top up or upgrade to keep generating.</span>
            </Link>
          </DropdownMenuItem>
        )}
        {items.map((n) => (
          <DropdownMenuItem key={n.id} onSelect={n.action} className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-medium">{n.title}</span>
            <span className="text-xs text-muted-foreground whitespace-normal">{n.body}</span>
          </DropdownMenuItem>
        ))}
        {!items.length && !lowCredits && (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">You're all caught up.</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
