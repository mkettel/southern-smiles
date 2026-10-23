"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import {
  CARE_CALL_PRACTICE,
  CARE_CALL_STAT,
  CARE_CALL_START,
  phoenixDay,
} from "@/lib/care-call-sync";
export async function saveCareCallAdjustment(input: {
  operation: "additional" | "override" | "reset";
  date: string;
  value?: number;
  reason?: string;
}) {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  const { data: profile } = await client
    .from("profiles")
    .select("practice_id,role")
    .eq("id", user.id)
    .single();
  if (profile?.practice_id !== CARE_CALL_PRACTICE)
    return { error: "Unauthorized" };
  if (
    !["additional", "override", "reset"].includes(input.operation) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
    input.date < CARE_CALL_START ||
    input.date > phoenixDay()
  )
    return { error: "Invalid date or operation" };
  if (
    input.operation !== "reset" &&
    (!Number.isSafeInteger(input.value) ||
      (input.value ?? -1) < 0 ||
      (input.value ?? 0) > 1000000)
  )
    return { error: "Enter a whole number of 0 or greater" };
  if (
    input.operation === "override" &&
    (!input.reason?.trim() || input.reason.length > 200)
  )
    return { error: "Enter a reason (up to 200 characters)" };
  const { error } = await createAdminClient().rpc("manage_care_call_sync", {
    p_operation: input.operation,
    p_date: input.date,
    p_value: input.value ?? null,
    p_actor: user.id,
    p_reason: input.reason ?? null,
  });
  // Database repeats assignment/tenant checks and atomically recalculates totals.
  if (error)
    return {
      error:
        "Could not save. The date, assignment, or existing numbers need review.",
    };
  revalidatePath("/stats");
  revalidatePath("/dashboard");
  revalidatePath(`/stats/${CARE_CALL_STAT}`);
  return { success: true };
}
