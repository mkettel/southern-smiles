import assert from "node:assert/strict";
import test from "node:test";
import { safeNextPath } from "@/lib/auth-redirect";
import {
  RECOVERY_SESSION_WINDOW_SECONDS,
  decideResetAuthority,
  encodeSpentResetToken,
  exactMatches,
  hasLookupWildcard,
  hasRecentRecoveryAuth,
  isMisroutedRecoveryLink,
  isPlausibleTokenHash,
  parseSpentResetToken,
  resolveRequestOrigin,
} from "@/lib/password-reset";
import {
  emailAddressSchema,
  newPasswordSchema,
  passwordResetRequestSchema,
} from "@/lib/validators";

const NOW = 1_800_000_000;
const TOKEN = "pkce_0123456789abcdef0123456789abcdef0123456789abcdef01234567";

test("a session from a just-followed reset link may set a new password", () => {
  assert.equal(hasRecentRecoveryAuth([{ method: "recovery", timestamp: NOW - 5 }], NOW), true);
  assert.equal(hasRecentRecoveryAuth([{ method: "otp", timestamp: NOW - 5 }], NOW), true);
});

test("an ordinary password login never counts as a recovery session", () => {
  assert.equal(hasRecentRecoveryAuth([{ method: "password", timestamp: NOW }], NOW), false);
  assert.equal(
    hasRecentRecoveryAuth(
      [
        { method: "password", timestamp: NOW },
        { method: "totp", timestamp: NOW },
      ],
      NOW
    ),
    false
  );
});

test("a recovery session stops qualifying once the window has passed", () => {
  const edge = NOW - RECOVERY_SESSION_WINDOW_SECONDS;
  assert.equal(hasRecentRecoveryAuth([{ method: "recovery", timestamp: edge }], NOW), true);
  assert.equal(hasRecentRecoveryAuth([{ method: "recovery", timestamp: edge - 1 }], NOW), false);
  // An old recovery followed by a fresh password login is still not a recovery.
  assert.equal(
    hasRecentRecoveryAuth(
      [
        { method: "recovery", timestamp: edge - 1 },
        { method: "password", timestamp: NOW },
      ],
      NOW
    ),
    false
  );
});

test("recovery checks fail closed on unrecognised amr claims", () => {
  assert.equal(hasRecentRecoveryAuth(undefined, NOW), false);
  assert.equal(hasRecentRecoveryAuth(null, NOW), false);
  assert.equal(hasRecentRecoveryAuth("recovery", NOW), false);
  assert.equal(hasRecentRecoveryAuth(["recovery", "otp"], NOW), false);
  assert.equal(hasRecentRecoveryAuth([{ method: "recovery" }], NOW), false);
  assert.equal(hasRecentRecoveryAuth([{ method: "recovery", timestamp: "now" }], NOW), false);
  assert.equal(hasRecentRecoveryAuth([{ method: "recovery", timestamp: NaN }], NOW), false);
  assert.equal(hasRecentRecoveryAuth([null, 7], NOW), false);
  // Far-future timestamps are not trusted; small clock skew is.
  assert.equal(hasRecentRecoveryAuth([{ method: "recovery", timestamp: NOW + 3600 }], NOW), false);
  assert.equal(hasRecentRecoveryAuth([{ method: "recovery", timestamp: NOW + 30 }], NOW), true);
});

test("the reset link returns to the host the visitor is on", () => {
  assert.equal(
    resolveRequestOrigin({ origin: "https://ssmiles.survivalboard.org", host: "ignored.example" }),
    "https://ssmiles.survivalboard.org"
  );
  assert.equal(
    resolveRequestOrigin({ origin: "http://localhost:3000", host: "localhost:3000" }),
    "http://localhost:3000"
  );
  // A path or trailing slash on Origin never leaks into the link.
  assert.equal(
    resolveRequestOrigin({ origin: "https://survivalboard.org/login?x=1" }),
    "https://survivalboard.org"
  );
});

test("the origin falls back to host headers when Origin is unusable", () => {
  assert.equal(resolveRequestOrigin({ origin: "null", host: "localhost:3000" }), "http://localhost:3000");
  assert.equal(resolveRequestOrigin({ host: "survivalboard.org" }), "https://survivalboard.org");
  assert.equal(
    resolveRequestOrigin({
      origin: "javascript:alert(1)",
      host: "internal:3000",
      forwardedHost: "SSmiles.survivalboard.org, proxy.internal",
      forwardedProto: "https, http",
    }),
    "https://ssmiles.survivalboard.org"
  );
  assert.equal(
    resolveRequestOrigin({ host: "127.0.0.1:3000", forwardedProto: "http" }),
    "http://127.0.0.1:3000"
  );
});

test("a malformed host yields no origin rather than a broken link", () => {
  assert.equal(resolveRequestOrigin({}), null);
  assert.equal(resolveRequestOrigin({ host: "" }), null);
  assert.equal(resolveRequestOrigin({ host: "evil.com/path" }), null);
  assert.equal(resolveRequestOrigin({ host: "user@evil.com" }), null);
  assert.equal(resolveRequestOrigin({ host: "a b.com" }), null);
});

