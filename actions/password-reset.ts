"use server";

import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeOrgSlug } from "@/lib/tenant";
import {
  RECOVERY_SESSION_WINDOW_SECONDS,
  RESET_DONE_PATH,
  RESET_REQUEST_PATH,
  RESET_SPENT_COOKIE,
  RESET_UPDATE_PATH,
  decideResetAuthority,
  encodeSpentResetToken,
  exactMatches,
  hasLookupWildcard,
  parseSpentResetToken,
  resolveRequestOrigin,
} from "@/lib/password-reset";
import { getRecoverySession } from "@/lib/recovery-session";
import {
  emailAddressSchema,
  newPasswordSchema,
  passwordResetRequestSchema,
} from "@/lib/validators";

const GENERIC_FAILURE = "Something went wrong. Please try again.";
const LINK_INVALID =
  "This reset link is invalid or has expired. Request a new one to continue.";
const TOO_MANY_ATTEMPTS = "Too many attempts. Wait a minute, then try again.";

/** Where the sign-in page shows "password updated, sign in again". */
const LOGIN_AFTER_RESET_PATH = "/login?reset=success";

export type RequestPasswordResetResult = { success: true } | { error: string };

export type CompletePasswordResetResult =
  | {
      success: true;
      /** Same-site path to send the browser to next. */
      next: string;
    }
  | {
      error: string;
      /** The link can't be used any more; the visitor needs a fresh one. */
      linkInvalid?: boolean;
    };

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Work out which email address (if any) should receive the reset link.
 * Mirrors the lookup rules in `login`. Returns null for "send nothing":
 * no match, an ambiguous username, or an account an admin has deactivated
 * (changing its password is how a deactivated employee is locked out, so a
 * self-service reset must not undo that).
 */
async function resolveResetEmail(
  admin: AdminClient,
  identifier: string,
  practiceId: string | null
): Promise<string | null> {
  if (hasLookupWildcard(identifier)) return null;

  const column = identifier.includes("@") ? "email" : "username";
  let query = admin
    .from("profiles")
    .select("email, username, is_active")
    .ilike(column, identifier);
  if (practiceId) query = query.eq("practice_id", practiceId);

  const { data, error } = await query.limit(10);
  if (error) throw new Error(`profile lookup failed: ${error.message}`);

  // Usernames are only unique per practice. With no organization to scope by,
  // a username shared across practices is ambiguous, so nothing is sent.
  const matches = exactMatches(data, column, identifier);
  if (matches.length !== 1) return null;

  const profile = matches[0];
  if (profile.is_active === false) return null;

  return typeof profile.email === "string" && profile.email.trim()
    ? profile.email.trim()
    : null;
}

/**
 * Step 1: email a reset link.
 *
 * Once the input is well formed the visitor always sees the same "check your
 * email" answer, matched account or not, and delivery problems are logged
 * rather than shown. That keeps the form from casually confirming who has an
 * account. It is not a hardened guarantee: a matched request does extra work
 * (and sets a short-lived flow cookie), and sign-in itself already reports
 * unknown usernames.
 */
