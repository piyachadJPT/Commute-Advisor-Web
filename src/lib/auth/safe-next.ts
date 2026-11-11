/**
 * Post-sign-in redirect target. Only same-origin, absolute paths are allowed, so a crafted
 * `?next=` can never send a signed-in user to another site (open redirect).
 */
export function safeNext(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (!value || value.length > 2048) return fallback;
  // Must be a path: "/x". Reject "//host" and "/\host" (browsers treat both as another origin),
  // any scheme, control characters and backslashes.
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const url = new URL(value, "http://localhost");
    if (url.origin !== "http://localhost") return fallback;
    // Never bounce back to the login page itself.
    if (url.pathname === "/login") return fallback;
    const normalised = `${url.pathname}${url.search}`;
    // Dot segments can normalise a harmless-looking path into "//host" ("/.//host" → "//host").
    // Check the normalised result too, since that is what ends up in the Location header.
    if (normalised.startsWith("//")) return fallback;
    return normalised;
  } catch {
    return fallback;
  }
}