test("reset tokens must look like tokens", () => {
  assert.equal(isPlausibleTokenHash(TOKEN), true);
  assert.equal(isPlausibleTokenHash("0123456789abcdef0123456789abcdef0123456789abcdef01234567"), true);
  assert.equal(isPlausibleTokenHash(""), false);
  assert.equal(isPlausibleTokenHash(null), false);
  assert.equal(isPlausibleTokenHash(undefined), false);
  assert.equal(isPlausibleTokenHash("short"), false);
  assert.equal(isPlausibleTokenHash(`${TOKEN}&type=invite`), false);
  assert.equal(isPlausibleTokenHash("a".repeat(257)), false);
});

test("a reset link that fell back to the site root is recognised", () => {
  const recovery = new URLSearchParams({ token_hash: TOKEN, type: "recovery" });
  assert.equal(isMisroutedRecoveryLink("/", recovery), true);
  assert.equal(isMisroutedRecoveryLink("/login", recovery), true);
  // Already in the right place, or somewhere unrelated: leave it alone.
  assert.equal(isMisroutedRecoveryLink("/reset-password/update", recovery), false);
  assert.equal(isMisroutedRecoveryLink("/dashboard", recovery), false);
  // Other link types and incomplete links are not ours to forward.
  assert.equal(
    isMisroutedRecoveryLink("/", new URLSearchParams({ token_hash: TOKEN, type: "invite" })),
    false
  );
  assert.equal(isMisroutedRecoveryLink("/", new URLSearchParams({ token_hash: TOKEN })), false);
  assert.equal(isMisroutedRecoveryLink("/", new URLSearchParams({ type: "recovery" })), false);
  assert.equal(isMisroutedRecoveryLink("/", new URLSearchParams()), false);
});

test("account lookups never widen beyond an exact match", () => {
  const rows = [
    { username: "j_smith", email: "a@example.com" },
    { username: "jxsmith", email: "b@example.com" },
    { username: "J_Smith ", email: "c@example.com" },
    { username: null, email: "d@example.com" },
  ];
  assert.deepEqual(
    exactMatches(rows, "username", "j_smith").map((row) => row.email),
    ["a@example.com", "c@example.com"]
  );
  assert.deepEqual(exactMatches(rows, "email", "B@Example.com"), [rows[1]]);
  assert.deepEqual(exactMatches(rows, "username", "nobody"), []);
  assert.deepEqual(exactMatches(rows, "username", "   "), []);
  assert.deepEqual(exactMatches(null, "username", "j_smith"), []);

  assert.equal(hasLookupWildcard("%"), true);
  assert.equal(hasLookupWildcard("j*"), true);
  assert.equal(hasLookupWildcard("j\\smith"), true);
  assert.equal(hasLookupWildcard("j_smith"), false);
  assert.equal(hasLookupWildcard("jane.doe-2"), false);
});

test("post-login redirects stay on this site", () => {
  assert.equal(safeNextPath("/reset-password/update"), "/reset-password/update");
  assert.equal(safeNextPath("/stats?week=2026-11-09#top"), "/stats?week=2026-11-09#top");
  assert.equal(safeNextPath(null), "/dashboard");
  assert.equal(safeNextPath(""), "/dashboard");
  assert.equal(safeNextPath("dashboard"), "/dashboard");
  assert.equal(safeNextPath("@evil.com"), "/dashboard");
  assert.equal(safeNextPath(".evil.com"), "/dashboard");
  assert.equal(safeNextPath("//evil.com"), "/dashboard");
  assert.equal(safeNextPath("/\\evil.com"), "/dashboard");
  assert.equal(safeNextPath("/\t/evil.com"), "/dashboard");
  assert.equal(safeNextPath("https://evil.com/x"), "/dashboard");
  assert.equal(safeNextPath("//evil.com", "/login"), "/login");
  // Dot segments must not be able to rebuild a protocol-relative URL.
  assert.equal(safeNextPath("/..//evil.com"), "/dashboard");
  assert.equal(safeNextPath("/.//evil.com"), "/dashboard");
  assert.equal(safeNextPath("/%2e%2e//evil.com"), "/dashboard");
  assert.equal(safeNextPath("/a/../..//evil.com/x?y=1"), "/dashboard");
  assert.equal(safeNextPath("/a/../stats"), "/stats");
});

const LESLEY = "11111111-1111-4111-8111-111111111111";
const EVELIS = "22222222-2222-4222-8222-222222222222";
const DIGEST = "a".repeat(64);
const OTHER_DIGEST = "b".repeat(64);

test("a fresh emailed token is always verified, whoever is signed in", () => {
  const base = { tokenHash: TOKEN, tokenDigest: DIGEST, expectedUserId: null };
  assert.deepEqual(
    decideResetAuthority({ ...base, spent: null, recoveryUserId: null }),
    { kind: "verify-token" }
  );
  // Someone else's recovery session in this browser changes nothing: the
  // token is verified, never swapped for "whoever is signed in".
  assert.deepEqual(
    decideResetAuthority({ ...base, spent: null, recoveryUserId: EVELIS }),
    { kind: "verify-token" }
  );
  // A spent-token note for a different token does not apply either.
  assert.deepEqual(
    decideResetAuthority({
      ...base,
      spent: { digest: OTHER_DIGEST, userId: EVELIS },
      recoveryUserId: EVELIS,
    }),
    { kind: "verify-token" }
  );
});

