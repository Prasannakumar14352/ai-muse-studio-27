import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus, Video, Film, Image as ImageIcon, Type, Sparkles, TrendingUp, Layers,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });

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

  const quicks = [
    { to: "/create", label: "Long Video", icon: Video, params: { type: "long_video" } },
    { to: "/create", label: "Short Reel", icon: Film, params: { type: "short_reel" } },
    { to: "/images", label: "AI Image", icon: ImageIcon },
    { to: "/captions", label: "Captions", icon: Type },
  ];

  const cards = [
    { label: "Total Projects", value: stats?.total ?? 0, icon: Layers, hue: "from-fuchsia-500 to-purple-600" },
    { label: "Videos Generated", value: stats?.videos ?? 0, icon: Video, hue: "from-pink-500 to-rose-600" },
    { label: "Images Generated", value: stats?.images ?? 0, icon: ImageIcon, hue: "from-indigo-500 to-purple-600" },
    { label: "Plan", value: "Free", icon: TrendingUp, hue: "from-emerald-400 to-teal-500" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold">
          Welcome back{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name.split(" ")[0]}` : ""} <span className="gradient-text">✨</span>
        </h1>
        <p className="text-muted-foreground mt-1">Let's turn an idea into a full creator project.</p>
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

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Recent projects</h2>
          <Link to="/projects" className="text-sm text-[color:var(--neon-purple)] hover:underline">View all →</Link>
        </div>
        {recent && recent.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recent.map((p) => (
              <Link key={p.id} to="/projects/$id" params={{ id: p.id }} className="glass rounded-xl p-5 hover:border-white/20 transition block">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">{p.content_type ?? "project"}</div>
                <div className="mt-2 font-semibold line-clamp-2">{p.title}</div>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  {p.style && <span className="glass px-2 py-0.5 rounded">{p.style}</span>}
                  {p.platform && <span className="glass px-2 py-0.5 rounded">{p.platform}</span>}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="glass rounded-2xl p-12 text-center">
            <Sparkles className="w-10 h-10 mx-auto text-[color:var(--neon-purple)]" />
            <h3 className="mt-3 font-semibold">Your vault is empty</h3>
            <p className="text-sm text-muted-foreground mt-1">Create your first AI project — it takes 20 seconds.</p>
            <Link to="/create" className="mt-5 inline-flex rounded-lg gradient-primary px-5 py-2.5 text-sm text-white font-medium">
              <Plus className="w-4 h-4 mr-2" /> New project
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
