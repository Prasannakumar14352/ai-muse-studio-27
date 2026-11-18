// Small hand-built SVG/HTML charts: thin marks, one axis, recessive grid,
// hover tooltips, and a table fallback via the parent sections.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { rupees, shortDate, featureName, count } from "./format";

type Tip = { x: number; y: number; body: ReactNode } | null;

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return <div className="tip" style={{ left: tip.x, top: tip.y }}>{tip.body}</div>;
}

/** Daily revenue vs AI cost: grouped thin bars on one ₹ axis. */
export function RevenueCostChart({ daily }: { daily: Array<{ date: string; revenue: number; ai_cost: number }> }) {
  const [tip, setTip] = useState<Tip>(null);
  const [ref, W] = useWidth(720);
  const H = 220, L = 52, B = 26, T = 10, R = 8;
  const max = Math.max(1, ...daily.map((d) => Math.max(d.revenue, d.ai_cost)));
  const nice = niceMax(max);
  const slot = (W - L - R) / Math.max(1, daily.length);
  const bw = Math.max(2, Math.min(10, slot / 2 - 2));
  const y = (v: number) => T + (H - T - B) * (1 - v / nice);
  const ticks = [0, nice / 2, nice];
  const labelEvery = Math.ceil(daily.length / Math.max(3, Math.floor(W / 90)));

  return (
    <div className="chart-wrap" ref={ref} onMouseLeave={() => setTip(null)}>
      <div className="legend">
        <span><i style={{ background: "var(--series-1)" }} />Revenue</span>
        <span><i style={{ background: "var(--series-2)" }} />AI cost</span>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily revenue and AI cost in rupees">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="gridline" />
            <text x={L - 6} y={y(t) + 4} className="axis" textAnchor="end">{compactInr(t)}</text>
          </g>
        ))}
        {daily.map((d, i) => {
          const cx = L + slot * i + slot / 2;
          return (
            <g key={d.date}>
              <rect x={L + slot * i} y={T} width={slot} height={H - T - B} fill="transparent"
                onMouseMove={(e) => setTip({ x: e.nativeEvent.offsetX + 12, y: e.nativeEvent.offsetY - 10,
                  body: <><b>{shortDate(d.date)}</b><div>Revenue {rupees(d.revenue)}</div><div>AI cost {rupees(d.ai_cost)}</div></> })} />
              {d.revenue > 0 && <rect x={cx - bw - 1} y={y(d.revenue)} width={bw} height={Math.max(1, y(0) - y(d.revenue))} rx={Math.min(4, bw / 2)} fill="var(--series-1)" pointerEvents="none" />}
              {d.ai_cost > 0 && <rect x={cx + 1} y={y(d.ai_cost)} width={bw} height={Math.max(1, y(0) - y(d.ai_cost))} rx={Math.min(4, bw / 2)} fill="var(--series-2)" pointerEvents="none" />}
              {i % labelEvery === 0 && <text x={cx} y={H - 8} className="axis" textAnchor="middle">{shortDate(d.date)}</text>}
            </g>
          );
        })}
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="baseline" />
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/** Failures by feature × hour of day (IST), last 14 days. */
export function FailureHeatmap({ cells }: { cells: Array<{ action: string; hour: number; count: number }> }) {
  const [tip, setTip] = useState<Tip>(null);
  const actions = [...new Set(cells.map((c) => c.action))].sort();
  const max = Math.max(1, ...cells.map((c) => c.count));
  const at = new Map(cells.map((c) => [`${c.action}:${c.hour}`, c.count]));
  // One-hue sequential ramp (blue), light→dark = few→many on the dark surface.
  const ramp = ["#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"];
  const color = (n: number) => ramp[Math.min(ramp.length - 1, Math.floor((n / max) * (ramp.length - 0.001)))];
  if (!actions.length) return <p className="muted">No failed or refunded generations in the last 14 days.</p>;

  return (
    <div className="chart-wrap heat" onMouseLeave={() => setTip(null)}>
      <div className="heat-grid" style={{ gridTemplateColumns: `120px repeat(24, minmax(10px, 1fr))` }}>
        <div />
        {Array.from({ length: 24 }, (_, h) => <div key={h} className="axis heat-h">{h % 3 === 0 ? h : ""}</div>)}
        {actions.map((a) => (
          <Row key={a} label={featureName(a)}>
            {Array.from({ length: 24 }, (_, h) => {
              const n = at.get(`${a}:${h}`) ?? 0;
              return (
                <div key={h} className="heat-cell" style={{ background: n ? color(n) : undefined }}
                  onMouseMove={(e) => setTip({ x: (e.currentTarget.offsetLeft ?? 0) + 14, y: (e.currentTarget.offsetTop ?? 0) - 34,
                    body: <><b>{featureName(a)}</b><div>{String(h).padStart(2, "0")}:00–{String(h).padStart(2, "0")}:59 IST</div><div>{count(n)} failed</div></> })} />
              );
            })}
          </Row>
        ))}
      </div>
      <div className="axis heat-foot">Hour of day (IST) · darker → fewer, lighter → more failures</div>
      <Tooltip tip={tip} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <><div className="heat-label" title={label}>{label}</div>{children}</>;
}

/** Funnel as horizontal bars, each step as a share of sign-ups. */
export function Funnel({ steps }: { steps: Array<{ label: string; value: number; note?: string }> }) {
  const top = Math.max(1, steps[0]?.value ?? 1);
  return (
    <div className="funnel">
      {steps.map((s, i) => {
        const prev = i === 0 ? s.value : steps[i - 1].value;
        const conv = i === 0 || prev === 0 ? null : s.value / prev;
        return (
          <div key={s.label} className="funnel-row">
            <div className="funnel-label">{s.label}{s.note && <span className="muted"> · {s.note}</span>}</div>
            <div className="funnel-track"><div className="funnel-bar" style={{ width: `${Math.max(1.5, (s.value / top) * 100)}%` }} /></div>
            <div className="funnel-val">{count(s.value)}{conv !== null && <span className="muted"> ({Math.round(conv * 100)}%)</span>}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Tiny trend line for KPI tiles (no axes; the tile states the number). */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const W = 120, H = 28, max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - 2 - (v / max) * (H - 4)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="spark" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function niceMax(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
function compactInr(v: number): string {
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(v % 1e5 ? 1 : 0)}L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(v % 1e3 ? 1 : 0)}k`;
  return `₹${Math.round(v)}`;
}

/** Container width in px, so charts draw at 1:1 scale (text never balloons). */
function useWidth(initial: number): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