test("a token this browser already spent continues only on its own account's session", () => {
  const base = {
    tokenHash: TOKEN,
    tokenDigest: DIGEST,
    spent: { digest: DIGEST, userId: LESLEY },
    expectedUserId: null,
  };
  assert.deepEqual(decideResetAuthority({ ...base, recoveryUserId: LESLEY }), {
    kind: "session",
    userId: LESLEY,
  });
  // The session was replaced by another person's, or is no longer a recovery
  // session: the spent token must not unlock it.
  assert.deepEqual(decideResetAuthority({ ...base, recoveryUserId: EVELIS }), { kind: "reject" });
  assert.deepEqual(decideResetAuthority({ ...base, recoveryUserId: null }), { kind: "reject" });
});

test("malformed tokens are rejected before anything else is considered", () => {
  assert.deepEqual(
    decideResetAuthority({
      tokenHash: "short",
      tokenDigest: DIGEST,
      spent: { digest: DIGEST, userId: LESLEY },
      recoveryUserId: LESLEY,
      expectedUserId: LESLEY,
    }),
    { kind: "reject" }
  );
  assert.deepEqual(
    decideResetAuthority({
      tokenHash: TOKEN,
      tokenDigest: null,
      spent: null,
      recoveryUserId: LESLEY,
      expectedUserId: LESLEY,
    }),
    { kind: "reject" }
  );
});

test("without a token, only the recovery session the form was shown for may continue", () => {
  const base = { tokenHash: null, tokenDigest: null, spent: null };
  assert.deepEqual(
    decideResetAuthority({ ...base, recoveryUserId: LESLEY, expectedUserId: LESLEY }),
    { kind: "session", userId: LESLEY }
  );
  // No recovery session (e.g. an ordinary password login): refused.
  assert.deepEqual(
    decideResetAuthority({ ...base, recoveryUserId: null, expectedUserId: LESLEY }),
    { kind: "reject" }
  );
  // The session changed to someone else's after the form was rendered.
  assert.deepEqual(
    decideResetAuthority({ ...base, recoveryUserId: EVELIS, expectedUserId: LESLEY }),
    { kind: "reject" }
  );
  // The form did not say which account it was for.
  assert.deepEqual(
    decideResetAuthority({ ...base, recoveryUserId: LESLEY, expectedUserId: null }),
    { kind: "reject" }
  );
  // A spent-token note alone authorises nothing.
  assert.deepEqual(
    decideResetAuthority({
      ...base,
      spent: { digest: DIGEST, userId: LESLEY },
      recoveryUserId: null,
      expectedUserId: LESLEY,
    }),
    { kind: "reject" }
  );
});

test("the spent-token cookie round-trips and ignores junk", () => {
  const value = { digest: DIGEST, userId: LESLEY };
  assert.deepEqual(parseSpentResetToken(encodeSpentResetToken(value)), value);
  assert.equal(parseSpentResetToken(undefined), null);
  assert.equal(parseSpentResetToken(""), null);
  assert.equal(parseSpentResetToken(`${DIGEST}.`), null);
  assert.equal(parseSpentResetToken(`${DIGEST.slice(1)}.${LESLEY}`), null);
  assert.equal(parseSpentResetToken(`${DIGEST}.${LESLEY}.extra`), null);
  assert.equal(parseSpentResetToken(`${DIGEST.toUpperCase()}.${LESLEY}`), null);
});

test("reset request and new password validation", () => {
  assert.equal(passwordResetRequestSchema.safeParse({ identifier: "  odalis  " }).data?.identifier, "odalis");
  assert.equal(passwordResetRequestSchema.safeParse({ identifier: "   " }).success, false);
  assert.equal(passwordResetRequestSchema.safeParse({ identifier: "a".repeat(255) }).success, false);

  assert.equal(emailAddressSchema.safeParse("lesley@example.com").success, true);
  assert.equal(emailAddressSchema.safeParse("lesley@").success, false);
  assert.equal(emailAddressSchema.safeParse("a@b@c.com").success, false);

  const ok = newPasswordSchema.safeParse({ password: "correct horse", confirmPassword: "correct horse" });
  assert.equal(ok.success, true);

  const short = newPasswordSchema.safeParse({ password: "short", confirmPassword: "short" });
  assert.equal(short.success, false);
  assert.equal(short.error?.issues[0]?.message, "Password must be at least 8 characters");

  const long = newPasswordSchema.safeParse({ password: "a".repeat(73), confirmPassword: "a".repeat(73) });
  assert.equal(long.error?.issues[0]?.message, "Password must be 72 characters or less");

  const mismatch = newPasswordSchema.safeParse({ password: "correct horse", confirmPassword: "correct hors" });
  assert.equal(mismatch.error?.issues[0]?.message, "Passwords don't match");
});
