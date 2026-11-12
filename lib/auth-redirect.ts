const DEFAULT_NEXT_PATH = "/dashboard";
const PLACEHOLDER_ORIGIN = "http://internal.invalid";

/**
 * Reduce a caller-supplied `next` value to a same-site path. Anything that
 * could send the browser to another origin ("//evil.com", "@evil.com",
 * "/\evil.com", absolute URLs) falls back to the default instead.
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback: string = DEFAULT_NEXT_PATH
): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  // Backslashes are treated as slashes by browsers; control characters are
  // stripped by URL parsers. Neither belongs in an in-app path.
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return fallback;

  try {
    const url = new URL(next, PLACEHOLDER_ORIGIN);
    if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;
    // Dot segments are resolved by the parser ("/..//evil.com" -> "//evil.com"),
    // so the protocol-relative check has to be repeated on the result.
    if (url.pathname.startsWith("//")) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
