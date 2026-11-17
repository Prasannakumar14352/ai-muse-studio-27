/**
 * Pages temporarily hidden from users (code kept so they can come back).
 * Hidden pages disappear from the sidebar, command palette and dashboard
 * shortcuts, and opening them by URL redirects to the dashboard.
 *
 * To bring a page back: remove its path from this list.
 *
 *   /marketplace  — no items to sell yet
 *   /agents       — thin wrapper over the same text AI as AI Strategy
 *   /connections  — needs your own Google/Meta/LinkedIn developer apps first
 *   /promo-videos — overlaps with Video studio and Model Studio
 */
export const HIDDEN_PATHS: readonly string[] = ["/marketplace", "/agents", "/connections", "/promo-videos"];

export function isHiddenPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return HIDDEN_PATHS.some((h) => p === h || p.startsWith(`${h}/`));
}
