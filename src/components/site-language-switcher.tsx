// 🌐 language menu for the public website (landing, features, pricing…).
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Globe, Search } from "lucide-react";
import {
  ALL_SITE_LANGUAGES, SITE_LANGUAGES_INDIA, SITE_LANGUAGES_WORLD,
  getSiteLang, isSitePath, resumeSiteLang, setSiteLang, translatorActive, type SiteLang,
} from "@/lib/site-translate";

export function SiteLanguageSwitcher() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [current, setCurrent] = useState("en");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setCurrent(getSiteLang()); }, []);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const match = (l: SiteLang) => {
    const s = q.trim().toLowerCase();
    return !s || l.name.toLowerCase().includes(s) || (l.native ?? "").toLowerCase().includes(s) || l.code.toLowerCase() === s;
  };
  const india = useMemo(() => SITE_LANGUAGES_INDIA.filter(match), [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const world = useMemo(() => SITE_LANGUAGES_WORLD.filter(match), [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const currentName = ALL_SITE_LANGUAGES.find((l) => l.code === current);

  async function pick(code: string) {
    setOpen(false);
    setQ("");
    if (code === current) return;
    setBusy(true);
    setCurrent(code);
    try { await setSiteLang(code); } finally { setBusy(false); }
  }

  const item = (l: SiteLang) => (
    <button key={l.code} type="button" onClick={() => pick(l.code)}
      className="w-full text-left px-3 py-1.5 rounded-md text-sm hover:bg-white/10 flex items-center justify-between gap-2">
      <span>{l.native ? <><span>{l.native}</span> <span className="text-muted-foreground text-xs">{l.name}</span></> : l.name}</span>
      {current === l.code && <Check className="w-3.5 h-3.5 text-orange-300 shrink-0" />}
    </button>
  );

  return (
    // "notranslate": keep language names readable in their own script.
    <div ref={boxRef} className="relative notranslate" translate="no">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        aria-label="Change website language"
        className="inline-flex items-center gap-1.5 rounded-lg glass border border-white/10 px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground">
        <Globe className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
        <span className="hidden sm:inline">{currentName?.native ?? currentName?.name ?? "English"}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 max-h-[70vh] overflow-hidden rounded-xl border border-white/10 bg-[#0d0d14] shadow-2xl z-[60] flex flex-col">
          <div className="p-2 border-b border-white/10 flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search language"
              className="flex-1 bg-transparent text-sm focus:outline-none" />
          </div>
          <div className="overflow-y-auto p-1">
            {(!q || "english".includes(q.toLowerCase())) && item({ code: "en", name: "English" })}
            {india.length > 0 && <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Indian languages</div>}
            {india.map(item)}
            {world.length > 0 && <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-muted-foreground">World languages</div>}
            {world.map(item)}
            {!india.length && !world.length && <div className="px-3 py-4 text-sm text-muted-foreground">No match</div>}
          </div>
          <div className="px-3 py-2 border-t border-white/10 text-[10px] text-muted-foreground">Translated automatically by Google</div>
        </div>
      )}
    </div>
  );
}

/**
 * Mounted once at the root. Public pages: resume the visitor's language.
 * Moving into the signed-in app after translating: reload, so the app itself
 * is never machine-translated.
 */
export function SiteTranslateGuard() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (isSitePath(pathname)) { void resumeSiteLang(); return; }
    if (translatorActive()) window.location.reload();
  }, [pathname]);
  return null;
}
