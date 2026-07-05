import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PLATFORMS, TONES, STYLES } from "@/lib/constants";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  const { data: profile, refetch } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      return data;
    },
  });

  const [form, setForm] = useState({ full_name: "", brand_name: "", default_platform: "", default_tone: "", default_style: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name ?? "",
        brand_name: profile.brand_name ?? "",
        default_platform: profile.default_platform ?? "",
        default_tone: profile.default_tone ?? "",
        default_style: profile.default_style ?? "",
      });
    }
  }, [profile]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("profiles").update(form).eq("id", u.user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Settings saved"); refetch(); }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Personalize your defaults across the platform.</p>
      </div>

      <form onSubmit={save} className="glass rounded-2xl p-6 space-y-5">
        <div>
          <label className="text-sm font-medium">Full name</label>
          <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            className="mt-1 w-full bg-input/50 border border-border rounded-lg px-4 py-2.5 focus:outline-none focus:border-[color:var(--neon-purple)]" />
        </div>
        <div>
          <label className="text-sm font-medium">Brand name</label>
          <input value={form.brand_name} onChange={(e) => setForm({ ...form, brand_name: e.target.value })}
            placeholder="Your creator / brand identity"
            className="mt-1 w-full bg-input/50 border border-border rounded-lg px-4 py-2.5 focus:outline-none focus:border-[color:var(--neon-purple)]" />
        </div>
        <div>
          <label className="text-sm font-medium">Default platform</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <button type="button" key={p.id} onClick={() => setForm({ ...form, default_platform: p.id })}
                className={`px-3 py-1.5 rounded-full text-xs border ${form.default_platform === p.id ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>{p.label}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Default tone</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {TONES.map((t) => (
              <button type="button" key={t} onClick={() => setForm({ ...form, default_tone: t })}
                className={`px-3 py-1.5 rounded-full text-xs border ${form.default_tone === t ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>{t}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Default style</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {STYLES.map((s) => (
              <button type="button" key={s.id} onClick={() => setForm({ ...form, default_style: s.id })}
                className={`px-3 py-1.5 rounded-full text-xs border ${form.default_style === s.id ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>{s.label}</button>
            ))}
          </div>
        </div>

        <button disabled={saving} className="rounded-lg gradient-primary text-white px-6 py-2.5 text-sm font-medium flex items-center gap-2 shadow-[var(--shadow-glow)]">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save changes
        </button>
      </form>

      <div className="glass rounded-2xl p-6">
        <h2 className="font-semibold">Account</h2>
        <p className="text-sm text-muted-foreground mt-1">Signed in as <span className="text-foreground">{profile?.email}</span></p>
        <p className="text-sm text-muted-foreground mt-1">Plan: <span className="text-foreground capitalize">{profile?.plan ?? "free"}</span></p>
      </div>
    </div>
  );
}
