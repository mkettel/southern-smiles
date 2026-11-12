import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResetLinkInvalid } from "@/components/auth/reset-link-invalid";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { RESET_UPDATE_PATH, isPlausibleTokenHash } from "@/lib/password-reset";
import { getRecoverySession } from "@/lib/recovery-session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
  // The reset token rides in this page's URL; never hand it to another site.
  referrer: "no-referrer",
};

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

/**
 * Where the emailed reset link lands. Opening this page never spends the
 * link: the token is only verified when the visitor submits a new password
 * (see completePasswordReset), so mail scanners that pre-fetch links are
 * harmless.
 */
export default async function ResetPasswordUpdatePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const code = single(params.code);
  const tokenHash = single(params.token_hash);
  const type = single(params.type);

  // Supabase's stock email template sends a one-time code instead of a token
  // hash. Only a route handler can turn that into a session cookie.
  if (code) {
    const query = new URLSearchParams({ code, next: RESET_UPDATE_PATH });
    redirect(`/api/auth/callback?${query.toString()}`);
  }

  // Supabase (expired stock link) or our callback (failed exchange) said no.
  if (params.error || params.error_code) {
    return <ResetLinkInvalid />;
  }

  if (tokenHash !== undefined) {
    if ((type !== undefined && type !== "recovery") || !isPlausibleTokenHash(tokenHash)) {
      return <ResetLinkInvalid />;
    }
    return <ResetPasswordForm tokenHash={tokenHash} accountId={null} email={null} />;
  }

  // No token in the URL: only a browser that followed a reset link moments
  // ago may continue. A normal signed-in session does not qualify.
  const supabase = await createClient();
  const recovery = await getRecoverySession(supabase);
  if (!recovery) {
    return <ResetLinkInvalid />;
  }

  return (
    <ResetPasswordForm
      tokenHash={null}
      accountId={recovery.userId}
      email={recovery.email}
    />
  );
}
