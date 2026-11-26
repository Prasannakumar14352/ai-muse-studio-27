// Landing-page leads ("50 faceless video ideas" form). Read directly from public.landing_leads
// with the admin's session — RLS lets only admins read it. Includes a CSV download.
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { ago, count } from "./format";

type Lead = {
  id: string;
  email: string;
  name: string | null;
  whatsapp: string | null;
  language: string;
  source: string;
  utm: Record<string, string> | null;
  created_at: string;
};

const LANG: Record<string, string> = { en: "English", te: "Telugu", hi: "Hindi", other: "Other" };
const PAGE = 1000;

/** wa.me needs the country code; a bare 10-digit number is treated as Indian (+91). */
function waNumber(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.length === 10 ? `91${d}` : d;
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  // Quote everything and neutralise spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

async function fetchAll(): Promise<Lead[]> {
  const out: Lead[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("landing_leads")
      .select("id,email,name,whatsapp,language,source,utm,created_at")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Lead[]));
    if (!data || data.length < PAGE) return out;
  }
}

export function LeadsCard({ days }: { days: number }) {
  const [rows, setRows] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    void supabase
      .from("landing_leads")
      .select("id,email,name,whatsapp,language,source,utm,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setError(error.message);
        else setRows((data ?? []) as Lead[]);
      });
    return () => {
      alive = false;
    };
  }, [days]);

  const download = async () => {
    setBusy(true);
    try {
      const all = await fetchAll();
      const header = ["Date (IST)", "Email", "WhatsApp", "Language", "Source", "UTM source", "UTM medium", "UTM campaign", "UTM content"];
      const lines = all.map((l) =>
        [
          new Date(l.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          l.email,
          l.whatsapp,
          LANG[l.language] ?? l.language,
          l.source,
          l.utm?.utm_source,
          l.utm?.utm_medium,
          l.utm?.utm_campaign,
          l.utm?.utm_content,
        ]
          .map(csvCell)
          .join(","),
      );
      const blob = new Blob(["﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `creatorflow-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const by = (key: (l: Lead) => string) => {
    const m = new Map<string, number>();
    for (const l of rows ?? []) m.set(key(l), (m.get(key(l)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const langs = by((l) => LANG[l.language] ?? l.language);
  const sources = by((l) => l.utm?.utm_source || "direct");
  const withWa = (rows ?? []).filter((l) => l.whatsapp).length;

  return (
    <section className="card">
      <header>
        <h2>Landing leads</h2>
        <span className="muted small">"50 faceless video ideas" form · last {days} days</span>
      </header>
      {error ? (
        <p className="tone-bad small">Couldn't load leads: {error}</p>
      ) : !rows ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <p>
            <b>{count(rows.length)}</b> new lead{rows.length === 1 ? "" : "s"}
            {rows.length > 0 && (
              <span className="muted">
                {" "}· {count(withWa)} with WhatsApp · {langs.map(([k, v]) => `${k} ${v}`).join(", ")} · from{" "}
                {sources.slice(0, 4).map(([k, v]) => `${k} ${v}`).join(", ")}
              </span>
            )}
          </p>
          {rows.length === 0 ? (
            <p className="muted">No leads in this period yet.</p>
          ) : (
            <table className="compact">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>WhatsApp</th>
                  <th>Language</th>
                  <th>From</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 25).map((l) => (
                  <tr key={l.id}>
                    <td>
                      <a href={`mailto:${l.email}`}>{l.email}</a>
                    </td>
                    <td>{l.whatsapp ? <a href={`https://wa.me/${waNumber(l.whatsapp)}`} target="_blank" rel="noreferrer">{l.whatsapp}</a> : "—"}</td>
                    <td>{LANG[l.language] ?? l.language}</td>
                    <td>{l.utm?.utm_source || "direct"}</td>
                    <td>{ago(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {rows.length > 25 && <p className="muted small">Showing the newest 25. Download the CSV for all of them.</p>}
          <button onClick={download} disabled={busy}>{busy ? "Preparing…" : "Download all leads (CSV)"}</button>
        </>
      )}
    </section>
  );
}
