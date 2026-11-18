import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listBrandKitsFn, upsertBrandKitFn, deleteBrandKitFn, type BrandKit, type BrandKitMeta } from "@/lib/brand-kit.functions";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Save, Trash2, Star, Upload, Image as ImageIcon, Building2, Palette, Mic, FileImage, X } from "lucide-react";
import { toast } from "sonner";
import { BrandPreview } from "@/components/brand-preview";

const empty: Partial<BrandKit> = {
  name: "My Brand",
  primary_color: "#8b5cf6",
  secondary_color: "#ec4899",
  font_primary: "Inter",
  font_secondary: "Inter",
  brand_voice: "Friendly, confident, expert",
  default_cta: "Get started",
  keywords: [],
  is_default: true,
  metadata: { accentColor: "#f59e0b", socials: {}, competitors: [], referenceImages: [] },
};

type Tab = "identity" | "colors" | "voice" | "business" | "assets";

const TABS: { id: Tab; label: string; icon: typeof Building2 }[] = [
  { id: "identity", label: "Identity", icon: Star },
  { id: "colors", label: "Colors & type", icon: Palette },
  { id: "voice", label: "Voice & content", icon: Mic },
  { id: "business", label: "Business", icon: Building2 },
  { id: "assets", label: "Assets", icon: FileImage },
];

