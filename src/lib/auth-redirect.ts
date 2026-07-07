const DEFAULT_AUTH_REDIRECT = "/dashboard";
const AUTH_ROUTES = ["/auth", "/auth-callback"];

export function getSafeAuthRedirect(value: unknown, fallback = DEFAULT_AUTH_REDIRECT) {
  if (typeof window === "undefined") return fallback;
  if (typeof value !== "string" || value.trim().length === 0) return fallback;

  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;

    const path = `${url.pathname}${url.search}${url.hash}`;
    if (!path.startsWith("/") || path.startsWith("//")) return fallback;
    if (AUTH_ROUTES.some((route) => path === route || path.startsWith(`${route}?`))) {
      return fallback;
    }

    return path;
  } catch {
    return fallback;
  }
}

export function getAuthCallbackUrl(next?: unknown) {
  const safeNext = getSafeAuthRedirect(next);
  return `${window.location.origin}/auth-callback?next=${encodeURIComponent(safeNext)}`;
}

export function redirectToSafePath(next?: unknown) {
  window.location.replace(getSafeAuthRedirect(next));
}