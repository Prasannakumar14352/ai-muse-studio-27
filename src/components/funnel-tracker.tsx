// Invisible: sends signup attribution once, and logs the funnel steps the HQ
// dashboard needs ("opened pricing", "ran out of credits").
import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { readFirstTouch } from "@/lib/attribution";
import { recordAttribution, trackFunnelEvent } from "@/lib/tracking.functions";

const SENT_KEY = "cf_attr_sent_v1";

export function FunnelTracker() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const attrFn = useServerFn(recordAttribution);
  const eventFn = useServerFn(trackFunnelEvent);
  const lastPricing = useRef<string | null>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(SENT_KEY)) return;
      const t = readFirstTouch();
      void attrFn({ data: {
        source: t?.source ?? "direct", medium: t?.medium ?? null, campaign: t?.campaign ?? null,
        referrer: t?.referrer ?? null, landing_path: t?.landing_path ?? null,
      } }).then((r) => { if (r.ok) window.localStorage.setItem(SENT_KEY, "1"); }).catch(() => {});
    } catch { /* ignore */ }
  }, [attrFn]);

  useEffect(() => {
    if (!/^\/(billing|pricing)/.test(pathname) || lastPricing.current === pathname) return;
    lastPricing.current = pathname;
    void eventFn({ data: { event: "pricing_view", meta: { path: pathname } } }).catch(() => {});
  }, [pathname, eventFn]);

  useEffect(() => {
    const onGate = () => { void eventFn({ data: { event: "credits_exhausted" } }).catch(() => {}); };
    window.addEventListener("cf:credit-gate", onGate);
    return () => window.removeEventListener("cf:credit-gate", onGate);
  }, [eventFn]);

  return null;
}
