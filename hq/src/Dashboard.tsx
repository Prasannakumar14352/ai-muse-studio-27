import type { ReactNode } from "react";
import type { Metrics, DayKpi } from "./types";
import { rupees, count, pct, delta, featureName, ago } from "./format";
import { RevenueCostChart, FailureHeatmap, Funnel, Sparkline } from "./charts";

export function Dashboard({ m, name }: { m: Metrics; name: string | null }) {
  return (
    <main className="grid">
      <FounderCard m={m} name={name} />
      <TodayRow m={m} />
      <Money m={m} />
      <FeatureProfit m={m} />
      <section className="two">
        <HotLeads m={m} />
        <ChurnRadar m={m} />
      </section>
      <Health m={m} />
      <Payments m={m} />
      <Support m={m} />
      <Growth m={m} />
    </main>
  );
}

function Card({ title, sub, children, className }: { title: string; sub?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className ?? ""}`}>
      <header><h2>{title}</h2>{sub && <span className="muted small">{sub}</span>}</header>
      {children}
    </section>
  );
}

// ---- 14. Founder card: three plain sentences, computed (no AI cost). ----
function FounderCard({ m, name }: { m: Metrics; name: string | null }) {
  const lines: Array<{ tone: "good" | "warn" | "bad" | "info"; text: string }> = [];
  const { today, yesterday, last_week, last_week_yesterday } = m.kpis;
  const y = delta(yesterday.revenue, last_week_yesterday.revenue);
  lines.push({
    tone: yesterday.revenue > 0 ? "good" : "info",
    text: `${rupees(yesterday.revenue)} yesterday${yesterday.revenue || last_week_yesterday.revenue ? ` (${y.text} vs same day last week)` : ""} · ${rupees(today.revenue)} so far today${last_week.revenue ? ` vs ${rupees(last_week.revenue)} last ${weekday(last_week.date)}` : ""}.`,
  });
  const leads = m.hot_leads.length, churn = m.churn_risk.length;
  lines.push({
    tone: leads ? "good" : churn ? "warn" : "info",
    text: [leads ? `${leads} hot lead${leads > 1 ? "s" : ""} ready to buy` : "No hot leads right now", churn ? `${churn} subscription${churn > 1 ? "s" : ""} at risk` : null].filter(Boolean).join(" · ") + ".",
  });
  const ph = m.payments_health;
  const topErr = m.failure_errors[0];
  if (ph.webhook_errors > 0) {
    const e = ph.webhook_recent_errors[0]?.error;
    lines.push({ tone: "bad", text: `Razorpay webhooks failing (${count(ph.webhook_errors)} of ${count(ph.webhook_total)})${e ? `: ${e}` : ""}. Renewals and late payments won't be credited until this is fixed.` });
  } else if (topErr && topErr.c >= 3) {
    lines.push({ tone: "warn", text: `${featureName(topErr.action)} failed ${topErr.c}× in 14 days (${topErr.error}). Credits were refunded — check the provider.` });
  } else if (m.support.waiting_now > 0) {
    lines.push({ tone: "warn", text: `${m.support.waiting_now} support ${m.support.waiting_now > 1 ? "replies are" : "reply is"} waiting for your approval in Agent HQ.` });
  } else {
    lines.push({ tone: "good", text: "No payment or generation problems detected." });
  }
  return (
    <section className="card founder">
      <h1>Good {greeting()}{name ? `, ${name}` : ""}</h1>
      <ul>{lines.map((l, i) => <li key={i} className={`tone-${l.tone}`}>{l.text}</li>)}</ul>
    </section>
  );
}

