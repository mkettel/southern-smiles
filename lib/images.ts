/**
 * Fetch a remote image URL and return it as a base64 data URL.
 * Used so @react-pdf/renderer embeds images deterministically instead of
 * depending on a runtime network fetch during PDF rendering.
 * Returns null on any failure (caller should fall back gracefully).
 */
export async function toDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/png";
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
