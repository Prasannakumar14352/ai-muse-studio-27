import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PLATFORMS, TONES, STYLES } from "@/lib/constants";
import { Loader2, Download, Upload, Trash2, AlertTriangle } from "lucide-react";
import { exportAll, importAll, clearAll, type LocalExportBundle } from "@/lib/local-store";
import JSZip from "jszip";

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

      <DataAndCacheCard />

      <div className="glass rounded-2xl p-6">
        <h2 className="font-semibold">Account</h2>
        <p className="text-sm text-muted-foreground mt-1">Signed in as <span className="text-foreground">{profile?.email}</span></p>
        <p className="text-sm text-muted-foreground mt-1">Plan: <span className="text-foreground capitalize">{profile?.plan ?? "free"}</span></p>
      </div>
    </div>
  );
}

function DataAndCacheCard() {
  const [busy, setBusy] = useState<null | "export-json" | "export-zip" | "import" | "clear">(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function doExportJson() {
    setBusy("export-json");
    try {
      const bundle = await exportAll();
      download(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }),
        `creatorflow-export-${Date.now()}.json`);
      toast.success(`Exported ${bundle.outputs.length} projects · ${bundle.image_gens.length} logs`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Export failed"); }
    finally { setBusy(null); }
  }

  async function doExportZip() {
    setBusy("export-zip");
    try {
      const bundle = await exportAll();
      const zip = new JSZip();
      zip.file("bundle.json", JSON.stringify(bundle, null, 2));
      // Also break out per-project script/captions/images.
      for (const o of bundle.outputs) {
        const folder = zip.folder(`projects/${slug(o.title || o.project_id)}`);
        if (!folder) continue;
        folder.file("script.txt", o.script || "");
        folder.file("captions.txt", o.captions || "");
        folder.file("hashtags.txt", (o.hashtags ?? []).join(" "));
        folder.file("meta.json", JSON.stringify({
          id: o.project_id, title: o.title, aspect_ratio: o.aspect_ratio,
          slide_count: o.slide_count, updated_at: o.updated_at,
        }, null, 2));
        if (o.render_diagnostics) folder.file("diagnostics.json", JSON.stringify(o.render_diagnostics, null, 2));
        (o.carousel_images ?? []).forEach((src, i) => {
          if (!src) return;
          const b64 = src.replace(/^data:image\/\w+;base64,/, "");
          folder.file(`slide-${String(i + 1).padStart(2, "0")}.png`, b64, { base64: true });
        });
      }
      const blob = await zip.generateAsync({ type: "blob" });
      download(blob, `creatorflow-export-${Date.now()}.zip`);
      toast.success("ZIP exported");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Export failed"); }
    finally { setBusy(null); }
  }

  async function doImport(file: File) {
    setBusy("import");
    try {
      const text = await file.text();
      const bundle = JSON.parse(text) as LocalExportBundle;
      const res = await importAll(bundle);
      toast.success(`Imported ${res.outputs} projects · ${res.logs} logs`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Import failed"); }
    finally { setBusy(null); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function doClear() {
    setBusy("clear");
    try {
      await clearAll();
      toast.success("Local cache cleared");
      setConfirmClear(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Clear failed"); }
    finally { setBusy(null); }
  }

  return (
    <div className="glass rounded-2xl p-6 space-y-4">
      <div>
        <h2 className="font-semibold">Data & local cache</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Generations live in <span className="text-foreground">this browser only</span>. Export a bundle to move them
          to another device, then import here.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button disabled={!!busy} onClick={doExportJson}
          className="rounded-lg glass border border-border px-3 py-2 text-sm flex items-center gap-2 disabled:opacity-50">
          {busy === "export-json" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Export JSON
        </button>
        <button disabled={!!busy} onClick={doExportZip}
          className="rounded-lg glass border border-border px-3 py-2 text-sm flex items-center gap-2 disabled:opacity-50">
          {busy === "export-zip" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Export ZIP
        </button>
        <button disabled={!!busy} onClick={() => fileRef.current?.click()}
          className="rounded-lg glass border border-border px-3 py-2 text-sm flex items-center gap-2 disabled:opacity-50">
          {busy === "import" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Import JSON
        </button>
        <input ref={fileRef} type="file" accept="application/json" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); }} />
        <button disabled={!!busy} onClick={() => setConfirmClear(true)}
          className="rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-200 px-3 py-2 text-sm flex items-center gap-2 disabled:opacity-50">
          <Trash2 className="w-4 h-4" /> Clear local cache
        </button>
      </div>

      {confirmClear && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => busy !== "clear" && setConfirmClear(false)}>
          <div className="glass rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold">Clear local cache?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  This wipes every generation, script, carousel image, and diagnostic log stored in this browser for your
                  account. Projects saved on the server remain but their local previews will be empty. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button disabled={busy === "clear"} onClick={() => setConfirmClear(false)}
                className="rounded-lg glass border border-border px-4 py-2 text-sm">Cancel</button>
              <button disabled={busy === "clear"} onClick={doClear}
                className="rounded-lg bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 text-sm font-medium flex items-center gap-2">
                {busy === "clear" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Yes, clear it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
function slug(s: string) {
  return (s || "project").toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
}