export function BrandKitForm() {
  const qc = useQueryClient();
  const list = useServerFn(listBrandKitsFn);
  const upsert = useServerFn(upsertBrandKitFn);
  const del = useServerFn(deleteBrandKitFn);

  const { data: kits } = useQuery({ queryKey: ["brand-kits"], queryFn: () => list() });
  const [editing, setEditing] = useState<Partial<BrandKit>>(empty);
  const [tab, setTab] = useState<Tab>("identity");

  const selected = useMemo(() => kits?.find((k) => k.id === editing.id), [kits, editing.id]);
  const meta: BrandKitMeta = editing.metadata ?? {};

  function patchMeta(patch: Partial<BrandKitMeta>) {
    setEditing((e) => ({ ...e, metadata: { ...(e.metadata ?? {}), ...patch } }));
  }
  function patchSocials(patch: Partial<NonNullable<BrandKitMeta["socials"]>>) {
    patchMeta({ socials: { ...(meta.socials ?? {}), ...patch } });
  }

  const save = useMutation({
    mutationFn: () => upsert({ data: { ...editing, name: editing.name || "Untitled" } as never }),
    onSuccess: (row) => {
      toast.success("Brand kit saved");
      qc.invalidateQueries({ queryKey: ["brand-kits"] });
      if (row) setEditing(row as unknown as BrandKit);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); setEditing(empty); qc.invalidateQueries({ queryKey: ["brand-kits"] }); },
  });

  return (
    <div className="grid xl:grid-cols-[240px_minmax(0,1fr)_minmax(0,520px)] lg:grid-cols-[240px_minmax(0,1fr)] gap-6">
      {/* Kit list */}
      <aside className="space-y-2">
        <button onClick={() => setEditing(empty)} className="w-full px-3 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary/70 text-primary-foreground text-sm font-semibold shadow-lg">
          + New brand kit
        </button>
        <div className="space-y-1.5">
          {kits?.map((k) => (
            <button key={k.id} onClick={() => setEditing(k)}
              className={`w-full text-left p-3 rounded-xl border transition ${editing.id === k.id ? "border-primary bg-primary/10" : "border-white/10 hover:border-white/25"}`}>
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm truncate">{k.name}</div>
                {k.is_default && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />}
              </div>
              <div className="flex gap-1 mt-1">
                <span className="w-3 h-3 rounded" style={{ background: k.primary_color ?? "#666" }} />
                <span className="w-3 h-3 rounded" style={{ background: k.secondary_color ?? "#666" }} />
                <span className="w-3 h-3 rounded" style={{ background: (k.metadata as BrandKitMeta | null)?.accentColor ?? "#666" }} />
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Editor */}
      <div className="glass rounded-2xl p-5 md:p-6 border border-white/10 space-y-5">
        <div className="flex items-center gap-1 border-b border-white/10 pb-3 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </div>

        {tab === "identity" && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <F label="Kit name (internal)"><Input value={editing.name ?? ""} onChange={(v) => setEditing({ ...editing, name: v })} /></F>
              <F label="Business name (public)"><Input value={meta.businessName ?? ""} onChange={(v) => patchMeta({ businessName: v })} placeholder="e.g. CreatorFlow" /></F>
              <F label="Tagline"><Input value={meta.tagline ?? ""} onChange={(v) => patchMeta({ tagline: v })} placeholder="One-line brand promise" /></F>
              <F label="Default CTA"><Input value={editing.default_cta ?? ""} onChange={(v) => setEditing({ ...editing, default_cta: v })} /></F>
              <F label="Website"><Input value={meta.website ?? ""} onChange={(v) => patchMeta({ website: v })} placeholder="https://…" /></F>
              <F label="Industry"><Input value={meta.industry ?? ""} onChange={(v) => patchMeta({ industry: v })} placeholder="SaaS, D2C, Coaching…" /></F>
            </div>
            <F label="Short brand description"><Textarea rows={3} value={meta.description ?? ""} onChange={(v) => patchMeta({ description: v })} placeholder="What you do and who it helps" /></F>
            <div className="grid md:grid-cols-2 gap-4">
              <F label="Mission"><Textarea rows={2} value={meta.mission ?? ""} onChange={(v) => patchMeta({ mission: v })} /></F>
              <F label="Vision"><Textarea rows={2} value={meta.vision ?? ""} onChange={(v) => patchMeta({ vision: v })} /></F>
              <F label="Unique selling proposition"><Textarea rows={2} value={meta.usp ?? ""} onChange={(v) => patchMeta({ usp: v })} placeholder="Why customers pick you over alternatives" /></F>
              <F label="Target audience"><Textarea rows={2} value={meta.targetAudience ?? ""} onChange={(v) => patchMeta({ targetAudience: v })} placeholder="Who you're speaking to" /></F>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!editing.is_default} onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })} />
              Set as default kit (auto-applied to every new generation)
            </label>
          </div>
        )}

        {tab === "colors" && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <F label="Primary color"><ColorInput value={editing.primary_color ?? "#8b5cf6"} onChange={(v) => setEditing({ ...editing, primary_color: v })} /></F>
              <F label="Secondary color"><ColorInput value={editing.secondary_color ?? "#ec4899"} onChange={(v) => setEditing({ ...editing, secondary_color: v })} /></F>
              <F label="Accent color"><ColorInput value={meta.accentColor ?? "#f59e0b"} onChange={(v) => patchMeta({ accentColor: v })} /></F>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <F label="Heading font"><Input value={editing.font_primary ?? ""} onChange={(v) => setEditing({ ...editing, font_primary: v })} placeholder="Inter, Space Grotesk, Sora…" /></F>
              <F label="Body font"><Input value={editing.font_secondary ?? ""} onChange={(v) => setEditing({ ...editing, font_secondary: v })} placeholder="Inter, DM Sans…" /></F>
            </div>
            <div className="pt-3 border-t border-white/10 space-y-3">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Default styles (auto-applied to every generation)</div>
              <div className="grid md:grid-cols-2 gap-4">
                <F label="Visual style"><Input value={editing.default_styles?.visualStyle ?? ""} onChange={(v) => setEditing({ ...editing, default_styles: { ...(editing.default_styles ?? {}), visualStyle: v } })} placeholder="cinematic, editorial, minimal…" /></F>
                <F label="Preferred aspect ratio"><Input value={editing.default_styles?.aspectRatio ?? ""} onChange={(v) => setEditing({ ...editing, default_styles: { ...(editing.default_styles ?? {}), aspectRatio: v } })} placeholder="9:16, 1:1, 16:9" /></F>
                <F label="Image style"><Input value={editing.default_styles?.imageStyle ?? ""} onChange={(v) => setEditing({ ...editing, default_styles: { ...(editing.default_styles ?? {}), imageStyle: v } })} placeholder="photoreal, illustrative, 3d…" /></F>
                <F label="Video style"><Input value={editing.default_styles?.videoStyle ?? ""} onChange={(v) => setEditing({ ...editing, default_styles: { ...(editing.default_styles ?? {}), videoStyle: v } })} placeholder="fast-cut, documentary, vlog…" /></F>
              </div>
            </div>
          </div>
        )}

        {tab === "voice" && (
          <div className="space-y-4">
            <F label="Brand voice"><Textarea rows={3} value={editing.brand_voice ?? ""} onChange={(v) => setEditing({ ...editing, brand_voice: v })} placeholder="e.g. bold, playful, expert but never salesy" /></F>
            <div className="grid md:grid-cols-2 gap-4">
              <F label="Writing style"><Textarea rows={3} value={meta.writingStyle ?? ""} onChange={(v) => patchMeta({ writingStyle: v })} placeholder="Short sentences. Punchy hooks. No jargon." /></F>
              <F label="Caption tone"><Input value={editing.default_styles?.captionTone ?? ""} onChange={(v) => setEditing({ ...editing, default_styles: { ...(editing.default_styles ?? {}), captionTone: v } })} placeholder="witty, direct, warm…" /></F>
            </div>
            <F label="Brand keywords (comma separated)">
              <Input
                value={(editing.keywords ?? []).join(", ")}
                onChange={(v) => setEditing({ ...editing, keywords: v.split(",").map((x) => x.trim()).filter(Boolean) })}
              />
            </F>
            <F label="Example posts / winning captions (one per line)">
              <Textarea
                rows={5}
                value={(meta.examplePosts ?? []).join("\n")}
                onChange={(v) => patchMeta({ examplePosts: v.split("\n").map((x) => x.trim()).filter(Boolean) })}
                placeholder="Paste 2–5 of your best posts so the AI matches your voice"
              />
            </F>
          </div>
        )}

        {tab === "business" && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <F label="Products (comma separated)"><Input value={meta.products ?? ""} onChange={(v) => patchMeta({ products: v })} /></F>
              <F label="Services (comma separated)"><Input value={meta.services ?? ""} onChange={(v) => patchMeta({ services: v })} /></F>
              <F label="Email"><Input value={meta.email ?? ""} onChange={(v) => patchMeta({ email: v })} placeholder="hello@brand.com" /></F>
              <F label="Phone"><Input value={meta.phone ?? ""} onChange={(v) => patchMeta({ phone: v })} placeholder="+1 555 …" /></F>
            </div>
            <div className="pt-3 border-t border-white/10">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Social links</div>
              <div className="grid md:grid-cols-2 gap-3">
                {(["instagram","youtube","tiktok","linkedin","twitter","facebook","pinterest"] as const).map((k) => (
                  <F key={k} label={k[0].toUpperCase() + k.slice(1)}>
                    <Input value={meta.socials?.[k] ?? ""} onChange={(v) => patchSocials({ [k]: v } as never)} placeholder={`@${k === "twitter" ? "handle" : "handle"} or URL`} />
                  </F>
                ))}
              </div>
            </div>
            <F label="Top competitors (one per line)">
              <Textarea
                rows={4}
                value={(meta.competitors ?? []).join("\n")}
                onChange={(v) => patchMeta({ competitors: v.split("\n").map((x) => x.trim()).filter(Boolean) })}
                placeholder="brand.com&#10;competitor.io"
              />
            </F>
          </div>
        )}

        {tab === "assets" && (
          <div className="space-y-5">
            <AssetUploader
              label="Logo"
              url={editing.logo_url ?? null}
              onChange={(u) => setEditing({ ...editing, logo_url: u })}
              accept="image/*"
              kind="logos"
            />
            <AssetUploader
              label="Watermark (for videos / posts)"
              url={editing.watermark_url ?? null}
              onChange={(u) => setEditing({ ...editing, watermark_url: u })}
              accept="image/*"
              kind="watermarks"
            />
            <div className="grid md:grid-cols-2 gap-4">
              <F label="Intro video URL"><Input value={editing.intro_url ?? ""} onChange={(v) => setEditing({ ...editing, intro_url: v })} placeholder="https://…" /></F>
              <F label="Outro video URL"><Input value={editing.outro_url ?? ""} onChange={(v) => setEditing({ ...editing, outro_url: v })} placeholder="https://…" /></F>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Reference images (moodboard / style anchors)</div>
              <MultiImageUploader
                urls={meta.referenceImages ?? []}
                onChange={(list) => patchMeta({ referenceImages: list })}
              />
            </div>
          </div>
        )}

        <div className="flex justify-between pt-4 border-t border-white/10">
          <div>
            {selected && (
              <button onClick={() => remove.mutate(selected.id)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-red-500/30 text-red-400 text-sm hover:bg-red-500/10">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            )}
          </div>
          <button onClick={() => save.mutate()} disabled={save.isPending}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary/70 text-primary-foreground text-sm font-semibold shadow-lg disabled:opacity-50">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {editing.id ? "Save changes" : "Create brand kit"}
          </button>
        </div>
      </div>

      {/* Live preview */}
      <div className="xl:sticky xl:top-4 h-fit space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Live preview</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Updates instantly</div>
        </div>
        <BrandPreview kit={editing} />
      </div>
    </div>
  );
}

// ————— Field primitives —————

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 block">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}
function Input(p: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className="input-base" value={p.value} onChange={(e) => p.onChange(e.target.value)} placeholder={p.placeholder} />;
}
function Textarea(p: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return <textarea className="input-base" rows={p.rows ?? 3} value={p.value} onChange={(e) => p.onChange(e.target.value)} placeholder={p.placeholder} />;
}
function ColorInput(p: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2 items-center">
      <input type="color" className="w-12 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer" value={p.value} onChange={(e) => p.onChange(e.target.value)} />
      <input className="input-base flex-1 font-mono uppercase text-xs" value={p.value} onChange={(e) => p.onChange(e.target.value)} />
    </div>
  );
}

