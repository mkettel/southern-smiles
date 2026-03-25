import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service role key.
 * BYPASSES ALL RLS POLICIES — use only for admin operations
 * like creating users, practices, and cross-tenant operations.
 *
 * NEVER expose this client or its key to the browser.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
