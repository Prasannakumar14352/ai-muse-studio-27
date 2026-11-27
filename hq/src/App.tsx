import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Metrics } from "./types";
import { Dashboard } from "./Dashboard";
import { LeadsCard } from "./Leads";
import { Store, storeRevenue } from "./Store";
import { rupees } from "./format";
import { ago } from "./format";

const RANGES = [7, 30, 90] as const;
const REFRESH_MS = 5 * 60_000;

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div className="center muted">Loading…</div>;
  if (!session) return <SignIn />;
  return <Authed session={session} />;
}

function SignIn() {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="center">
      <div className="card signin">
        <img src="/icon.svg" alt="" width={56} height={56} />
        <h1>CreatorFlow HQ</h1>
        <p className="muted">Owner dashboard. Sign in with your CreatorFlow admin Google account.</p>
        <button className="primary" onClick={async () => {
          setError(null);
          const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: `${window.location.origin}/`, queryParams: { prompt: "select_account" } },
          });
          if (error) setError(error.message);
        }}>Continue with Google</button>
        {error && <p className="tone-bad small">{error}</p>}
      </div>
    </div>
  );
}

function Authed({ session }: { session: Session }) {
  const [days, setDays] = useState<number>(() => Number(localStorage.getItem("hq-days")) || 30);
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState<{ text: string; forbidden: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("hq_metrics", { p_days: days });
    setLoading(false);
    if (error) {
      setError({ text: error.message, forbidden: error.code === "42501" || /forbidden/i.test(error.message) });
      return;
    }
    setError(null);
    setM(data as Metrics);
  }, [days]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, REFRESH_MS);
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  const [section, setSection] = useState<"creatorflow" | "store">(() => (location.pathname.startsWith("/store") ? "store" : "creatorflow"));
  const go = (s: "creatorflow" | "store") => { setSection(s); history.pushState(null, "", s === "store" ? "/store" : "/"); };
  useEffect(() => {
    const onPop = () => setSection(location.pathname.startsWith("/store") ? "store" : "creatorflow");
    window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop);
  }, []);
  const [store, setStore] = useState<{ today: number; range: number; month: number } | null>(null);
  useEffect(() => { void storeRevenue(days).then(setStore).catch(() => setStore(null)); }, [days, m]);

  const meta = session.user.user_metadata as { full_name?: string; name?: string };
  const firstName = (meta.full_name ?? meta.name ?? "").split(" ")[0] || null;

  if (error?.forbidden) {
    return (
      <div className="center">
        <div className="card signin">
          <h1>Not authorised</h1>
          <p className="muted">{session.user.email} isn't a CreatorFlow admin.</p>
          <button onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <nav className="top">
        <div className="brand"><img src="/icon.svg" alt="" width={28} height={28} /><b>ProdXStore HQ</b>
          <div className="seg sections" role="group" aria-label="Section">
            <button className={section === "creatorflow" ? "on" : ""} aria-pressed={section === "creatorflow"} onClick={() => go("creatorflow")}>CreatorFlow AI</button>
            <button className={section === "store" ? "on" : ""} aria-pressed={section === "store"} onClick={() => go("store")}>Store</button>
          </div>
        </div>
        <div className="controls">
          <div className="seg" role="group" aria-label="Date range">
            {RANGES.map((r) => (
              <button key={r} aria-pressed={days === r} className={days === r ? "on" : ""}
                onClick={() => { setDays(r); localStorage.setItem("hq-days", String(r)); }}>{r}d</button>
            ))}
          </div>
          <button onClick={() => void load()} disabled={loading} title="Refresh">{loading ? "…" : "↻"}</button>
          <span className="muted small updated">{m ? `Updated ${ago(m.generated_at)}` : ""}</span>
          <button className="ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </nav>
      {error && <div className="alert">Couldn't load the numbers: {error.text}</div>}
      {!m && !error && <div className="center muted">Loading numbers…</div>}
      {m && <RevenueStrip cfToday={m.kpis.today.revenue} cfRange={m.totals.revenue_range} cfMonth={m.totals.mtd_revenue} store={store} days={days} />}
      {section === "creatorflow" && m && <Dashboard m={m} name={firstName} />}
      {section === "creatorflow" && m && <main className="grid"><LeadsCard days={days} /></main>}
      {section === "store" && <Store days={days} />}
      <footer className="muted small">Live from the ProdXStore database · refreshes every 5 minutes · times in IST</footer>
    </div>
  );
}

/** One revenue view across the businesses: CreatorFlow AI subscriptions/credits + ProdXStore store sales. */
function RevenueStrip({ cfToday, cfRange, cfMonth, store, days }: {
  cfToday: number; cfRange: number; cfMonth: number; store: { today: number; range: number; month: number } | null; days: number;
}) {
  const s = store ?? { today: 0, range: 0, month: 0 };
  const rows = [
    { label: "Today", total: cfToday + s.today, cf: cfToday, st: s.today },
    { label: `Last ${days} days`, total: cfRange + s.range, cf: cfRange, st: s.range },
    { label: "This month", total: cfMonth + s.month, cf: cfMonth, st: s.month },
  ];
  return (
    <section className="tiles revenue-strip" aria-label="All revenue">
      {rows.map((r) => (
        <div className="tile" key={r.label}>
          <span className="muted small">All revenue · {r.label}</span>
          <span className="hero">{rupees(r.total)}</span>
          <span className="small muted">CreatorFlow {rupees(r.cf)} · Store {store ? rupees(r.st) : "…"}</span>
        </div>
      ))}
    </section>
  );
}
