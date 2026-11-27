/** Parse object URLs only for the configured Storage origin. */
export function ownedPublishObject(raw: string, origin: string, userId: string) {
  try {
    const url = new URL(raw);
    if (url.origin !== new URL(origin).origin) return null;
    const match = /^\/storage\/v1\/object\/(?:sign|public|authenticated)\/renders\/(.+)$/.exec(
      url.pathname,
    );
    if (!match) return null;
    const parts = decodeURIComponent(match[1]).split("/");
    if (
      parts[0] !== userId ||
      parts.some((part) => !part || part === "." || part === ".." || part.includes("\\"))
    )
      return null;
    return parts.join("/");
  } catch {
    return null;
  }
}

export const publishImageMime = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
