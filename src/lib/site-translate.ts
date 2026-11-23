// Public-website language switcher, powered by Google's website translator.
// - Loaded ONLY on public pages, and only once a visitor picks a language
//   (English visitors never load it).
// - The choice lives in Google's `googtrans` cookie, so it's remembered.
// - Signed-in app pages never load the translator (see SITE_PATHS).

export type SiteLang = { code: string; name: string; native?: string };

/** Indian languages first, then the rest A–Z. Codes are Google Translate codes. */
export const SITE_LANGUAGES_INDIA: SiteLang[] = [
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "te", name: "Telugu", native: "తెలుగు" },
  { code: "ta", name: "Tamil", native: "தமிழ்" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml", name: "Malayalam", native: "മലയാളം" },
  { code: "mr", name: "Marathi", native: "मराठी" },
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "or", name: "Odia", native: "ଓଡ଼ିଆ" },
  { code: "as", name: "Assamese", native: "অসমীয়া" },
  { code: "ur", name: "Urdu", native: "اردو" },
  { code: "ne", name: "Nepali", native: "नेपाली" },
  { code: "sd", name: "Sindhi", native: "سنڌي" },
  { code: "gom", name: "Konkani", native: "कोंकणी" },
  { code: "mai", name: "Maithili", native: "मैथिली" },
  { code: "doi", name: "Dogri", native: "डोगरी" },
  { code: "mni-Mtei", name: "Manipuri", native: "ꯃꯤꯇꯩꯂꯣꯟ" },
  { code: "sa", name: "Sanskrit", native: "संस्कृतम्" },
  { code: "sat", name: "Santali", native: "ᱥᱟᱱᱛᱟᱲᱤ" },
  { code: "bho", name: "Bhojpuri", native: "भोजपुरी" },
  { code: "tcy", name: "Tulu", native: "ತುಳು" },
];

const WORLD: Array<[string, string]> = [
  ["af", "Afrikaans"], ["sq", "Albanian"], ["am", "Amharic"], ["ar", "Arabic"], ["hy", "Armenian"],
  ["az", "Azerbaijani"], ["eu", "Basque"], ["be", "Belarusian"], ["bs", "Bosnian"], ["bg", "Bulgarian"],
  ["ca", "Catalan"], ["ceb", "Cebuano"], ["ny", "Chichewa"], ["zh-CN", "Chinese (Simplified)"],
  ["zh-TW", "Chinese (Traditional)"], ["co", "Corsican"], ["hr", "Croatian"], ["cs", "Czech"], ["da", "Danish"],
  ["nl", "Dutch"], ["eo", "Esperanto"], ["et", "Estonian"], ["tl", "Filipino"], ["fi", "Finnish"],
  ["fr", "French"], ["fy", "Frisian"], ["gl", "Galician"], ["ka", "Georgian"], ["de", "German"], ["el", "Greek"],
  ["ht", "Haitian Creole"], ["ha", "Hausa"], ["haw", "Hawaiian"], ["iw", "Hebrew"], ["hmn", "Hmong"],
  ["hu", "Hungarian"], ["is", "Icelandic"], ["ig", "Igbo"], ["id", "Indonesian"], ["ga", "Irish"],
  ["it", "Italian"], ["ja", "Japanese"], ["jw", "Javanese"], ["kk", "Kazakh"], ["km", "Khmer"], ["ko", "Korean"],
  ["ku", "Kurdish (Kurmanji)"], ["ky", "Kyrgyz"], ["lo", "Lao"], ["la", "Latin"], ["lv", "Latvian"],
  ["lt", "Lithuanian"], ["lb", "Luxembourgish"], ["mk", "Macedonian"], ["mg", "Malagasy"], ["ms", "Malay"],
  ["mt", "Maltese"], ["mi", "Maori"], ["mn", "Mongolian"], ["my", "Myanmar (Burmese)"], ["no", "Norwegian"],
  ["ps", "Pashto"], ["fa", "Persian"], ["pl", "Polish"], ["pt", "Portuguese"], ["ro", "Romanian"], ["ru", "Russian"],
  ["sm", "Samoan"], ["gd", "Scottish Gaelic"], ["sr", "Serbian"], ["st", "Sesotho"], ["sn", "Shona"],
  ["si", "Sinhala"], ["sk", "Slovak"], ["sl", "Slovenian"], ["so", "Somali"], ["es", "Spanish"], ["su", "Sundanese"],
  ["sw", "Swahili"], ["sv", "Swedish"], ["tg", "Tajik"], ["th", "Thai"], ["tr", "Turkish"], ["uk", "Ukrainian"],
  ["uz", "Uzbek"], ["vi", "Vietnamese"], ["cy", "Welsh"], ["xh", "Xhosa"], ["yi", "Yiddish"], ["yo", "Yoruba"],
  ["zu", "Zulu"],
];
export const SITE_LANGUAGES_WORLD: SiteLang[] = WORLD.map(([code, name]) => ({ code, name }));

