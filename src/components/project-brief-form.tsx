// Single source of truth for the "project brief" form used by both the
// /create screen (new project) and the /projects/$id editor (edit + regenerate).
// Extracting this guarantees the two flows show identical fields, defaults and
// validation — so switching between "create" and "edit" never surprises users.

import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import { TimedSteps, CAROUSEL_STEPS, SCRIPT_STEPS } from "@/components/timed-steps";
import { estimateProjectCredits } from "@/lib/credit-costs";
import { creditsLabel } from "@/lib/credits-label";
import { LanguagePicker, VoiceFallbackNotice, needsVoiceChoice } from "@/components/language-picker";
import { CONTENT_TYPES, PLATFORMS, TONES, STYLES, VOICES, NICHES } from "@/lib/constants";
import { Loader2, Wand2, ArrowRight, Volume2, Square } from "lucide-react";

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
  /** Short reel length in seconds (15 / 30 / 60). */
  reel_length_sec: number;
  /** Script / caption / voice language ("auto" = same as the topic). */
  language: string;
  /** Voice language when `language` has no AI voice ("none" = no voiceover). */
  voiceLanguage?: string;
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
  reel_length_sec: 30,
  language: "auto",
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

  const hasVoice = form.content_type !== "carousel";
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (hasVoice && needsVoiceChoice(form.language, form.voiceLanguage)) {
      toast.error("Choose a voice language (or no voiceover) for this language first.");
      return;
    }
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

      {form.content_type === "short_reel" && (
        <Section title="Reel length">
          <div className="flex flex-wrap gap-2">
            {[15, 30, 60].map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => update("reel_length_sec", sec)}
                className={`px-4 py-2 rounded-full text-sm border transition ${
                  form.reel_length_sec === sec
                    ? "gradient-primary text-white border-transparent shadow-lg"
                    : "glass border-border hover:border-white/20"
                }`}
              >
                {sec} seconds
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

      <Section title="Language">
        <p className="text-xs text-muted-foreground mb-3">Script, on-screen text, caption and voiceover are written in this language.</p>
        <LanguagePicker allowAuto showVoice={hasVoice} size="md" value={form.language}
          onChange={(v) => setForm((f) => ({ ...f, language: v, voiceLanguage: "" }))} />
        {hasVoice && (
          <VoiceFallbackNotice language={form.language} voiceLanguage={form.voiceLanguage ?? ""}
            onChange={(v) => update("voiceLanguage", v)} />
        )}
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
            <div key={v.id} className="relative">
              <Card active={form.voice === v.id} onClick={() => update("voice", v.id)} compact>
                <span className="text-sm pr-7">{v.label}</span>
              </Card>
              <VoicePreviewButton voiceId={v.id} label={v.label} />
            </div>
          ))}
        </div>
      </Section>

      <TimedSteps steps={form.content_type === "carousel" ? CAROUSEL_STEPS : SCRIPT_STEPS} active={loading} />

      <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
        {(() => {
          const est = estimateProjectCredits({
            contentType: form.content_type,
            lengthSec: form.content_type === "long_video" ? form.long_video_length_sec : form.reel_length_sec,
            slideCount: form.slide_count,
          });
          return (
            <div className="text-xs text-muted-foreground text-right" title={est.parts}>
              Estimated cost: <span className="font-semibold text-foreground">≈ {creditsLabel(est.total)}</span>
              <div className="text-[11px]">{est.parts}</div>
            </div>
          );
        })()}
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

let previewAudio: HTMLAudioElement | null = null;

function VoicePreviewButton({ voiceId, label }: { voiceId: string; label: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  async function play(e: React.MouseEvent) {
    e.stopPropagation();
    if (previewAudio) { previewAudio.pause(); previewAudio = null; }
    if (state === "playing") { setState("idle"); return; }
    setState("loading");
    try {
      const res = await authFetch(`/api/voice-sample?voice=${encodeURIComponent(voiceId)}`);
      const j = (await res.json()) as { url?: string; error?: string };
      if (!j.url) throw new Error(j.error ?? "Preview unavailable");
      const a = new Audio(j.url);
      previewAudio = a;
      a.onended = () => setState("idle");
      await a.play();
      setState("playing");
    } catch (err) {
      setState("idle");
      toast.error(err instanceof Error ? err.message : "Preview unavailable");
    }
  }
  return (
    <button
      type="button"
      onClick={play}
      aria-label={`Preview ${label} voice`}
      title="Preview voice (free)"
      className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full glass flex items-center justify-center hover:bg-white/10"
    >
      {state === "loading" ? <Loader2 className="w-3 h-3 animate-spin" /> : state === "playing" ? <Square className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
    </button>
  );
}
