"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Returns the per-practice salt used to hash patient names into opaque
 * `bridge_key`s. The salt never leaves an authenticated admin's browser —
 * it is used client-side at import time (to de-identify before sending) and
 * at mail-merge time (to re-derive keys for the local join). RLS on
 * practice_secrets already restricts SELECT to admins; this action is the
 * single channel by which the salt reaches the client.
 */
export async function getPatientSalt(): Promise<
  { salt: string } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { error: "Admin access required" };

  const { data, error } = await supabase
    .from("practice_secrets")
    .select("patient_salt")
    .maybeSingle<{ patient_salt: string }>();
  if (error) return { error: error.message };
  if (!data) return { error: "No salt provisioned for this practice." };

  return { salt: data.patient_salt };
}
