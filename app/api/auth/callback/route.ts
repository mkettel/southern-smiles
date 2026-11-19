import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth-redirect";
import { RESET_UPDATE_PATH } from "@/lib/password-reset";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // `next` comes from the URL, so keep it to a path on this site.
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // A reset link that can't be exchanged (expired, already used, or opened in
  // a different browser than the one that asked for it) goes back to the
  // reset page, which explains what happened and offers a fresh link.
  if (next === RESET_UPDATE_PATH) {
    return NextResponse.redirect(`${origin}${RESET_UPDATE_PATH}?error=link_invalid`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
