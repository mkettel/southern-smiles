import type { createClient } from "@/lib/supabase/server";
import { hasRecentRecoveryAuth } from "@/lib/password-reset";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The signed-in session, but only if it was established by following an
 * emailed reset link a short while ago. That is the one case where a new
 * password may be set without supplying the current one.
 *
 * getClaims() verifies the access token (signature check, or a round trip to
 * the auth server for legacy symmetric keys), so the `amr` claim it returns
 * cannot be forged from the browser. Returns null for anything else.
 */
export async function getRecoverySession(
  supabase: ServerSupabaseClient
): Promise<{ userId: string; email: string | null } | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) return null;

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!hasRecentRecoveryAuth(data.claims.amr, nowSeconds)) return null;

    const userId = data.claims.sub;
    if (typeof userId !== "string" || !userId) return null;

    const email = data.claims.email;
    return { userId, email: typeof email === "string" && email ? email : null };
  } catch {
    return null;
  }
}
