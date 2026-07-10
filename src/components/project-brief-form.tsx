// Single source of truth for the "project brief" form used by both the
// /create screen (new project) and the /projects/$id editor (edit + regenerate).
// Extracting this guarantees the two flows show identical fields, defaults and
// validation — so switching between "create" and "edit" never surprises users.

import { useState } from "react";
import { CONTENT_TYPES, PLATFORMS, TONES, STYLES, VOICES, NICHES } from "@/lib/constants";
import { Loader2, Wand2, ArrowRight } from "lucide-react";

export type ProjectBrief = {
  content_type: string;
  topic: string;
  audience: string;
  platform: string;
  tone: string;
  style: string;
  voice: string;
  music: string;
  aspect_ratio: "1:1" | "4:5" | "9:16" | "16:9";
  slide_count: number;
  long_video_length_sec: number;
};

export const DEFAULT_BRIEF: ProjectBrief = {
  content_type: "short_reel",
  topic: "",
  audience: "",
  platform: "instagram",
  tone: "Viral",
  style: "cinematic",
  voice: "energetic_creator",
  music: "Cinematic",
  aspect_ratio: "4:5",
  slide_count: 5,
  long_video_length_sec: 90,
};

type Props = {
  initial: Partial<ProjectBrief>;
  loading?: boolean;
  submitLabel?: string;
  submitIcon?: "wand" | "arrow";
  /** Hide the content-type picker (used on the editor where type is fixed). */
  lockContentType?: boolean;
  onSubmit: (brief: ProjectBrief) => void | Promise<void>;
};

export function ProjectBriefForm({
  initial,
  loading = false,
  submitLabel = "Generate & open editor",
  submitIcon = "wand",
  lockContentType = false,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<ProjectBrief>({ ...DEFAULT_BRIEF, ...initial });

  function update<K extends keyof ProjectBrief>(k: K, v: ProjectBrief[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit(form);
  }

  const Icon = submitIcon === "wand" ? Wand2 : ArrowRight;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {!lockContentType && (
        <Section title="1. What are you creating?">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {CONTENT_TYPES.map((c) => (
              <Card key={c.id} active={form.content_type === c.id} onClick={() => update("content_type", c.id)}>
                <c.icon className="w-5 h-5 mb-2 text-[color:var(--neon-purple)]" />
                <div className="font-medium text-sm">{c.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{c.desc}</div>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {form.content_type === "long_video" && (
        <Section title="Long video length">
          <div className="flex flex-wrap gap-2">
            {[60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800].map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => update("long_video_length_sec", sec)}
                className={`px-4 py-2 rounded-full text-sm border transition ${
                  form.long_video_length_sec === sec
                    ? "gradient-primary text-white border-transparent shadow-lg"
                    : "glass border-border hover:border-white/20"
                }`}
              >
                {sec >= 60 ? `${Math.round(sec / 60)}${sec % 60 ? `:${String(sec % 60).padStart(2, "0")}` : " min"}` : `${sec}s`}
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Suggested niches (optional — auto-fills a trending topic)">
        <div className="flex flex-wrap gap-2">
          {NICHES.map((n) => (
            <button key={n.id} type="button"
              onClick={() => update("topic", n.topics[Math.floor(Math.random() * n.topics.length)])}
              className="glass border border-border hover:border-[color:var(--neon-purple)] rounded-full px-3 py-1.5 text-xs flex items-center gap-1.5 transition">
              <span>{n.emoji}</span> {n.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="What's it about?">
        <input value={form.topic} onChange={(e) => update("topic", e.target.value)}
          placeholder="e.g. Why silent walking is the new meditation"
          className="w-full bg-input/50 border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-[color:var(--neon-purple)]" />
        <input value={form.audience} onChange={(e) => update("audience", e.target.value)}
          placeholder="Target audience (optional) — e.g. Gen Z fitness enthusiasts"
          className="mt-3 w-full bg-input/50 border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-[color:var(--neon-purple)]" />
      </Section>

      <Section title="Platform & tone">
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {PLATFORMS.map((p) => (
              <Card key={p.id} active={form.platform === p.id} onClick={() => update("platform", p.id)} compact>
                <p.icon className="w-4 h-4" /> <span className="text-sm">{p.label}</span>
              </Card>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {TONES.map((t) => (
              <button key={t} type="button" onClick={() => update("tone", t)}
                className={`px-4 py-2 rounded-full text-sm border transition ${
                  form.tone === t ? "gradient-primary text-white border-transparent shadow-lg" : "glass border-border hover:border-white/20"
                }`}>{t}</button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Visual style">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {STYLES.map((s) => (
            <button key={s.id} type="button" onClick={() => update("style", s.id)}
              className={`relative aspect-[4/5] rounded-xl overflow-hidden p-3 flex items-end text-left transition group ${
                form.style === s.id ? "ring-2 ring-white shadow-[var(--shadow-glow)]" : "opacity-85 hover:opacity-100"
              }`}>
              <img src={s.image} alt={s.label} loading="lazy" className="absolute inset-0 w-full h-full object-cover transition group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <span className="relative text-white font-semibold text-sm drop-shadow">{s.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Voice">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {VOICES.map((v) => (
            <Card key={v.id} active={form.voice === v.id} onClick={() => update("voice", v.id)} compact>
              <span className="text-sm">{v.label}</span>
            </Card>
          ))}
        </div>
      </Section>

      <div className="flex justify-end pt-2">
        <button type="submit" disabled={loading || !form.topic.trim()}
          className="rounded-xl gradient-primary text-white px-8 py-3.5 font-semibold shadow-[var(--shadow-glow)] disabled:opacity-60 flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="font-semibold mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Card({ active, onClick, children, compact }: {
  active: boolean; onClick: () => void; children: React.ReactNode; compact?: boolean;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`text-left rounded-xl border p-4 transition flex ${compact ? "items-center gap-2" : "flex-col"} ${
        active ? "border-[color:var(--neon-purple)] bg-[color:var(--neon-purple)]/10 shadow-[var(--shadow-glow)]" : "border-border hover:border-white/20 bg-white/[0.02]"
      }`}>{children}</button>
  );
}
