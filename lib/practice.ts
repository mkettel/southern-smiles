import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Get the current user's practice_id from their profile.
 * Used in server actions to scope all queries by practice.
 */
export async function getCurrentPracticeId(
  supabase: SupabaseClient
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data } = await supabase
    .from("profiles")
    .select("practice_id")
    .eq("id", user.id)
    .single();

  if (!data?.practice_id) throw new Error("No practice associated with user");

  return data.practice_id;
}
