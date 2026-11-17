import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/lib/access";
import { useProjectDelete } from "@/hooks/use-project-delete";
import { getDefaultBrandKitFn } from "@/lib/brand-kit.functions";
import { openCommandPalette } from "@/components/command-palette";

import {
  Plus, Video, Film, Image as ImageIcon, Type, Sparkles, Layers, Megaphone,
  Linkedin, Crown, Zap, Calendar as CalendarIcon, ArrowUpRight, Trash2,
  Palette as PaletteIcon, TrendingUp, Search, Bot, Command as CommandIcon,
  CheckCircle2, AlertCircle,
} from "lucide-react";
import { isHiddenPath } from "@/lib/hidden-features";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

const QUICK_ACTIONS = [
  { to: "/videos", label: "Long Video", desc: "YouTube-length", icon: Video, hue: "from-pink-500 to-rose-600" },
  { to: "/videos", label: "Short / Reel", desc: "9:16 vertical", icon: Film, hue: "from-fuchsia-500 to-purple-600" },
  { to: "/promo-videos", label: "Promo Video", desc: "Ads & launches", icon: Megaphone, hue: "from-amber-400 to-orange-500" },
  { to: "/carousels", label: "Carousel", desc: "Slides deck", icon: Layers, hue: "from-indigo-500 to-purple-600" },
  { to: "/images", label: "AI Image", desc: "Batch + edit", icon: ImageIcon, hue: "from-emerald-400 to-teal-500" },
  { to: "/thumbnails", label: "Thumbnail", desc: "CTR-optimized", icon: Sparkles, hue: "from-orange-400 to-pink-500" },
  { to: "/linkedin-posts", label: "LinkedIn Post", desc: "Content studio", icon: Linkedin, hue: "from-sky-500 to-indigo-600" },
  { to: "/captions", label: "Captions", desc: "Hooks & hashtags", icon: Type, hue: "from-violet-500 to-fuchsia-500" },
];

