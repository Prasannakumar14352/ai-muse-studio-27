// Landing growth sections: the "by hand vs CreatorFlow" pain section and the
// "50 faceless video ideas" lead magnet (email → unlock the list).
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Clock, Gift, Loader2, X, Sparkles } from "lucide-react";
import { submitLandingLead } from "@/lib/landing-leads.functions";

/* ---------------- Pain: by hand vs CreatorFlow ---------------- */

const BY_HAND = [
  "Research a topic and write the script",
  "Record your voice — again and again",
  "Hunt for visuals and stock clips",
  "Edit, cut and sync everything",
  "Type captions and design a thumbnail",
  "Upload and fill in title, tags, description",
];
const WITH_CF = [
  "Type one idea (or paste your script)",
  "AI writes the script in your language",
  "AI voice in Telugu, Hindi, English + more",
  "Visuals, captions and music added for you",
  "Review every scene before credits are spent",
  "Download, or schedule straight to YouTube",
];

export function PainSection() {
  return (
    <section className="px-4 sm:px-6 py-16">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-5xl font-bold">
            One video shouldn't take <span className="gradient-text">your whole evening</span>
          </h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            Most creators quit because every faceless video takes hours of work. CreatorFlow does
            the slow parts for you.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <div className="glass rounded-2xl p-6 border border-red-500/20">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-300">
              <Clock className="w-4 h-4" /> By hand — usually hours per video
            </div>
            <ul className="mt-4 space-y-3">
              {BY_HAND.map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <X className="w-4 h-4 mt-0.5 shrink-0 text-red-400" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="glass rounded-2xl p-6 border border-primary/40 shadow-[var(--shadow-glow)]">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Sparkles className="w-4 h-4" /> With CreatorFlow — minutes of choosing
            </div>
            <ul className="mt-4 space-y-3">
              {WITH_CF.map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 mt-0.5 shrink-0 text-primary" /> {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-8 text-center">
          <Link
            to="/auth"
            className="inline-flex items-center gap-1 rounded-xl gradient-primary px-7 py-3.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)] hover:brightness-110 transition"
          >
            Make my first video free · 50 credits
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Lead magnet: 50 faceless video ideas ---------------- */

const IDEAS: { niche: string; items: string[] }[] = [
  {
    niche: "Telugu moral stories",
    items: [
      "The greedy merchant and the honest farmer",
      "Why the crow drank the water — a modern retelling",
      "A grandmother's samethalu, explained in 60 seconds",
      "The king who listened to a child",
      "Three friends and one mango tree",
    ],
  },
  {
    niche: "Devotional & mythology",
    items: [
      "The story behind Sankranti in 60 seconds",
      "5 lessons from the Bhagavad Gita for students",
      "Why Hanuman is called Chiranjeevi",
      "The meaning of Om, simply explained",
      "Temple stories from Andhra & Telangana",
    ],
  },
  {
    niche: "Personal finance (India)",
    items: [
      "SIP vs FD explained with a chai example",
      "5 money mistakes in your first job",
      "What is an emergency fund — and how much?",
      "UPI safety tips your parents need",
      "How credit card interest really works",
    ],
  },
  {
    niche: "Tech & AI tips",
    items: [
      "3 free AI tools every student should know",
      "Write a resume with AI in 5 minutes",
      "Phone settings that save battery",
      "How to spot a scam message",
      "ChatGPT prompts for small shop owners",
    ],
  },
  {
    niche: "Kids learning",
    items: [
      "Telugu alphabet song with animals",
      "Count to 10 with fruits",
      "Why is the sky blue? — for kids",
      "Good habits story: brushing teeth",
      "Planets of the solar system in 1 minute",
    ],
  },
  {
    niche: "Healthy habits (general tips)",
    items: [
      "5 morning habits for more energy",
      "Why drinking water first thing helps",
      "Simple desk stretches for office workers",
      "Sleep tips for night-shift workers",
      "Healthy Indian breakfast ideas",
    ],
  },
  {
    niche: "History & facts",
    items: [
      "The story of the Kohinoor diamond",
      "Who built Golconda Fort?",
      "5 inventions from ancient India",
      "Why trains in India run on the left",
      "The history of biryani",
    ],
  },
  {
    niche: "Motivation & stoicism",
    items: [
      "Lessons from APJ Abdul Kalam's life",
      "Stop comparing — a 60-second story",
      "Discipline vs motivation",
      "How to restart after failing an exam",
      "One habit that changes your year",
    ],
  },
  {
    niche: "Small business & shops",
    items: [
      "Show 5 products in 30 seconds",
      "Behind the scenes of your shop",
      "Festival offer announcement video",
      "Customer question of the week",
      "How we pack your order",
    ],
  },
  {
    niche: "Career & jobs",
    items: [
      "Top 5 interview questions and answers",
      "How to answer 'tell me about yourself'",
      "Skills companies want in 2026",
      "Freelancing for beginners in India",
      "Write a cold email that gets replies",
    ],
  },
];

function utmFromUrl(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    const v = p.get(k);
    if (v) out[k] = v.slice(0, 100);
  }
  return out;
}

export function LeadMagnetSection() {
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [language, setLanguage] = useState<"en" | "te" | "hi" | "other">("te");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unlocked, setUnlocked] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await submitLandingLead({
        data: { email, whatsapp, language, website, utm: utmFromUrl() },
      });
      if (r.ok) setUnlocked(true);
      else setError(r.message ?? "Please try again.");
    } catch {
      setError("Please check your email and WhatsApp number.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="free-ideas" className="px-4 sm:px-6 py-16 scroll-mt-20">
      <div className="max-w-5xl mx-auto glass rounded-3xl p-6 sm:p-10 border border-primary/30">
        {!unlocked ? (
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                <Gift className="w-3.5 h-3.5" /> Free
              </div>
              <h2 className="mt-3 text-3xl md:text-4xl font-bold">
                50 faceless video ideas that work in India
              </h2>
              <p className="mt-3 text-muted-foreground">
                Ready-to-use topics in 10 niches — moral stories, devotional, finance, tech, kids
                and more. Pick one and make it in CreatorFlow in minutes.
              </p>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email"
                className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm"
              />
              <input
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="WhatsApp number (optional)"
                className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm"
              />
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as typeof language)}
                className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm"
                aria-label="Language you make videos in"
              >
                <option value="te">I make videos in Telugu</option>
                <option value="hi">I make videos in Hindi</option>
                <option value="en">I make videos in English</option>
                <option value="other">Another language</option>
              </select>
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="hidden"
                aria-hidden="true"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl gradient-primary px-6 py-3 text-sm font-semibold text-white shadow-[var(--shadow-glow)] hover:brightness-110 transition inline-flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send me the 50 ideas
              </button>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <p className="text-[11px] text-muted-foreground">
                No spam. We'll only send creator tips and offers — unsubscribe anytime.
              </p>
            </form>
          </div>
        ) : (
          <div>
            <h2 className="text-2xl md:text-3xl font-bold">
              Here are your 50 faceless video ideas 🎉
            </h2>
            <p className="mt-2 text-muted-foreground">
              Pick one and turn it into a video now — your first one is free with 50 credits.
            </p>
            <div className="mt-6 grid sm:grid-cols-2 gap-5">
              {IDEAS.map((g) => (
                <div key={g.niche} className="rounded-2xl border border-border/60 p-4">
                  <div className="font-semibold">{g.niche}</div>
                  <ol className="mt-2 list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
                    {g.items.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link
                to="/auth"
                className="inline-flex rounded-xl gradient-primary px-7 py-3.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)]"
              >
                Make my first video free →
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
