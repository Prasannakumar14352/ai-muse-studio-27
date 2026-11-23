import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAccess, getAvailableCredits } from "@/lib/access";
import { useProjectDelete } from "@/hooks/use-project-delete";
import { getDefaultBrandKitFn } from "@/lib/brand-kit.functions";
import { listMyConnections } from "@/lib/oauth-user.functions";
import { ProjectThumbnail } from "@/components/project-thumbnail";
import { PROJECT_STATUS_BADGE, PROJECT_TYPE_LABEL } from "@/lib/project-status";
import { OfferCard } from "@/components/offer-code";
import { openCreateMenu } from "@/components/create-menu";
import { isHiddenPath, CONNECTIONS_PATH } from "@/lib/hidden-features";
import { useSocialPublishingAvailable } from "@/lib/use-social-publishing";
import { usePlanAccess, useUpgradeDialog } from "@/lib/use-plan-access";
import { TIER_LABEL } from "@/lib/plan-access";
import {
  ArrowRight, Calendar as CalendarIcon, Check, Crown, FileText, Layers, Lightbulb, Lock, Megaphone,
  Palette as PaletteIcon, Plus, Sparkles, Target, Trash2, TrendingUp, Zap,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

const QUICK_ACTIONS = [
  { to: "/videos", search: { new: "script" as const }, gate: "/videos", label: "Script → Video", desc: "Paste your script, keep every word", icon: FileText, tone: "bg-orange-500/15 text-orange-400" },
  { to: "/videos", search: { new: "idea" as const }, gate: "/videos", label: "Idea → Video", desc: "One idea in, full video out", icon: Lightbulb, tone: "bg-orange-500/15 text-orange-400" },
  { to: "/promo-videos", gate: "/promo-videos", label: "Business Promo", desc: "Promo video with your real product", icon: Megaphone, tone: "bg-pink-500/15 text-pink-400" },
  { to: "/ad-creatives", gate: "/ad-creatives", label: "Ad Creative", desc: "Ready-to-post Meta ads", icon: Target, tone: "bg-pink-500/15 text-pink-400" },
  { to: "/carousels", gate: "/carousels", label: "Carousel", desc: "Swipeable slides with your brand", icon: Layers, tone: "bg-sky-500/15 text-sky-400" },
  { to: "/thumbnails", gate: "/thumbnails", label: "Thumbnail", desc: "High-CTR YouTube covers", icon: Sparkles, tone: "bg-sky-500/15 text-sky-400" },
];

const STATUS = PROJECT_STATUS_BADGE;

const TYPE_LABEL = PROJECT_TYPE_LABEL;

const PORTRAIT = new Set(["short_reel", "ugc", "talking_object"]);

type RecentProject = {
  id: string; title: string; content_type: string | null; status: string | null; updated_at: string | null;
  style: string | null; platform: string | null; thumbnail_url: string | null; cover_image_url: string | null; poster_url: string | null;
};

function timeGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Dashboard() {
  const { data: access, isLoading } = useAccess();
  const userId = access?.userId;
  const socialAvailable = useSocialPublishingAvailable();
  const myConns = useServerFn(listMyConnections);
  const showConnect = !isHiddenPath(CONNECTIONS_PATH) && (socialAvailable || !!access?.isAdmin);

  const { data: brandKit } = useQuery({ queryKey: ["default-brand-kit"], queryFn: () => getDefaultBrandKitFn() });

  const { data: recent } = useQuery({
    queryKey: ["dashboard-recent-projects", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, title, content_type, status, updated_at, style, platform, thumbnail_url, cover_image_url, poster_url")
        .eq("user_id", userId!)
        .order("updated_at", { ascending: false })
        .limit(5);
      return (data ?? []) as RecentProject[];
    },
  });

  const { data: usage } = useQuery({
    queryKey: ["dashboard-usage", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("usage_history")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["dashboard-counts", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [{ count: projects }, { count: scheduled }] = await Promise.all([
        supabase.from("projects").select("*", { count: "exact", head: true }).eq("user_id", userId!),
        supabase.from("scheduled_posts").select("*", { count: "exact", head: true }).eq("user_id", userId!),
      ]);
      return { projects: projects ?? 0, scheduled: scheduled ?? 0 };
    },
  });

  const { data: connections } = useQuery({
    queryKey: ["platform_connections"],
    enabled: showConnect,
    queryFn: () => myConns(),
  });

  if (isLoading || !access) {
    return (
      <div className="space-y-4">
        <div className="glass rounded-2xl h-24 animate-pulse" />
        <div className="glass rounded-2xl h-40 animate-pulse" />
        <div className="glass rounded-2xl h-56 animate-pulse" />
      </div>
    );
  }

  const firstName = (access.email ?? "").split("@")[0].split(/[._-]/)[0];
  const name = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : "creator";
  const latest = recent?.[0];
  const others = (recent ?? []).slice(1, 5);
  const latestStatus = latest ? STATUS[latest.status ?? ""] : undefined;

  const steps = [
    { label: "Create your account", done: true, to: undefined },
    { label: "Make your first project", done: (counts?.projects ?? 0) > 0, to: "/videos" },
    { label: "Set up your Brand Kit", done: !!brandKit, to: "/brand-kit" },
    ...(showConnect ? [{ label: "Connect a channel", done: (connections?.length ?? 0) > 0, to: "/connections" }] : []),
    ...(!isHiddenPath("/calendar") ? [{ label: "Schedule your first post", done: (counts?.scheduled ?? 0) > 0, to: "/calendar" }] : []),
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  return (
    <div className="space-y-7">
      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl md:text-4xl font-bold">{timeGreeting()}, {name} 👋</h1>
          <p className="text-muted-foreground mt-1.5">
            {latest
              ? <>Pick up where you left off — <span className="text-foreground">{latest.title}</span>.</>
              : "Let's make your first video. It takes about 3 minutes."}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateMenu}
          className="inline-flex items-center gap-2 self-start sm:self-auto rounded-xl gradient-primary text-white px-4 py-2.5 text-sm font-semibold shadow-[var(--shadow-glow)] hover:brightness-110 transition"
        >
          <Plus className="w-4 h-4" /> Create
        </button>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        {/* Left column */}
        <div className="space-y-7 min-w-0">
          {latest ? (
            <Link
              to="/projects/$id"
              params={{ id: latest.id }}
              className="glass rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-primary/50 transition group"
            >
              <div className="w-24 sm:w-28 shrink-0 overflow-hidden rounded-xl">
                <ProjectThumbnail
                  title={latest.title}
                  contentType={latest.content_type}
                  style={latest.style}
                  platform={latest.platform}
                  thumbnailUrl={latest.thumbnail_url ?? latest.cover_image_url ?? latest.poster_url}
                  status={latest.status}
                  aspect={PORTRAIT.has(latest.content_type ?? "") ? "portrait" : "landscape"}
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">Continue</div>
                {latestStatus && (
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${latestStatus.cls}`}>● {latestStatus.label}</span>
                )}
                <div className="text-lg font-semibold line-clamp-2">{latest.title}</div>
                <div className="text-xs text-muted-foreground">
                  {TYPE_LABEL[latest.content_type ?? ""] ?? "Project"}
                  {latest.updated_at ? ` · updated ${new Date(latest.updated_at).toLocaleDateString()}` : ""}
                </div>
              </div>
              <span className="inline-flex items-center justify-center gap-1.5 rounded-xl gradient-primary text-white px-4 py-2.5 text-sm font-semibold shadow-[var(--shadow-glow)] group-hover:brightness-110">
                Open <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
          ) : (
            <div className="glass rounded-2xl p-8 text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary/15">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <h2 className="mt-4 text-xl font-bold">No projects yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">Paste a script or type one idea — your first video takes about 3 minutes.</p>
              <Link
                to="/videos"
                search={{ new: "idea" }}
                className="mt-5 inline-flex items-center gap-2 rounded-xl gradient-primary px-5 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)]"
              >
                <Plus className="w-4 h-4" /> Create my first video
              </Link>
            </div>
          )}

          <section>
            <h2 className="text-lg font-semibold mb-3">Create something</h2>
            <QuickActions />
          </section>

          {others.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Recent projects</h2>
                <Link to="/videos" className="text-sm font-medium text-primary hover:underline">View all →</Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {others.map((p) => <RecentProjectCard key={p.id} project={p} />)}
              </div>
            </section>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {!allDone && (
            <div className="glass rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Getting started</div>
                <div className="text-sm font-semibold text-primary">{doneCount} / {steps.length}</div>
              </div>
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className="h-full gradient-primary rounded-full" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
              </div>
              <ul className="space-y-1">
                {steps.map((s) => {
                  const row = (
                    <>
                      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${s.done ? "bg-emerald-500 text-white" : "border-2 border-border"}`}>
                        {s.done && <Check className="h-3 w-3" />}
                      </span>
                      <span className={`flex-1 text-sm ${s.done ? "text-muted-foreground line-through decoration-muted-foreground/40" : ""}`}>{s.label}</span>
                      {!s.done && s.to && <ArrowRight className="h-3.5 w-3.5 text-primary" />}
                    </>
                  );
                  return (
                    <li key={s.label}>
                      {!s.done && s.to ? (
                        <Link to={s.to} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-white/[0.04] transition">{row}</Link>
                      ) : (
                        <div className="flex items-center gap-2.5 px-1.5 py-1.5">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <OfferCard />

          <CreditsCard />

          <Link to="/brand-kit" className="glass rounded-2xl p-5 flex items-center gap-3 hover:border-primary/50 transition">
            <div
              className="w-12 h-12 rounded-xl border border-border grid place-items-center overflow-hidden shrink-0"
              style={{ background: brandKit?.primary_color ?? "var(--surface-raised)" }}
            >
              {brandKit?.logo_url ? (
                <img src={brandKit.logo_url} alt="" className="w-full h-full object-contain" />
              ) : (
                <PaletteIcon className="w-5 h-5 text-white/80" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate">{brandKit?.name ?? "Set up your Brand Kit"}</div>
              <div className="text-xs text-muted-foreground truncate">
                {brandKit ? "Used automatically in new creations" : "Logo, colours and tone — used everywhere"}
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </Link>

          <div className="glass rounded-2xl p-5">
            <div className="font-semibold mb-2">Recent activity</div>
            {usage?.length ? (
              <ul className="divide-y divide-border">
                {usage.map((u: { id: string; description: string | null; credits_used: number; created_at: string }) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="truncate">{u.description ?? "Generation"}</div>
                      <div className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</div>
                    </div>
                    <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-rose-400">
                      <Zap className="w-3 h-3" />−{u.credits_used}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-6 text-center">
                <TrendingUp className="w-7 h-7 mx-auto text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground mt-2">No activity yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickActions() {
  const { canPath } = usePlanAccess();
  const openUpgrade = useUpgradeDialog();
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {QUICK_ACTIONS.filter((q) => !isHiddenPath(q.gate)).map((q) => {
        const lock = canPath(q.gate);
        return (
          <Link
            key={q.label}
            to={q.to}
            search={"search" in q ? q.search : undefined}
            onClick={(e) => {
              if (!lock.allowed) {
                e.preventDefault();
                openUpgrade({ label: q.label, required: lock.required });
              }
            }}
            className="glass relative rounded-2xl p-4 flex flex-col gap-2 hover:border-primary/50 hover:-translate-y-0.5 transition"
          >
            <span className={`grid h-10 w-10 place-items-center rounded-xl ${q.tone}`}>
              <q.icon className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold">{q.label}</span>
            <span className="text-xs text-muted-foreground leading-snug">{q.desc}</span>
            {!lock.allowed && (
              <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                <Lock className="h-3 w-3" /> {TIER_LABEL[lock.required]}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

function CreditsCard() {
  const { data: access } = useAccess();
  if (!access) return null;
  if (access.unlimited) {
    return (
      <div className="glass rounded-2xl p-5 flex items-center gap-3">
        <Crown className="w-5 h-5 text-amber-400" />
        <div className="text-sm"><span className="font-semibold">Unlimited credits</span> <span className="text-muted-foreground">— create freely.</span></div>
      </div>
    );
  }
  const total = getAvailableCredits(access);
  const limit = Math.max(access.monthlyLimit, 1);
  const pct = Math.max(2, Math.min(100, Math.round((access.monthlyRemaining / limit) * 100)));
  return (
    <div className="glass rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Credits</div>
        <Link to="/pricing" className="text-xs font-semibold text-primary hover:underline">Upgrade</Link>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold [font-family:'Space_Grotesk',Inter,sans-serif]">{total.toLocaleString()}</span>
        <span className="text-xs text-muted-foreground">credits to use</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className="h-full gradient-primary rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5">
        <div>{access.monthlyRemaining.toLocaleString()} of {access.monthlyLimit.toLocaleString()} monthly left{access.balance > 0 ? ` · + ${access.balance.toLocaleString()} top-up` : ""}</div>
        <div className="flex items-center gap-1.5">
          <CalendarIcon className="w-3 h-3" />
          {access.renewsAt ? `Renews ${new Date(access.renewsAt).toLocaleDateString()}` : "Auto-renew off"}
        </div>
      </div>
      <Link to="/billing" className="block text-center rounded-xl border border-border bg-secondary py-2 text-sm font-semibold hover:bg-accent transition">
        Top up credits
      </Link>
    </div>
  );
}

function RecentProjectCard({ project }: { project: RecentProject }) {
  const deleteProject = useProjectDelete();
  async function del(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await deleteProject({ id: project.id, title: project.title });
  }
  const st = STATUS[project.status ?? ""];
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
      <Link to="/projects/$id" params={{ id: project.id }} className="glass rounded-2xl overflow-hidden block hover:border-primary/50 transition">
        <ProjectThumbnail
          title={project.title}
          contentType={project.content_type}
          style={project.style}
          platform={project.platform}
          thumbnailUrl={project.thumbnail_url ?? project.cover_image_url ?? project.poster_url}
          status={project.status}
          aspect="landscape"
        />
        <div className="p-3 space-y-1">
          <div className="text-sm font-semibold line-clamp-1">{project.title}</div>
          <div className="text-[11px] text-muted-foreground">
            {st ? st.short : TYPE_LABEL[project.content_type ?? ""] ?? "Project"}
          </div>
        </div>
      </Link>
    </div>
  );
}