export async function requestPasswordReset(
  formData: FormData
): Promise<RequestPasswordResetResult> {
  const parsed = passwordResetRequestSchema.safeParse({
    identifier: String(formData.get("identifier") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_FAILURE };
  }
  const identifier = parsed.data.identifier;

  const rawOrganization = String(formData.get("organization") ?? "").trim();
  const organization = normalizeOrgSlug(rawOrganization);
  if (rawOrganization && !organization) {
    return { error: "Enter a valid organization" };
  }

  if (identifier.includes("@") && !emailAddressSchema.safeParse(identifier).success) {
    return { error: "Enter a valid email address" };
  }

  const headerStore = await headers();
  const origin = resolveRequestOrigin({
    origin: headerStore.get("origin"),
    host: headerStore.get("host"),
    forwardedHost: headerStore.get("x-forwarded-host"),
    forwardedProto: headerStore.get("x-forwarded-proto"),
  });
  if (!origin) return { error: GENERIC_FAILURE };

  let email: string | null;
  try {
    const admin = createAdminClient();
    let practiceId: string | null = null;

    if (organization) {
      // Organization names are already public (the login page shows the
      // practice name for a subdomain), so a typo here gets a real error.
      const { data: practice, error: practiceError } = await admin
        .from("practices")
        .select("id")
        .eq("slug", organization)
        .eq("is_active", true)
        .maybeSingle();

      if (practiceError) throw new Error(`practice lookup failed: ${practiceError.message}`);
      if (!practice) return { error: "No organization found with that name" };
      practiceId = practice.id;
    }

    email = await resolveResetEmail(admin, identifier, practiceId);
  } catch (error) {
    console.error("[password-reset] could not resolve account:", error);
    return { error: GENERIC_FAILURE };
  }

  if (email) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}${RESET_UPDATE_PATH}`,
      });
      if (error) {
        // Deliberately not shown to the visitor: rate limits and delivery
        // failures only happen for real accounts. The address is never logged.
        console.error(
          "[password-reset] Supabase declined to send the recovery email:",
          error.status,
          error.code ?? error.message
        );
      }
    } catch (error) {
      console.error("[password-reset] recovery email request threw:", error);
    }
  }

  return { success: true };
}

function describePasswordUpdateError(error: {
  code?: string;
  status?: number;
  message: string;
}): { error: string; linkInvalid?: boolean } {
  if (error.code === "same_password") {
    return { error: "Your new password must be different from your current password." };
  }
  if (error.code === "weak_password") {
    return { error: error.message };
  }
  if (error.status === 429) {
    return { error: TOO_MANY_ATTEMPTS };
  }
  if (error.status === 401 || error.status === 403) {
    // The recovery session ended (signed out elsewhere, or revoked).
    return { error: LINK_INVALID, linkInvalid: true };
  }
  if (error.status === 400 || error.status === 422) {
    return { error: error.message };
  }
  return { error: GENERIC_FAILURE };
}

function digestToken(tokenHash: string) {
  return createHash("sha256").update(tokenHash).digest("hex");
}

/**
 * Step 2: set the new password.
 *
 * What authorises it is decided by `decideResetAuthority` (lib/password-reset):
 * a fresh emailed token, or the recovery session that token (or the stock
 * email's code exchange) already created for the same account. The token is
 * only spent here, on submit, never when the page is merely opened, so mail
 * scanners that pre-fetch links can't burn it.
 *
 * On success the recovery session is replaced by an ordinary password
 * sign-in, so the "no current password needed" window closes immediately
 * instead of lingering on a shared computer.
 */
export async function completePasswordReset(
  formData: FormData
): Promise<CompletePasswordResetResult> {
  // Taken as FormData rather than a plain object so the password never shows
  // up in Next's dev-server log of server function arguments.
  const field = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };

  const parsed = newPasswordSchema.safeParse({
    password: field("password"),
    confirmPassword: field("confirm_password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_FAILURE };
  }
  const { password } = parsed.data;
  const tokenHash = field("token_hash") || null;
  const expectedUserId = field("account") || null;

  try {
    const cookieStore = await cookies();
    const supabase = await createClient();
    const recovery = await getRecoverySession(supabase);

    const authority = decideResetAuthority({
      tokenHash,
      tokenDigest: tokenHash ? digestToken(tokenHash) : null,
      spent: parseSpentResetToken(cookieStore.get(RESET_SPENT_COOKIE)?.value),
      recoveryUserId: recovery?.userId ?? null,
      expectedUserId,
    });

    if (authority.kind === "reject") {
      return { error: LINK_INVALID, linkInvalid: true };
    }

    if (authority.kind === "verify-token" && tokenHash) {
      const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
        type: "recovery",
        token_hash: tokenHash,
      });
      if (verifyError) {
        if (verifyError.status === 429) return { error: TOO_MANY_ATTEMPTS };
        if (!verifyError.status || verifyError.status >= 500) {
          return { error: GENERIC_FAILURE };
        }
        return { error: LINK_INVALID, linkInvalid: true };
      }
      // Without a session for the token's account, the update below would
      // act on whoever was already signed in. Never continue in that state.
      if (!verified.session || !verified.user) {
        console.error("[password-reset] token verified without a session");
        return { error: GENERIC_FAILURE };
      }

      // Remember the spent token so a retry continues on this session.
      cookieStore.set(
        RESET_SPENT_COOKIE,
        encodeSpentResetToken({
          digest: digestToken(tokenHash),
          userId: verified.user.id,
        }),
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: RESET_REQUEST_PATH,
          maxAge: RECOVERY_SESSION_WINDOW_SECONDS,
        }
      );
    }

    const { data: updated, error: updateError } = await supabase.auth.updateUser({
      password,
    });
    if (updateError) return describePasswordUpdateError(updateError);

    // The password is changed. Nothing below may report failure.
    cookieStore.delete({ name: RESET_SPENT_COOKIE, path: RESET_REQUEST_PATH });

    // Swap the recovery session for a normal password sign-in, then end every
    // other session (the recovery one included): whoever knew the old password
    // shouldn't stay signed in anywhere.
    let signedInWithPassword = false;
    const email = updated.user?.email;
    try {
      if (email) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        signedInWithPassword = !signInError;
        if (signInError) {
          console.error(
            "[password-reset] sign-in with the new password failed:",
            signInError.status,
            signInError.code ?? signInError.message
          );
        }
      }
    } catch (error) {
      console.error("[password-reset] sign-in with the new password threw:", error);
    }

    try {
      const { error: signOutError } = await supabase.auth.signOut({
        scope: signedInWithPassword ? "others" : "global",
      });
      if (signOutError) {
        console.error("[password-reset] could not end sessions:", signOutError.message);
      }
    } catch (error) {
      console.error("[password-reset] could not end sessions:", error);
    }

    return {
      success: true,
      next: signedInWithPassword ? RESET_DONE_PATH : LOGIN_AFTER_RESET_PATH,
    };
  } catch (error) {
    console.error("[password-reset] completing the reset failed:", error);
    return { error: GENERIC_FAILURE };
  }
}
