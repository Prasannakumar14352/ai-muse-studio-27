// Language picker used everywhere content is generated: quick chips for the
// most-used languages + a searchable "More languages" list (Indian first).
// Plus the notice shown when the chosen language has no AI voice.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Mic, MicOff, Search } from "lucide-react";
import {
  ALL_LANGUAGES, INDIAN_LANGUAGES, VOICE_LANGUAGES, WORLD_LANGUAGES, ENGLISH,
  findLanguage, languageLabel, type Lang,
} from "@/lib/languages";

const QUICK = ["English", "Hindi", "Telugu", "Tamil", "Kannada", "Malayalam"];

type Props = {
  value: string;
  onChange: (id: string) => void;
  /** Offer "Same as topic" (stored as "auto"). */
  allowAuto?: boolean;
  /** Show the 🎙 / text-only hint next to each language (for voice-over features). */
  showVoice?: boolean;
  size?: "sm" | "md";
};

export function LanguagePicker({ value, onChange, allowAuto = false, showVoice = false, size = "sm" }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const chips = useMemo(() => {
    const ids = [...(allowAuto ? ["auto"] : []), ...QUICK];
    if (value && !ids.includes(value)) ids.push(value);
    return ids;
  }, [allowAuto, value]);

  const s = q.trim().toLowerCase();
  const match = (l: Lang) => !s || l.id.toLowerCase().includes(s) || l.native.toLowerCase().includes(s);
  const india = INDIAN_LANGUAGES.filter(match);
  const world = WORLD_LANGUAGES.filter(match);
  const showEnglish = match(ENGLISH);

  const chipCls = size === "md" ? "px-3 py-1.5 text-sm" : "px-3 py-1.5 text-xs";
  const label = (id: string) => (id === "auto" ? "Same as topic" : (() => { const l = findLanguage(id); return l ? languageLabel(l) : id; })());

  const pick = (id: string) => { onChange(id); setOpen(false); setQ(""); };
  const row = (l: Lang) => (
    <button key={l.id} type="button" onClick={() => pick(l.id)}
      className="w-full text-left px-3 py-1.5 rounded-md text-sm hover:bg-white/10 flex items-center justify-between gap-2">
      <span className="truncate">{l.native !== l.id ? <>{l.native} <span className="text-muted-foreground text-xs">{l.id}</span></> : l.id}</span>
      <span className="flex items-center gap-1.5 shrink-0">
        {showVoice && (l.voice
          ? <Mic className="w-3 h-3 text-emerald-300" aria-label="AI voice available" />
          : <span className="text-[10px] text-amber-300">text only</span>)}
        {value === l.id && <Check className="w-3.5 h-3.5 text-orange-300" />}
      </span>
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((id) => (
        <button key={id} type="button" onClick={() => onChange(id)}
          className={`${chipCls} rounded-full border transition ${value === id ? "gradient-primary text-white border-transparent" : "glass border-border hover:border-primary/40"}`}>
          {label(id)}
        </button>
      ))}
      <div ref={boxRef} className="relative">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className={`${chipCls} rounded-full border glass border-border hover:border-primary/40 inline-flex items-center gap-1`}>
          More languages ({ALL_LANGUAGES.length}) <ChevronDown className="w-3.5 h-3.5" />
        </button>
        {open && (
          <div className="absolute left-0 mt-2 w-72 max-h-80 rounded-xl border border-border bg-[#0d0d14] shadow-2xl z-50 flex flex-col overflow-hidden">
            <div className="p-2 border-b border-border flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search language"
                className="flex-1 bg-transparent text-sm focus:outline-none" />
            </div>
            <div className="overflow-y-auto p-1">
              {showEnglish && row(ENGLISH)}
              {india.length > 0 && <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Indian languages</div>}
              {india.map(row)}
              {world.length > 0 && <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-muted-foreground">World languages</div>}
              {world.map(row)}
              {!showEnglish && !india.length && !world.length && <div className="px-3 py-4 text-sm text-muted-foreground">No match</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Shown when the chosen language has no AI voice yet. The user decides:
 * read it with another language's voice, or make the video without voiceover.
 * `voiceLanguage` is "" until they choose.
 */
export function VoiceFallbackNotice({ language, voiceLanguage, onChange }: {
  language: string;
  voiceLanguage: string;
  onChange: (v: string) => void;
}) {
  const lang = findLanguage(language);
  if (!lang || lang.voice) return null;
  const suggested = lang.india ? "Hindi" : "English";
  return (
    <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm space-y-2">
      <div className="flex items-start gap-2">
        <MicOff className="w-4 h-4 mt-0.5 text-amber-300 shrink-0" />
        <div>
          <div className="font-medium">No AI voice for {lang.id} yet</div>
          <div className="text-xs text-muted-foreground">
            The script, captions and on-screen text will be in {lang.id}. For the voiceover, choose a voice language or make it without voice.
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={voiceLanguage} onChange={(e) => onChange(e.target.value)} aria-label="Voice language"
          className="text-sm bg-black/30 border border-border rounded-lg px-2 py-1.5">
          <option value="">Choose voice…</option>
          <option value="none">No voiceover</option>
          <option value={suggested}>{suggested} voice (suggested)</option>
          {VOICE_LANGUAGES.filter((l) => l.id !== suggested).map((l) => (
            <option key={l.id} value={l.id}>{l.id} voice</option>
          ))}
        </select>
        {!voiceLanguage && <span className="text-xs text-amber-300">Please choose before generating</span>}
      </div>
    </div>
  );
}

/** True when the language needs a voice choice and none was made yet. */
export function needsVoiceChoice(language: string, voiceLanguage: string | undefined | null): boolean {
  const lang = findLanguage(language);
  return !!lang && !lang.voice && !voiceLanguage;
}
