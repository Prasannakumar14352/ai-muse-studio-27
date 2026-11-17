/**
 * Pages temporarily hidden from users (code kept so they can come back).
 * Hidden pages disappear from the sidebar, command palette and dashboard
 * shortcuts, and opening them by URL redirects to the dashboard.
 *
 * To bring a page back: remove its path from this list.
 *
 *   /marketplace  — no items to sell yet
 *   /agents       — thin wrapper over the same text AI as AI Strategy
 *   /promo-videos — overlaps with Video studio and Model Studio
 */
export const HIDDEN_PATHS: readonly string[] = ["/marketplace", "/agents", "/promo-videos"];

/**
 * Connected Accounts (/connections) shows in the sidebar only once an admin
 * has set up at least one social app (Admin → Social Publishing). Admins
 * always see it. The page itself stays reachable and explains what's missing.
 */
export const CONNECTIONS_PATH = "/connections";

export function isHiddenPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return HIDDEN_PATHS.some((h) => p === h || p.startsWith(`${h}/`));
}
