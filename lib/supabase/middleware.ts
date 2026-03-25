import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Clean up stale chunked cookies that cause 431 errors.
  // Supabase splits large tokens into chunks (sb-*-auth-token.0, .1, etc.)
  // Old chunks can accumulate and bloat headers.
  const allCookies = request.cookies.getAll();
  const authCookieNames = new Set<string>();
  const chunkPattern = /^(sb-.*-auth-token)\.(\d+)$/;

  for (const cookie of allCookies) {
    const match = cookie.name.match(chunkPattern);
    if (match) {
      authCookieNames.add(match[1]);
    }
  }

  // Remove any orphaned chunk cookies beyond what Supabase just set
  const setCookieNames = new Set(
    supabaseResponse.headers
      .getSetCookie()
      .map((c) => c.split("=")[0])
  );

  for (const cookie of allCookies) {
    const match = cookie.name.match(chunkPattern);
    if (match && !setCookieNames.has(cookie.name)) {
      // Check if supabase set ANY chunks for this base name
      const baseName = match[1];
      const supabaseSetThis = [...setCookieNames].some((n) =>
        n.startsWith(baseName)
      );
      if (supabaseSetThis) {
        // Supabase refreshed this token but with fewer chunks — delete the extra
        supabaseResponse.cookies.delete(cookie.name);
      }
    }
  }

  // Redirect unauthenticated users to login (except for auth pages)
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/signup") &&
    !request.nextUrl.pathname.startsWith("/reset-password") &&
    !request.nextUrl.pathname.startsWith("/api/auth")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  if (user && (request.nextUrl.pathname.startsWith("/login") || request.nextUrl.pathname.startsWith("/signup"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
