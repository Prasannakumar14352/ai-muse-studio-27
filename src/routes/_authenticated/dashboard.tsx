import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/lib/access";
import {
  Plus, Video, Film, Image as ImageIcon, Type, Sparkles, TrendingUp, Layers,
  Crown, Users, Zap, Calendar, ArrowUpRight,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

function Dashboard() {
  const { data: access, isLoading: accessLoading } = useAccess();

  if (accessLoading || !access) {
    return <div className="space-y-4"><div className="glass rounded-2xl h-32 animate-pulse" /><div className="glass rounded-2xl h-48 animate-pulse" /></div>;
  }

  return access.isAdmin ? <AdminDashboard /> : <UserDashboard />;
}

/* -------------------- Admin -------------------- */

function AdminDashboard() {
  const { data: access } = useAccess();
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [{ count: users }, { count: projects }, { count: generations }] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("projects").select("*", { count: "exact", head: true }),
        supabase.from("usage_history").select("*", { count: "exact", head: true }),
      ]);
      return { users: users ?? 0, projects: projects ?? 0, generations: generations ?? 0 };
    },
  });

  const { data: recentUsers } = useQuery({
    queryKey: ["admin-recent-users"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, email, full_name, plan, created_at").order("created_at", { ascending: false }).limit(5);
      return data ?? [];
    },
  });

  const { data: recentProjects } = useQuery({
    queryKey: ["admin-recent-projects"],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id, title, content_type, created_at, user_id").order("created_at", { ascending: false }).limit(5);
      return data ?? [];
    },
  });

  const cards = [
    { label: "Total users", value: stats?.users ?? 0, icon: Users, hue: "from-fuchsia-500 to-purple-600" },
    { label: "Total projects", value: stats?.projects ?? 0, icon: Layers, hue: "from-pink-500 to-rose-600" },
    { label: "Generations logged", value: stats?.generations ?? 0, icon: Zap, hue: "from-indigo-500 to-purple-600" },
    { label: "Access", value: "Unlimited", icon: Crown, hue: "from-amber-400 to-orange-500" },
  ];

  return (
    <div className="space-y-8">
      <div className="glass rounded-2xl p-6 flex items-center gap-4 border-[color:var(--neon-purple)]/50 shadow-[var(--shadow-glow)]">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
          <Crown className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Admin</div>
          <h1 className="text-xl md:text-2xl font-bold truncate">Unlimited Admin Access</h1>
          <p className="text-xs text-muted-foreground truncate">{access?.email}</p>
        </div>
        <Link to="/admin" className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium flex items-center gap-2 shrink-0">
          Admin Panel <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="glass rounded-2xl p-5">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.hue} flex items-center justify-center mb-4`}>
              <c.icon className="w-5 h-5 text-white" />
            </div>
            <div className="text-2xl font-bold">{c.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="glass rounded-2xl p-5">
          <h3 className="font-semibold mb-3">Recent users</h3>
          <div className="space-y-2">
            {recentUsers?.length ? recentUsers.map((u: any) => (
              <div key={u.id} className="flex items-center justify-between text-sm py-2 border-b border-border/40 last:border-0">
                <div className="min-w-0">
                  <div className="truncate">{u.full_name || u.email}</div>
                  <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                </div>
                <span className="glass px-2 py-0.5 rounded text-xs">{u.plan}</span>
              </div>
            )) : <p className="text-sm text-muted-foreground">No users yet.</p>}
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <h3 className="font-semibold mb-3">Recent projects</h3>
          <div className="space-y-2">
            {recentProjects?.length ? recentProjects.map((p: any) => (
              <Link key={p.id} to="/projects/$id" params={{ id: p.id }}
                className="flex items-center justify-between text-sm py-2 border-b border-border/40 last:border-0 hover:text-[color:var(--neon-purple)]">
                <div className="truncate">{p.title}</div>
                <span className="glass px-2 py-0.5 rounded text-xs shrink-0 ml-2">{p.content_type}</span>
              </Link>
            )) : <p className="text-sm text-muted-foreground">No projects yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------- User (free + subscribed) -------------------- */

function UserDashboard() {
  const { data: access } = useAccess();
  const isSubscribed = !!access && access.plan !== "free";

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      const [{ count: total }, { count: videos }, { count: images }] = await Promise.all([
        supabase.from("projects").select("*", { count: "exact", head: true }),
        supabase.from("projects").select("*", { count: "exact", head: true }).in("content_type", ["long_video", "short_reel"]),
        supabase.from("assets").select("*", { count: "exact", head: true }).eq("asset_type", "image"),
      ]);
      return { total: total ?? 0, videos: videos ?? 0, images: images ?? 0 };
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["recent-projects"],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("*").order("created_at", { ascending: false }).limit(6);
      return data ?? [];
    },
  });

  const { data: usage } = useQuery({
    queryKey: ["usage-history"],
    queryFn: async () => {
      const { data } = await supabase.from("usage_history").select("*").order("created_at", { ascending: false }).limit(5);
      return data ?? [];
    },
  });

  const quicks = [
    { to: "/create", label: "Long Video", icon: Video },
    { to: "/create", label: "Short Reel", icon: Film },
    { to: "/images", label: "AI Image", icon: ImageIcon },
    { to: "/captions", label: "Captions", icon: Type },
  ];

  const availableCredits = access ? (access.unlimited ? "∞" : String(access.monthlyRemaining + access.balance)) : "—";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold">
          Welcome back <span className="gradient-text">✨</span>
        </h1>
        <p className="text-muted-foreground mt-1">Let's turn an idea into a full creator project.</p>
      </div>

      {/* Plan / credits card */}
      {isSubscribed ? (
        <div className="glass rounded-2xl p-6 flex flex-col md:flex-row md:items-center gap-4">
          <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
            <Crown className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Current plan</div>
            <div className="text-xl font-semibold capitalize">{access?.plan}</div>
            <div className="text-sm text-muted-foreground mt-1">
              {access?.monthlyRemaining} of {access?.monthlyLimit} credits remaining this month
              {access?.balance ? ` · ${access.balance} bonus balance` : ""}
            </div>
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Calendar className="w-4 h-4" /> {access?.renewsAt ? `Renews ${new Date(access.renewsAt).toLocaleDateString()}` : "Auto-renew off"}
          </div>
        </div>
      ) : (
        <div className="glass rounded-2xl p-6 flex flex-col md:flex-row md:items-center gap-4 border-[color:var(--neon-purple)]/40">
          <div className="flex-1">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Free plan</div>
            <div className="text-2xl font-bold">{availableCredits} <span className="text-sm font-normal text-muted-foreground">credits available</span></div>
            <p className="text-sm text-muted-foreground mt-1">Upgrade to get monthly credits and premium styles.</p>
          </div>
          <Link to="/pricing" className="rounded-lg gradient-primary text-white px-5 py-2.5 text-sm font-medium shrink-0">
            Upgrade plan
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Projects", value: stats?.total ?? 0, icon: Layers, hue: "from-fuchsia-500 to-purple-600" },
          { label: "Videos Generated", value: stats?.videos ?? 0, icon: Video, hue: "from-pink-500 to-rose-600" },
          { label: "Images Generated", value: stats?.images ?? 0, icon: ImageIcon, hue: "from-indigo-500 to-purple-600" },
          { label: "Plan", value: access?.plan ?? "free", icon: TrendingUp, hue: "from-emerald-400 to-teal-500" },
        ].map((c) => (
          <div key={c.label} className="glass rounded-2xl p-5">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.hue} flex items-center justify-center mb-4`}>
              <c.icon className="w-5 h-5 text-white" />
            </div>
            <div className="text-2xl font-bold capitalize">{c.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Quick generate</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quicks.map((q) => (
            <Link key={q.label} to={q.to}
              className="glass rounded-xl p-5 hover:border-white/20 transition group flex flex-col items-start gap-3">
              <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center group-hover:scale-110 transition">
                <q.icon className="w-5 h-5 text-white" />
              </div>
              <div className="text-sm font-medium">{q.label}</div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Recent projects</h2>
            <Link to="/projects" className="text-sm text-[color:var(--neon-purple)] hover:underline">View all →</Link>
          </div>
          {recent && recent.length > 0 ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {recent.map((p) => (
                <Link key={p.id} to="/projects/$id" params={{ id: p.id }} className="glass rounded-xl p-5 hover:border-white/20 transition block">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">{p.content_type ?? "project"}</div>
                  <div className="mt-2 font-semibold line-clamp-2">{p.title}</div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="glass rounded-2xl p-10 text-center">
              <Sparkles className="w-10 h-10 mx-auto text-[color:var(--neon-purple)]" />
              <h3 className="mt-3 font-semibold">Your vault is empty</h3>
              <p className="text-sm text-muted-foreground mt-1">Create your first AI project.</p>
              <Link to="/create" className="mt-5 inline-flex rounded-lg gradient-primary px-5 py-2.5 text-sm text-white font-medium">
                <Plus className="w-4 h-4 mr-2" /> New project
              </Link>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">Usage history</h2>
          <div className="glass rounded-2xl p-4 space-y-2">
            {usage?.length ? usage.map((u: any) => (
              <div key={u.id} className="text-sm py-2 border-b border-border/40 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="truncate">{u.description ?? "Generation"}</span>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">−{u.credits_used}</span>
                </div>
                <div className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()} · {u.source}</div>
              </div>
            )) : <p className="text-sm text-muted-foreground p-2">No usage yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
