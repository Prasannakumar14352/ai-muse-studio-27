// Narrator voice picker: Male / Female tabs, each voice with a ▶ preview read
// in the video's language (where we have a sample line), then Select.
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth-fetch";
import { SAMPLE_TEXTS, VOICE_CATALOG, catalogVoiceId } from "@/lib/voice-catalog";

export function VoicePicker({ value, onChange, language }: {
  value: string;
  onChange: (voiceId: string) => void;
  /** Video language — previews use it when a sample line exists, else English. */
  language?: string | null;
}) {
  const selected = catalogVoiceId(value);
  const [gender, setGender] = useState<"male" | "female">(
    VOICE_CATALOG.find((v) => v.id === selected)?.gender ?? "male",
  );
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cache = useRef(new Map<string, string>());
  const sampleLang = language && SAMPLE_TEXTS[language] ? language : "English";

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  async function preview(id: string) {
    if (playing === id) { audioRef.current?.pause(); setPlaying(null); return; }
    audioRef.current?.pause();
    const key = `${id}|${sampleLang}`;
    let url = cache.current.get(key);
    if (!url) {
      setLoading(id);
      try {
        const res = await authFetch(`/api/voice-sample?voice=${encodeURIComponent(id)}&lang=${encodeURIComponent(sampleLang)}`);
        const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !j.url) throw new Error(j.error || "Preview unavailable");
        url = j.url;
        cache.current.set(key, url);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Preview unavailable");
        setLoading(null);
        return;
      }
      setLoading(null);
    }
    const a = new Audio(url);
    audioRef.current = a;
    a.onended = () => setPlaying(null);
    a.play().then(() => setPlaying(id)).catch(() => setPlaying(null));
  }

  const list = VOICE_CATALOG.filter((v) => v.gender === gender);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-border p-0.5 bg-black/20" role="tablist" aria-label="Voice type">
          {(["male", "female"] as const).map((g) => (
            <button key={g} type="button" role="tab" aria-selected={gender === g} onClick={() => setGender(g)}
              className={`px-3 py-1.5 rounded-md text-sm ${gender === g ? "gradient-primary text-white" : "text-muted-foreground hover:text-foreground"}`}>
              {g === "male" ? "Male voices" : "Female voices"}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">Tap ▶ to hear a voice{sampleLang !== "English" ? ` in ${sampleLang}` : ""}. Previews are free.</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
        {list.map((v) => {
          const isSel = selected === v.id;
          return (
            <div key={v.id}
              className={`rounded-xl border p-2.5 flex items-center gap-2 transition ${isSel ? "border-orange-400/60 bg-orange-500/10" : "glass border-border hover:border-primary/40"}`}>
              <button type="button" onClick={() => preview(v.id)} aria-label={`Play ${v.label} sample`}
                className="w-8 h-8 shrink-0 rounded-full gradient-primary text-white flex items-center justify-center">
                {loading === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : playing === v.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
              </button>
              <button type="button" onClick={() => onChange(v.id)} className="flex-1 min-w-0 text-left" aria-pressed={isSel}>
                <div className="text-sm font-semibold flex items-center gap-1">{v.label}{isSel && <Check className="w-3.5 h-3.5 text-orange-300" />}</div>
                <div className="text-[11px] text-muted-foreground truncate">{v.vibe}</div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