function Dashboard() {
  const { data: access, isLoading } = useAccess();
  const { data: brandKit } = useQuery({
    queryKey: ["default-brand-kit"],
    queryFn: () => getDefaultBrandKitFn(),
  });

  const { data: recent } = useQuery({
    queryKey: ["dashboard-recent-projects"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, title, content_type, updated_at, created_at")
        .order("updated_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  const { data: usage } = useQuery({
    queryKey: ["dashboard-usage"],
    queryFn: async () => {
      const { data } = await supabase
        .from("usage_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(6);
      return data ?? [];
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["dashboard-counts"],
    queryFn: async () => {
      const [{ count: projects }, { count: assets }, { count: scheduled }] = await Promise.all([
        supabase.from("projects").select("*", { count: "exact", head: true }),
        supabase.from("asset_library").select("*", { count: "exact", head: true }),
        supabase.from("scheduled_posts").select("*", { count: "exact", head: true }).eq("status", "scheduled"),
      ]);
      return { projects: projects ?? 0, assets: assets ?? 0, scheduled: scheduled ?? 0 };
    },
  });

  if (isLoading || !access) {
    return (
      <div className="space-y-4">
        <div className="glass rounded-2xl h-32 animate-pulse" />
        <div className="glass rounded-2xl h-48 animate-pulse" />
      </div>
    );
  }

  const firstName = (access.email ?? "").split("@")[0].split(/[._-]/)[0];
  const greeting = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : "creator";
  const monthlyLeft = access.unlimited ? Infinity : access.monthlyRemaining;
  const monthlyLimit = access.unlimited ? Infinity : access.monthlyLimit;
  const pct = access.unlimited || monthlyLimit === 0 ? 100 : Math.round((monthlyLeft / monthlyLimit) * 100);

  return (
    <div className="space-y-8">
      {/* Hero / Welcome */}
      <div className="glass rounded-3xl p-6 md:p-8 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-gradient-to-br from-[color:var(--brand-orange)]/20 to-[color:var(--neon-pink)]/20 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Welcome back</div>
            <h1 className="mt-1 text-3xl md:text-4xl font-bold">
              Hey {greeting} <span className="gradient-text">✨</span>
            </h1>
            <p className="text-muted-foreground mt-2 max-w-xl">
              Your AI Content OS. Plan, research, generate, edit, and publish — all from one workspace.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={openCommandPalette}
              className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-white/[0.04] hover:bg-white/[0.08] px-3 py-2 text-sm transition"
            >
              <CommandIcon className="w-4 h-4" /> Command palette
              <span className="ml-1 rounded border border-border/60 bg-white/[0.04] px-1.5 py-0.5 text-[10px]">⌘K</span>
            </button>
            <Link
              to="/create"
              className="inline-flex items-center gap-2 rounded-xl gradient-primary text-white px-4 py-2 text-sm font-medium shadow-[var(--shadow-glow)]"
            >
              <Plus className="w-4 h-4" /> New project
            </Link>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Quick actions</h2>
          <Link to="/create" className="text-sm text-[color:var(--neon-purple)] hover:underline">See all →</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {QUICK_ACTIONS.filter((q) => !isHiddenPath(q.to)).map((q) => (
            <Link
              key={q.label}
              to={q.to}
              className="glass rounded-2xl p-4 hover:border-white/20 transition group"
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${q.hue} flex items-center justify-center mb-3 group-hover:scale-110 transition`}>
                <q.icon className="w-5 h-5 text-white" />
              </div>
              <div className="text-sm font-medium">{q.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{q.desc}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Overview grid */}
      <section className="grid lg:grid-cols-3 gap-5">
        {/* Credits */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Credits</div>
            {access.unlimited ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
                <Crown className="w-3 h-3" /> Unlimited
              </span>
            ) : (
              <Link to="/pricing" className="text-xs text-[color:var(--neon-pink)] hover:underline">Upgrade</Link>
            )}
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <div className="text-3xl font-bold">
              {access.unlimited ? "∞" : monthlyLeft.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">
              of {access.unlimited ? "∞" : monthlyLimit.toLocaleString()} monthly
            </div>
          </div>
          {!access.unlimited && (
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full gradient-primary transition-[width]"
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
          )}
          {access.balance > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">+ {access.balance.toLocaleString()} bonus balance</div>
          )}
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarIcon className="w-3.5 h-3.5" />
            {access.renewsAt ? `Renews ${new Date(access.renewsAt).toLocaleDateString()}` : "Auto-renew off"}
          </div>
        </div>

        {/* Brand status */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Brand Kit</div>
            <Link to="/brand-kit" className="text-xs text-[color:var(--neon-pink)] hover:underline">Manage</Link>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl border border-border/60 grid place-items-center overflow-hidden"
              style={{ background: brandKit?.primary_color ?? "rgba(255,255,255,0.04)" }}
            >
              {brandKit?.logo_url ? (
                <img src={brandKit.logo_url} alt="" className="w-full h-full object-contain" />
              ) : (
                <PaletteIcon className="w-5 h-5 text-white/80" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{brandKit?.name ?? "No default brand kit"}</div>
              <div className="text-xs text-muted-foreground truncate">
                {brandKit ? "Auto-applied to new generations" : "Set a default to auto-apply"}
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-[10px]">
            <BrandCheck ok={!!brandKit?.logo_url} label="Logo" />
            <BrandCheck ok={!!brandKit?.primary_color} label="Colors" />
            <BrandCheck ok={!!brandKit?.brand_voice} label="Voice" />
          </div>
        </div>

        {/* Workspace stats */}
        <div className="glass rounded-2xl p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Workspace</div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <StatMini label="Projects" value={counts?.projects ?? 0} to="/videos" />
            <StatMini label="Assets" value={counts?.assets ?? 0} to="/library" />
            <StatMini label="Scheduled" value={counts?.scheduled ?? 0} to="/calendar" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link to="/research" className="glass rounded-xl p-2.5 text-xs flex items-center gap-2 hover:border-white/20 transition">
              <Search className="w-3.5 h-3.5 text-[color:var(--neon-pink)]" /> Research
            </Link>
            {!isHiddenPath("/agents") && (
              <Link to="/agents" className="glass rounded-xl p-2.5 text-xs flex items-center gap-2 hover:border-white/20 transition">
                <Bot className="w-3.5 h-3.5 text-[color:var(--neon-purple)]" /> AI Agents
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Continue working + recent generations */}
      <section className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Continue working</h2>
            <Link to="/videos" className="text-sm text-[color:var(--neon-purple)] hover:underline">All projects →</Link>
          </div>
          {recent && recent.length > 0 ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {recent.slice(0, 6).map((p) => (
                <RecentProjectCard key={p.id} project={p} />
              ))}
            </div>
          ) : (
            <EmptyProjects />
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">Recent activity</h2>
          <div className="glass rounded-2xl p-2">
            {usage?.length ? usage.map((u: { id: string; description: string | null; credits_used: number; created_at: string; source: string | null }) => (
              <div key={u.id} className="text-sm p-3 border-b border-border/40 last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{u.description ?? "Generation"}</span>
                  <span className="text-xs text-rose-300 shrink-0 inline-flex items-center gap-1">
                    <Zap className="w-3 h-3" />−{u.credits_used}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {new Date(u.created_at).toLocaleDateString()} · {u.source ?? "system"}
                </div>
              </div>
            )) : (
              <div className="p-6 text-center">
                <TrendingUp className="w-8 h-8 mx-auto text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground mt-2">No activity yet.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function BrandCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1 rounded-lg border px-2 py-1 ${
      ok ? "border-emerald-500/40 bg-emerald-500/[0.08] text-emerald-200" : "border-border/60 bg-white/[0.03] text-muted-foreground"
    }`}>
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
      <span>{label}</span>
    </div>
  );
}

function StatMini({ label, value, to }: { label: string; value: number; to: string }) {
  return (
    <Link to={to} className="glass rounded-xl p-3 hover:border-white/20 transition block group">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-0.5">
        {label} <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition" />
      </div>
    </Link>
  );
}

function EmptyProjects() {
  return (
    <div className="glass rounded-2xl p-10 text-center">
      <Sparkles className="w-10 h-10 mx-auto text-[color:var(--neon-purple)]" />
      <h3 className="mt-3 font-semibold">Your vault is empty</h3>
      <p className="text-sm text-muted-foreground mt-1">Create your first AI project.</p>
      <Link to="/create" className="mt-5 inline-flex rounded-lg gradient-primary px-5 py-2.5 text-sm text-white font-medium">
        <Plus className="w-4 h-4 mr-2" /> New project
      </Link>
    </div>
  );
}

function RecentProjectCard({ project }: { project: { id: string; title: string; content_type: string | null; updated_at?: string | null } }) {
  const deleteProject = useProjectDelete();
  async function del(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await deleteProject({ id: project.id, title: project.title });
  }
  const when = project.updated_at ? new Date(project.updated_at).toLocaleDateString() : null;
  return (
    <div className="relative group">
      <button
        type="button"
        onClick={del}
        aria-label="Delete project"
        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition rounded-lg bg-black/70 hover:bg-rose-600 text-white p-1.5"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      <Link to="/projects/$id" params={{ id: project.id }} className="glass rounded-xl p-5 hover:border-white/20 transition block">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{project.content_type ?? "project"}</div>
          {when && <div className="text-[10px] text-muted-foreground">{when}</div>}
        </div>
        <div className="mt-2 font-semibold line-clamp-2">{project.title}</div>
      </Link>
    </div>
  );
}
