"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { calculateCondition, type ConditionName } from "@/lib/conditions";
import { refreshSumOfWeeklyTotalDependents } from "@/lib/sum-weekly-stat-sync";
import { isTotalCreditCardDebtStat } from "@/lib/financial-connections";
import type {
  Stat,
  StatComparisonOption,
  StatComparisonSeries,
  StatEntry,
} from "@/lib/types";

/**
 * Admin-only: delete a single stat entry.
 */
export async function deleteStatEntry(entryId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const [{ data: profile }, { data: entry }] = await Promise.all([
    supabase
      .from("profiles")
      .select("role, practice_id")
      .eq("id", user.id)
      .single(),
    supabase
      .from("stat_entries")
      .select("stat_id, week_start, practice_id, stat:stats(name, stat_type)")
      .eq("id", entryId)
      .maybeSingle(),
  ]);
  if (profile?.role !== "admin") {
    return { error: "Only admins can delete stat entries" };
  }
  if (!entry) return { error: "Entry not found" };
  const entryStat = Array.isArray(entry.stat) ? entry.stat[0] : entry.stat;
  if (
    entryStat &&
    isTotalCreditCardDebtStat(
      entryStat as unknown as Pick<Stat, "name" | "stat_type">,
    )
  ) {
    return { error: "Total Credit Card Debt is updated from Financial Connections" };
  }

  const { error } = await supabase
    .from("stat_entries")
    .delete()
    .eq("id", entryId);

  if (error) return { error: error.message };

  await refreshSumOfWeeklyTotalDependents(
    entry.stat_id,
    entry.week_start,
    user.id,
    entry.practice_id ?? profile.practice_id,
  );
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
    .select("role, practice_id")
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
    .select("stat_id, week_start, practice_id, previous_value, stat:stats(name, stat_type, good_direction)")
    .eq("id", entryId)
    .single<{
      stat_id: string;
      week_start: string;
      practice_id: string;
      previous_value: number | null;
      stat: {
        name: string;
        stat_type: "dollar" | "percentage" | "count";
        good_direction: "up" | "down";
      } | null;
    }>();

  if (!existing) return { error: "Entry not found" };
  if (existing.stat && isTotalCreditCardDebtStat(existing.stat)) {
    return { error: "Total Credit Card Debt is updated from Financial Connections" };
  }

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

  await refreshSumOfWeeklyTotalDependents(
    existing.stat_id,
    existing.week_start,
    user.id,
    existing.practice_id ?? profile.practice_id,
  );
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

export async function getStatComparisonOptions(): Promise<StatComparisonOption[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const [{ data: profile }, { data }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase
      .from("stats")
      .select("*, post:posts(*, division:divisions(*))")
      .eq("is_active", true)
      .order("name"),
  ]);

  const stats = (data as Stat[] | null) ?? [];
  return stats
    .filter(
      (stat) =>
        profile?.role === "admin" ||
        (!stat.is_private && !stat.post?.division?.is_private),
    )
    .map((stat) => ({
      id: stat.id,
      name: stat.name,
      statType: stat.stat_type,
      divisionLabel: stat.post?.division
        ? `Div ${stat.post.division.number} - ${stat.post.division.name}`
        : "",
      postTitle: stat.post?.title ?? "",
    }));
}

export async function getComparisonStatHistory(
  statIds: string[],
): Promise<StatComparisonSeries[]> {
  const ids = Array.from(new Set(statIds)).slice(0, 3);
  if (ids.length === 0) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const [{ data: profile }, { data: stats }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase
      .from("stats")
      .select("*, post:posts(*, division:divisions(*))")
      .in("id", ids)
      .eq("is_active", true),
  ]);

  const allowedStats = ((stats as Stat[] | null) ?? []).filter(
    (stat) =>
      profile?.role === "admin" ||
      (!stat.is_private && !stat.post?.division?.is_private),
  );
  const allowedIds = allowedStats.map((stat) => stat.id);
  if (allowedIds.length === 0) return [];

  const { data: entries } = await supabase
    .from("stat_entries")
    .select("*, profile:profiles!stat_entries_profile_id_fkey(*)")
    .in("stat_id", allowedIds)
    .order("week_start", { ascending: false })
    .limit(1000);

  const typedEntries = (entries as StatEntry[] | null) ?? [];
  const statsById = new Map(allowedStats.map((stat) => [stat.id, stat]));
  return ids.flatMap((id) => {
    const stat = statsById.get(id);
    if (!stat) return [];
    return [{
      id: stat.id,
      name: stat.name,
      statType: stat.stat_type,
      entries: typedEntries.filter((entry) => entry.stat_id === stat.id),
    }];
  });
}