// ---- 3. Today vs same weekday last week. ----
function TodayRow({ m }: { m: Metrics }) {
  const { today, last_week } = m.kpis;
  const series = (k: keyof Omit<DayKpi, "date">) => m.daily.slice(-14).map((d) => (d as unknown as Record<string, number>)[k] ?? 0);
  const tiles: Array<{ label: string; now: number; before: number; fmt: (v: number) => string; spark: number[] }> = [
    { label: "Revenue today", now: today.revenue, before: last_week.revenue, fmt: rupees, spark: series("revenue") },
    { label: "Sign-ups today", now: today.signups, before: last_week.signups, fmt: count, spark: series("signups") },
    { label: "Generations today", now: today.generations, before: last_week.generations, fmt: count, spark: series("generations") },
    { label: "Payments today", now: today.payments, before: last_week.payments, fmt: count, spark: [] },
  ];
  return (
    <section className="tiles">
      {tiles.map((t) => {
        const d = delta(t.now, t.before);
        return (
          <div key={t.label} className="tile">
            <div className="muted small">{t.label}</div>
            <div className="hero">{t.fmt(t.now)}</div>
            <div className={`delta ${d.dir}`} title={`Same day last week: ${t.fmt(t.before)}`}>
              {d.dir === "up" ? "▲" : d.dir === "down" ? "▼" : "•"} {d.text} <span className="muted">vs last {weekday(last_week.date)}</span>
            </div>
            <Sparkline values={t.spark} />
          </div>
        );
      })}
    </section>
  );
}

