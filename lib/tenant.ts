export const PRIMARY_DOMAIN =
  process.env.NEXT_PUBLIC_PRIMARY_DOMAIN?.trim().toLowerCase() ||
  "survivalboard.org";

const RESERVED_SUBDOMAINS = new Set(["app", "api", "admin", "www"]);

export function normalizeOrgSlug(value: string | null | undefined) {
  const slug = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (!slug) return "";
  if (slug.length > 63) return "";
  if (RESERVED_SUBDOMAINS.has(slug)) return "";

  return slug;
}

export function getOrgSlugFromHost(host: string | null | undefined) {
  if (!host) return "";

  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  const suffix = `.${PRIMARY_DOMAIN}`;

  if (!hostname.endsWith(suffix)) return "";

  const subdomain = hostname.slice(0, -suffix.length);
  if (!subdomain || subdomain.includes(".")) return "";

  return normalizeOrgSlug(subdomain);
}

export function isPrimaryDomainHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === PRIMARY_DOMAIN || host === `www.${PRIMARY_DOMAIN}`;
}

export function isLocalHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}