// ————— Uploaders —————

async function uploadToLibrary(file: File, folder: string): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not signed in");
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${userData.user.id}/brand/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("library").upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;
  const { data: signed } = await supabase.storage.from("library").createSignedUrl(path, 60 * 60 * 24 * 365);
  return signed?.signedUrl ?? path;
}

function AssetUploader({ label, url, onChange, accept, kind }: { label: string; url: string | null; onChange: (u: string | null) => void; accept: string; kind: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex items-center gap-3">
        <div className="w-20 h-20 rounded-xl border border-dashed border-white/15 bg-white/[0.02] flex items-center justify-center overflow-hidden shrink-0">
          {url ? <img src={url} alt="" className="w-full h-full object-contain bg-white" /> : <ImageIcon className="w-6 h-6 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <input className="input-base text-xs" value={url ?? ""} onChange={(e) => onChange(e.target.value || null)} placeholder="Paste URL or upload →" />
          <div className="flex gap-2">
            <input ref={ref} type="file" accept={accept} className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              setBusy(true);
              try { const u = await uploadToLibrary(f, kind); onChange(u); toast.success(`${label} uploaded`); }
              catch (err) { toast.error((err as Error).message); }
              finally { setBusy(false); if (ref.current) ref.current.value = ""; }
            }} />
            <button onClick={() => ref.current?.click()} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 hover:border-white/30 text-xs disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload
            </button>
            {url && (
              <button onClick={() => onChange(null)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 text-xs text-muted-foreground hover:text-red-400">
                <X className="w-3.5 h-3.5" /> Remove
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MultiImageUploader({ urls, onChange }: { urls: string[]; onChange: (u: string[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
        {urls.map((u, i) => (
          <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-white/10 bg-white/[0.02] group">
            <img src={u} alt="" className="w-full h-full object-cover" />
            <button aria-label="Remove" onClick={() => onChange(urls.filter((_, j) => j !== i))} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        ))}
        <button onClick={() => ref.current?.click()} disabled={busy} className="aspect-square rounded-lg border border-dashed border-white/15 hover:border-primary flex items-center justify-center text-muted-foreground disabled:opacity-50">
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
        </button>
      </div>
      <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
        const files = Array.from(e.target.files ?? []); if (!files.length) return;
        setBusy(true);
        try {
          const uploaded = await Promise.all(files.map((f) => uploadToLibrary(f, "references")));
          onChange([...urls, ...uploaded]);
          toast.success(`${uploaded.length} image(s) added`);
        } catch (err) { toast.error((err as Error).message); }
        finally { setBusy(false); if (ref.current) ref.current.value = ""; }
      }} />
    </div>
  );
}