export const ALL_SITE_LANGUAGES: SiteLang[] = [{ code: "en", name: "English" }, ...SITE_LANGUAGES_INDIA, ...SITE_LANGUAGES_WORLD];

/** Public pages the translator may run on. Everything else (the signed-in app) stays untouched. */
const SITE_PATHS = ["/", "/features", "/how-it-works", "/pricing", "/contact", "/privacy", "/terms"];
export function isSitePath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return SITE_PATHS.includes(p);
}

const COOKIE = "googtrans";

function setCookie(value: string | null) {
  const host = location.hostname;
  const parts = host.split(".");
  const domains = ["", host, parts.length > 2 ? `.${parts.slice(-2).join(".")}` : `.${host}`];
  for (const d of domains) {
    const domain = d ? `; domain=${d}` : "";
    document.cookie = value
      ? `${COOKIE}=${value}; path=/${domain}; max-age=31536000; SameSite=Lax`
      : `${COOKIE}=; path=/${domain}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
}

/** Language the visitor picked ("en" when none). */
export function getSiteLang(): string {
  if (typeof document === "undefined") return "en";
  const m = document.cookie.match(/(?:^|;\s*)googtrans=\/[^/]*\/([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "en";
}

let loading: Promise<void> | null = null;

/**
 * Google's translator wraps text in <font> tags, which makes React crash with
 * "Failed to execute 'removeChild'" on the next re-render. Make those two DOM
 * calls tolerant (the widely used fix from facebook/react#11538).
 */
function patchDomForTranslation() {
  const w = window as unknown as { __cfDomPatched?: boolean };
  if (w.__cfDomPatched || typeof Node !== "function") return;
  w.__cfDomPatched = true;
  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      if (child.parentNode) return child.parentNode.removeChild(child) as T;
      return child;
    }
    return removeChild.call(this, child) as T;
  };
  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, newNode: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) return insertBefore.call(this, newNode, null) as T;
    return insertBefore.call(this, newNode, ref) as T;
  };
}

function loadTranslator(): Promise<void> {
  if (loading) return loading;
  patchDomForTranslation();
  loading = new Promise<void>((resolve, reject) => {
    if (!document.getElementById("cf-gt-el")) {
      const host = document.createElement("div");
      host.id = "cf-gt-el";
      host.style.display = "none";
      document.body.appendChild(host);
    }
    const w = window as unknown as { cfGtInit?: () => void; google?: { translate: { TranslateElement: new (o: object, id: string) => unknown } } };
    w.cfGtInit = () => {
      try {
        new w.google!.translate.TranslateElement({ pageLanguage: "en", autoDisplay: false }, "cf-gt-el");
        resolve();
      } catch (e) { reject(e); }
    };
    const s = document.createElement("script");
    s.src = "https://translate.google.com/translate_a/element.js?cb=cfGtInit";
    s.async = true;
    s.onerror = () => { loading = null; reject(new Error("Translator failed to load")); };
    document.head.appendChild(s);
  });
  return loading;
}

function combo(): HTMLSelectElement | null {
  return document.querySelector("select.goog-te-combo");
}

async function waitForCombo(ms = 8000): Promise<HTMLSelectElement | null> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const c = combo();
    if (c && c.options.length > 1) return c;
    await new Promise((r) => setTimeout(r, 150));
  }
  return combo();
}

/** Apply a language now. "en" returns the page to English. */
export async function setSiteLang(code: string): Promise<void> {
  if (code === "en") {
    setCookie(null);
    // Google's "show original" isn't scriptable reliably; a reload is clean.
    location.reload();
    return;
  }
  setCookie(`/en/${code}`);
  await loadTranslator();
  const c = await waitForCombo();
  if (!c) { location.reload(); return; }
  c.value = code;
  c.dispatchEvent(new Event("change"));
}

/** On a public page: if a language was picked earlier, translate this visit too. */
export async function resumeSiteLang(): Promise<void> {
  if (getSiteLang() === "en") return;
  try { await loadTranslator(); } catch { /* stay in English */ }
}

export function translatorActive(): boolean {
  return !!loading;
}