// ---- 1 + 2. True profit and month-end forecast. ----
function Money({ m }: { m: Metrics }) {
  const t = m.totals;
  const profit = t.revenue_range - t.ai_cost_range;
  const margin = t.revenue_range > 0 ? profit / t.revenue_range : null;
  const projected = t.day_of_month > 0 ? (t.mtd_revenue / t.day_of_month) * t.days_in_month : 0;
  return (
    <Card title="Money" sub={`Last ${m.days} days · AI cost = credits used × ${rupees(m.cost_per_credit_inr)}`} className="wide">
      <div className="stats">
        <Stat label="Revenue" value={rupees(t.revenue_range)} />
        <Stat label="AI provider cost" value={rupees(t.ai_cost_range)} hint={t.admin_ai_cost_range ? `${rupees(t.admin_ai_cost_range)} of it is your own testing` : undefined} />
        <Stat label="True profit" value={rupees(profit)} tone={profit >= 0 ? "good" : "bad"} hint={margin !== null ? `${pct(margin)} margin` : "no revenue yet"} />
        <Stat label="This month so far" value={rupees(t.mtd_revenue)} hint={`Day ${t.day_of_month} of ${t.days_in_month}`} />
        <Stat label="Projected month-end" value={rupees(projected)} hint="at the current daily pace" />
        <Stat label="Paying users" value={`${count(t.paying_users)} / ${count(t.users)}`} hint={`${count(t.active_subscriptions)} active subscription${t.active_subscriptions === 1 ? "" : "s"}`} />
      </div>
      <RevenueCostChart daily={m.daily} />
    </Card>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) {
  return (
    <div className="stat">
      <div className="muted small">{label}</div>
      <div className={`stat-v ${tone ? `tone-${tone}` : ""}`}>{value}</div>
      {hint && <div className="muted small">{hint}</div>}
    </div>
  );
}

// ---- 4. Feature profit table (customers only). ----
function FeatureProfit({ m }: { m: Metrics }) {
  const rows = m.features.filter((f) => f.runs + f.failures > 0);
  return (
    <Card title="Feature profit" sub="Customers only, last period · revenue = credits charged × average pack price per credit" className="wide">
      {!rows.length ? <p className="muted">No customer usage in this period yet.</p> : (
        <div className="table-scroll">
          <table>
            <thead><tr><th>Feature</th><th className="num">Runs</th><th className="num">Credits charged</th><th className="num">Revenue</th><th className="num">AI cost</th><th className="num">Profit</th><th className="num">Failure rate</th></tr></thead>
            <tbody>
              {rows.map((f) => {
                const p = f.revenue_inr - f.cost_inr;
                const fr = f.runs + f.failures ? f.failures / (f.runs + f.failures) : 0;
                return (
                  <tr key={f.action}>
                    <td>{featureName(f.action)}{p < 0 && <span className="badge bad">underpriced</span>}</td>
                    <td className="num">{count(f.runs)}</td>
                    <td className="num">{count(f.credits_charged)}</td>
                    <td className="num">{rupees(f.revenue_inr)}</td>
                    <td className="num">{rupees(f.cost_inr)}</td>
                    <td className={`num tone-${p >= 0 ? "good" : "bad"}`}>{rupees(p)}</td>
                    <td className={`num ${fr >= 0.2 ? "tone-bad" : ""}`}>{pct(fr)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---- 5. Hot leads. ----
function HotLeads({ m }: { m: Metrics }) {
  return (
    <Card title="Hot leads" sub="Active in the last 14 days and low on credits">
      {!m.hot_leads.length ? <p className="muted">Nobody is close to running out right now.</p> : (
        <table>
          <thead><tr><th>User</th><th className="num">Credits left</th><th>Last active</th></tr></thead>
          <tbody>{m.hot_leads.map((l) => (
            <tr key={l.email}>
              <td><a href={`mailto:${l.email}`}>{l.email}</a><div className="muted small">{l.reason}{l.paid_total ? ` · paid ${rupees(l.paid_total)}` : ""}</div></td>
              <td className="num">{count(l.credits)}</td>
              <td>{ago(l.last_active)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </Card>
  );
}

// ---- 6. Churn radar. ----
function ChurnRadar({ m }: { m: Metrics }) {
  return (
    <Card title="Churn radar" sub="Payment problems, auto-renew off, or renewing within 7 days">
      {!m.churn_risk.length ? <p className="muted">No subscriptions at risk.</p> : (
        <table>
          <thead><tr><th>User</th><th>Why</th><th>Renews</th></tr></thead>
          <tbody>{m.churn_risk.map((c) => (
            <tr key={c.email}>
              <td><a href={`mailto:${c.email}`}>{c.email}</a><div className="muted small">{c.plan_name ?? "—"}</div></td>
              <td><span className={`badge ${c.reason === "payment problem" ? "bad" : "warn"}`}>{c.reason}</span></td>
              <td>{c.renews_at || c.expires_at ? new Date((c.renews_at ?? c.expires_at)!).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </Card>
  );
}

// ---- 11. Failure heatmap + top errors. ----
function Health({ m }: { m: Metrics }) {
  return (
    <Card title="Generation failures" sub="Failed or refunded, last 14 days" className="wide">
      <FailureHeatmap cells={m.failures} />
      {m.failure_errors.length > 0 && (
        <table className="compact">
          <thead><tr><th>Feature</th><th>Error</th><th className="num">Times</th><th>Last</th></tr></thead>
          <tbody>{m.failure_errors.map((e, i) => (
            <tr key={i}><td>{featureName(e.action)}</td><td><code>{e.error}</code></td><td className="num">{count(e.c)}</td><td>{ago(e.last_at)}</td></tr>
          ))}</tbody>
        </table>
      )}
    </Card>
  );
}

// ---- 12. Payment health. ----
function Payments({ m }: { m: Metrics }) {
  const p = m.payments_health;
  return (
    <Card title="Payment health" sub={`Last ${m.days} days`} className="wide">
      {p.webhook_errors > 0 && (
        <div className="alert">
          <b>⚠ Razorpay webhooks are failing</b> — {count(p.webhook_errors)} of {count(p.webhook_total)} rejected.
          {p.webhook_recent_errors[0] && <> Latest: <code>{p.webhook_recent_errors[0].error || `HTTP ${p.webhook_recent_errors[0].http_status}`}</code> ({ago(p.webhook_recent_errors[0].created_at)}).</>}
          <div className="small">Fix: copy the webhook secret from Razorpay → Settings → Webhooks into CreatorFlow → Admin → Payment Settings.</div>
        </div>
      )}
      <div className="stats">
        <Stat label="Successful" value={count(p.success)} tone="good" />
        <Stat label="Unfinished checkouts" value={count(p.pending)} hint="opened Razorpay, didn't pay" />
        <Stat label="Failed" value={count(p.failed)} tone={p.failed ? "bad" : undefined} />
        <Stat label="Webhooks OK" value={`${count(p.webhook_total - p.webhook_errors)} / ${count(p.webhook_total)}`} tone={p.webhook_errors ? "bad" : "good"} />
      </div>
      {p.stuck.length > 0 && (
        <>
          <h3>Abandoned checkouts (older than 1 hour) — worth a follow-up</h3>
          <table className="compact">
            <thead><tr><th>User</th><th>Pack / plan</th><th className="num">Amount</th><th>When</th></tr></thead>
            <tbody>{p.stuck.map((s, i) => (
              <tr key={i}><td>{s.email ? <a href={`mailto:${s.email}`}>{s.email}</a> : "—"}</td><td>{s.pack_id ?? "—"}</td><td className="num">{rupees(s.inr)}</td><td>{ago(s.created_at)}</td></tr>
            ))}</tbody>
          </table>
        </>
      )}
    </Card>
  );
}

// ---- 13. Support pulse. ----
function Support({ m }: { m: Metrics }) {
  const s = m.support;
  const sum = (o: Record<string, number>) => Object.entries(o).filter(([k]) => k !== "chat").reduce((a, [, v]) => a + v, 0);
  const total = sum(s.telegram) + sum(s.in_app);
  const solved = total ? Math.min(1, s.answered_by_agent / total) : null;
  return (
    <Card title="Support pulse" sub={`Telegram + in-app chat, last ${m.days} days`} className="wide">
      <div className="stats">
        <Stat label="Questions" value={count(total)} hint={`${count(sum(s.telegram))} Telegram · ${count(sum(s.in_app))} in-app`} />
        <Stat label="Solved by the bot" value={solved === null ? "—" : pct(solved)} hint={`${count(s.answered_by_agent)} answered without you`} />
        <Stat label="Waiting for you" value={count(s.waiting_now)} tone={s.waiting_now ? "bad" : undefined} />
        <Stat label="Open bugs" value={count(s.open_bugs)} />
        <Stat label="Agent AI cost (month)" value={`$${s.agent_cost_usd_month.toFixed(2)}`} />
      </div>
      {s.top_questions.length > 0 && (
        <>
          <h3>Latest questions this week</h3>
          <ul className="questions">{s.top_questions.map((q, i) => (
            <li key={i}><span className="badge">{q.channel}</span> {q.text.length > 140 ? `${q.text.slice(0, 140)}…` : q.text} <span className="muted small">{ago(q.created_at)}</span></li>
          ))}</ul>
        </>
      )}
    </Card>
  );
}

// ---- 7 + 8. Funnel and sources (tracking starts with this release). ----
function Growth({ m }: { m: Metrics }) {
  const f = m.funnel;
  const since = f.tracking_since ? new Date(f.tracking_since).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
  return (
    <section className="two">
      <Card title="Funnel" sub="All customers (your own account excluded)">
        <Funnel steps={[
          { label: "Signed up", value: f.signed_up },
          { label: "First generation", value: f.first_generation },
          { label: "Ran out of credits", value: f.ran_out },
          { label: "Opened pricing", value: f.opened_pricing, note: since ? `tracked since ${since}` : "tracking just started" },
          { label: "Paid", value: f.paid },
        ]} />
      </Card>
      <Card title="Where users come from" sub={since ? `Tracked since ${since}` : "Starts filling with new sign-ups"}>
        {!m.sources.length ? (
          <p className="muted">No tracked sign-ups yet. Add <code>?utm_source=instagram</code> (or youtube, meta_ads…) to the links you post so each channel is counted exactly.</p>
        ) : (
          <table>
            <thead><tr><th>Source</th><th className="num">Sign-ups</th><th className="num">Paying</th><th className="num">Revenue</th></tr></thead>
            <tbody>{m.sources.map((s) => (
              <tr key={s.source}><td>{s.source}</td><td className="num">{count(s.signups)}</td><td className="num">{count(s.paying)}</td><td className="num">{rupees(s.revenue)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </section>
  );
}

function weekday(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long" });
}
function greeting() {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
