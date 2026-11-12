import { isLocalHost } from "@/lib/tenant";

/**
 * Pure helpers for the password reset flow. No DB or network calls here, so
 * the proxy, server actions, and tests can all share them.
 *
 * Flow overview (see docs/password-reset.md):
 *   /reset-password            enter username/email, we ask Supabase to email a link
 *   /reset-password/update     opened from the email, choose a new password
 *   /reset-password/done       confirmation, signed in with the new password
 */

export const RESET_REQUEST_PATH = "/reset-password";
export const RESET_UPDATE_PATH = "/reset-password/update";
export const RESET_DONE_PATH = "/reset-password/done";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

/**
 * How long after following a reset link a browser may still set a new
 * password without re-opening the email. Only matters when the link was
 * already exchanged for a session (see hasRecentRecoveryAuth).
 */
export const RECOVERY_SESSION_WINDOW_SECONDS = 30 * 60;

/** Tolerance for the auth server's clock running slightly ahead of ours. */
const CLOCK_SKEW_SECONDS = 60;

/**
 * Sign-in methods that prove the session came from an emailed link:
 * - "recovery": the reset link was exchanged through the PKCE code flow.
 * - "otp": the reset link's token hash was verified directly.
 * Password logins record "password", so an ordinary signed-in session never
 * qualifies and still has to supply the current password to change it.
 */
const EMAIL_LINK_AUTH_METHODS = new Set(["recovery", "otp"]);

/**
 * True when the session's `amr` claim shows it was established from an
 * emailed link within the recovery window. Fails closed on anything it does
 * not recognise (missing claim, RFC 8176 string form without timestamps).
 */
export function hasRecentRecoveryAuth(amr: unknown, nowSeconds: number): boolean {
  if (!Array.isArray(amr)) return false;

  return amr.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const { method, timestamp } = entry as {
      method?: unknown;
      timestamp?: unknown;
    };
    if (typeof method !== "string" || !EMAIL_LINK_AUTH_METHODS.has(method)) {
      return false;
    }
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
      return false;
    }
    const age = nowSeconds - timestamp;
    return age >= -CLOCK_SKEW_SECONDS && age <= RECOVERY_SESSION_WINDOW_SECONDS;
  });
}

function firstHeaderValue(value: string | null | undefined) {
  return value?.split(",")[0]?.trim() ?? "";
}

/**
 * The public origin (scheme + host) the visitor is using, so the emailed link
 * brings them back to the same practice host. Supabase still checks the final
 * URL against its redirect allow list, which is what actually stops a forged
 * host from receiving a reset link.
 */
export function resolveRequestOrigin(input: {
  origin?: string | null;
  host?: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
}): string | null {
  const rawOrigin = input.origin?.trim();
  if (rawOrigin) {
    try {
      const url = new URL(rawOrigin);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.origin;
      }
    } catch {
      // Fall through to the Host header ("null" and other opaque origins).
    }
  }

  const host = firstHeaderValue(input.forwardedHost) || firstHeaderValue(input.host);
  if (!host || !/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return null;

  const hostname = host.split(":")[0] ?? "";
  const forwardedProto = firstHeaderValue(input.forwardedProto).toLowerCase();
  const protocol =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : isLocalHost(hostname)
        ? "http"
        : "https";

  return `${protocol}://${host.toLowerCase()}`;
}

/** Reset-link tokens are short URL-safe strings; reject anything else early. */
export function isPlausibleTokenHash(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,256}$/.test(value);
}

/**
 * A reset link that landed on the wrong page. Happens when the practice host
 * is missing from Supabase's redirect allow list: Supabase swaps the link's
 * destination for the bare Site URL, so the token arrives at "/" (or "/login"
 * after the unauthenticated redirect) instead of the update page.
 */
export function isMisroutedRecoveryLink(
  pathname: string,
  searchParams: URLSearchParams
): boolean {
  if (pathname !== "/" && pathname !== "/login") return false;
  return (
    searchParams.get("type") === "recovery" &&
    isPlausibleTokenHash(searchParams.get("token_hash"))
  );
}

/**
 * Username / email lookups use ILIKE for case-insensitivity, which also
 * treats "_" as a wildcard and (through PostgREST) "*" and "%" as
 * match-anything. Skip the lookup entirely for the match-anything characters.
 */
export function hasLookupWildcard(value: string): boolean {
  return /[%*\\]/.test(value);
}

/**
 * Narrow ILIKE results back down to exact case-insensitive matches, so a
 * "_" in the identifier can never select a neighbouring account.
 */
export function exactMatches<T extends Record<string, unknown>>(
  rows: readonly T[] | null | undefined,
  field: keyof T,
  value: string
): T[] {
  const target = value.trim().toLowerCase();
  if (!target) return [];
  return (rows ?? []).filter((row) => {
    const candidate = row[field];
    return typeof candidate === "string" && candidate.trim().toLowerCase() === target;
  });
}

/**
 * Cookie that remembers "this browser already spent reset token X for account
 * Y". It lets a retry (rejected password, reload, re-clicked email link) carry
 * on with the session that token created instead of dead-ending on a token
 * that can't be verified twice. It grants nothing by itself: the session still
 * has to be a recent recovery session for that same account.
 */
export const RESET_SPENT_COOKIE = "pw_reset_spent";

export type SpentResetToken = { digest: string; userId: string };

export function encodeSpentResetToken(value: SpentResetToken): string {
  return `${value.digest}.${value.userId}`;
}

export function parseSpentResetToken(
  raw: string | null | undefined
): SpentResetToken | null {
  const match = /^([a-f0-9]{64})\.([0-9a-fA-F-]{36})$/.exec(raw ?? "");
  return match ? { digest: match[1], userId: match[2] } : null;
}

export type ResetAuthority =
  /** Verify the emailed token now; it has not been used by this browser. */
  | { kind: "verify-token" }
  /** Rely on the recovery session already held for this account. */
  | { kind: "session"; userId: string }
  | { kind: "reject" };

/**
 * Decide what, if anything, authorises setting a new password.
 *
 * - A token this browser has not spent must be verified. It is never backed
 *   up by "whoever is signed in": on a shared computer that could be someone
 *   else's session.
 * - A token this browser already spent continues on the recovery session, but
 *   only if that session belongs to the account the token verified.
 * - With no token, the recovery session must belong to the account the form
 *   was rendered for, so a session swapped in another tab can't be hit.
 */
export function decideResetAuthority(input: {
  tokenHash: string | null;
  /** SHA-256 hex digest of tokenHash, computed by the caller. */
  tokenDigest: string | null;
  spent: SpentResetToken | null;
  /** Account of the current session, if it is a recent recovery session. */
  recoveryUserId: string | null;
  /** Account the no-token form was rendered for. */
  expectedUserId: string | null;
}): ResetAuthority {
  const { tokenHash, tokenDigest, spent, recoveryUserId, expectedUserId } = input;

  if (tokenHash !== null) {
    if (!isPlausibleTokenHash(tokenHash) || !tokenDigest) return { kind: "reject" };
    if (spent && spent.digest === tokenDigest) {
      return recoveryUserId && recoveryUserId === spent.userId
        ? { kind: "session", userId: recoveryUserId }
        : { kind: "reject" };
    }
    return { kind: "verify-token" };
  }

  if (recoveryUserId && expectedUserId && recoveryUserId === expectedUserId) {
    return { kind: "session", userId: recoveryUserId };
  }
  return { kind: "reject" };
}
