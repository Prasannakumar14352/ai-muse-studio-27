import { useEffect, useRef } from "react";
import type { ResearchPrefill } from "./research-prefill";

/**
 * Fires `run` exactly once when a research handoff with `autogen: true` is
 * present. Destination modules use this to auto-trigger their existing
 * generation entry point after prefill has hydrated their form/state.
 *
 * The delay lets React commit the prefilled state to the DOM before the
 * generation call reads it. `handoff` is captured by ref so re-renders
 * that don't change the underlying handoff don't re-fire.
 */
export function useAutogen(handoff: Pick<ResearchPrefill, "autogen"> | null, run: () => void, delayMs = 250) {
  const firedRef = useRef(false);
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (firedRef.current) return;
    if (!handoff?.autogen) return;
    firedRef.current = true;
    const id = setTimeout(() => runRef.current(), delayMs);
    return () => clearTimeout(id);
  }, [handoff, delayMs]);
}
