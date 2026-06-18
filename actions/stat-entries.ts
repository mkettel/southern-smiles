"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { calculateCondition, type ConditionName } from "@/lib/conditions";
import type { StatEntry } from "@/lib/types";

/**
 * Admin-only: delete a single stat entry.
 */
export async function deleteStatEntry(entryId: string) {
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
  if (profile?.role !== "admin") {
    return { error: "Only admins can delete stat entries" };
  }

  const { error } = await supabase
    .from("stat_entries")
    .delete()
    .eq("id", entryId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/stats/[statId]", "page");
  return { success: true };
}

/**
 * Admin-only: update a stat entry's value. Recomputes percent_change and auto_condition
 * from the row's existing previous_value. Does not cascade-fix downstream rows — the next
 * weekly submission rebuilds the chain.
 */
export async function updateStatEntry(entryId: string, value: number) {
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
  if (profile?.role !== "admin") {
    return { error: "Only admins can edit stat entries" };
  }

  if (!Number.isFinite(value)) {
    return { error: "Value must be a number" };
  }

  const { data: existing } = await supabase
    .from("stat_entries")
    .select("previous_value, stat:stats(good_direction)")
    .eq("id", entryId)
    .single<{
      previous_value: number | null;
      stat: { good_direction: "up" | "down" } | null;
    }>();

  if (!existing) return { error: "Entry not found" };

  const result = calculateCondition(
    value,
    existing.previous_value,
    existing.stat?.good_direction ?? "up"
  );

  const { error } = await supabase
    .from("stat_entries")
    .update({
      value,
      percent_change: result.percentChange,
      auto_condition: result.condition,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/stats/[statId]", "page");
  return { success: true };
}

/**
 * Admin-only: override the displayed condition for a stat entry. Pass `null`
 * to clear the override and revert to the auto-calculated condition.
 */
export async function setEntryCondition(
  entryId: string,
  condition: ConditionName | null,
) {
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
  if (profile?.role !== "admin") {
    return { error: "Only admins can override conditions" };
  }

  const { error } = await supabase
    .from("stat_entries")
    .update({
      final_condition: condition,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/stats/[statId]", "page");
  return { success: true };
}

/**
 * Get historical entries for a single stat.
 */
export async function getStatHistory(
  statId: string,
  limit: number = 52
): Promise<StatEntry[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // RLS handles scoping: employees see own entries, admins see all
  const { data } = await supabase
    .from("stat_entries")
    .select("*, stat:stats(*, post:posts(*, division:divisions(*))), profile:profiles!stat_entries_profile_id_fkey(*)")
    .eq("stat_id", statId)
    .order("week_start", { ascending: false })
    .limit(limit);

  return (data as StatEntry[]) ?? [];
}
