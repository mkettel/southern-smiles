"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPracticeId } from "@/lib/practice";
import { calculateCondition } from "@/lib/conditions";
import { submitWeeklyStatsSchema } from "@/lib/validators";
import { getCurrentWeekStart, getPreviousWeekStart } from "@/lib/constants";
import type { MyStatForEntry, OtherStatForEntry, StatEntry, Profile } from "@/lib/types";

/**
 * Get all stats assigned to the current user for a given week,
 * including previous values and any existing entries.
 */
export async function getMyStatsForWeek(
  weekStart?: string
): Promise<MyStatForEntry[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const week = weekStart ?? getCurrentWeekStart();
  const prevWeek = getPreviousWeekStart(week);

  // Get this user's assigned posts
  const { data: assignments } = await supabase
    .from("employee_posts")
    .select("post_id")
    .eq("profile_id", user.id);

  if (!assignments?.length) return [];

  const postIds = assignments.map((a) => a.post_id);

  // Get stats for those posts
  const { data: stats } = await supabase
    .from("stats")
    .select("*, post:posts(*, division:divisions(*))")
    .in("post_id", postIds)
    .eq("is_active", true)
    .order("display_order");

  if (!stats?.length) return [];

  const statIds = stats.map((s) => s.id);

  // Get existing entries for this week for THIS user
  const { data: currentEntries } = await supabase
    .from("stat_entries")
    .select("*")
    .in("stat_id", statIds)
    .eq("profile_id", user.id)
    .eq("week_start", week);

  // Get previous week entries for THIS user for condition calculation
  const { data: prevEntries } = await supabase
    .from("stat_entries")
    .select("*")
    .in("stat_id", statIds)
    .eq("profile_id", user.id)
    .eq("week_start", prevWeek);

  return stats.map((stat) => ({
    stat,
    post: stat.post,
    previousValue:
      prevEntries?.find((e) => e.stat_id === stat.id)?.value ?? null,
    existingEntry:
      (currentEntries?.find((e) => e.stat_id === stat.id) as StatEntry) ?? null,
  }));
}

/**
 * Get all active stats NOT assigned to the current user (admin only).
 * Includes the assigned employee and any existing entries for the week.
 */
export async function getOtherStatsForWeek(
  weekStart?: string
): Promise<OtherStatForEntry[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Verify admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return [];

  const week = weekStart ?? getCurrentWeekStart();
  const prevWeek = getPreviousWeekStart(week);

  // Get this user's assigned post IDs
  const { data: myAssignments } = await supabase
    .from("employee_posts")
    .select("post_id")
    .eq("profile_id", user.id);

  const myPostIds = new Set(myAssignments?.map((a) => a.post_id) ?? []);

  // Get ALL active stats with their posts
  const { data: allStats } = await supabase
    .from("stats")
    .select("*, post:posts(*, division:divisions(*))")
    .eq("is_active", true)
    .order("display_order");

  if (!allStats?.length) return [];

  // Filter to stats NOT in the admin's posts
  const otherStats = allStats.filter((s) => !myPostIds.has(s.post_id));
  if (!otherStats.length) return [];

  // Get all employee_posts assignments for these posts
  const otherPostIds = [...new Set(otherStats.map((s) => s.post_id))];
  const { data: assignments } = await supabase
    .from("employee_posts")
    .select("post_id, profile:profiles(*)")
    .in("post_id", otherPostIds);

  // Map post_id -> primary employee
  const postEmployeeMap = new Map<string, Profile>();
  for (const a of assignments ?? []) {
    if (a.profile && !postEmployeeMap.has(a.post_id)) {
      postEmployeeMap.set(a.post_id, a.profile as unknown as Profile);
    }
  }

  const otherStatIds = otherStats.map((s) => s.id);

  // Get existing entries for this week (from any user)
  const { data: currentEntries } = await supabase
    .from("stat_entries")
    .select("*")
    .in("stat_id", otherStatIds)
    .eq("week_start", week);

  // Get previous week entries for condition calculation
  const { data: prevEntries } = await supabase
    .from("stat_entries")
    .select("stat_id, value, profile_id")
    .in("stat_id", otherStatIds)
    .eq("week_start", prevWeek);

  return otherStats.map((stat) => {
    const employee = postEmployeeMap.get(stat.post_id) ?? {
      id: "",
      full_name: "Unassigned",
      email: "",
      username: null,
      avatar_url: null,
      role: "employee" as const,
      is_active: true,
      created_at: "",
      updated_at: "",
    };

    // Find existing entry for this stat (from the assigned employee)
    const existingEntry =
      currentEntries?.find(
        (e) => e.stat_id === stat.id && e.profile_id === employee.id
      ) ?? null;

    // Previous value from the assigned employee
    const previousValue =
      prevEntries?.find(
        (e) => e.stat_id === stat.id && e.profile_id === employee.id
      )?.value ?? null;

    return {
      stat,
      post: stat.post,
      employee,
      previousValue,
      existingEntry: existingEntry as StatEntry | null,
    };
  });
}

/**
 * Submit weekly stats for the current user.
 */
export async function submitWeeklyStats(input: {
  week_start: string;
  profile_id?: string;
  entries: {
    stat_id: string;
    value: number;
    self_condition?: string | null;
    playbook_response?: string | null;
  }[];
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const practiceId = await getCurrentPracticeId(supabase);

  // Determine target profile: admin can submit on behalf of another user
  let targetProfileId = user.id;
  if (input.profile_id && input.profile_id !== user.id) {
    // Verify caller is admin
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (callerProfile?.role !== "admin") {
      return { error: "Only admins can submit stats for other users" };
    }
    targetProfileId = input.profile_id;
  }

  // Validate input
  const parsed = submitWeeklyStatsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { week_start, entries } = parsed.data;
  const prevWeek = getPreviousWeekStart(week_start);

  // Get stat definitions for condition calculation
  const statIds = entries.map((e) => e.stat_id);
  const { data: stats } = await supabase
    .from("stats")
    .select("id, good_direction")
    .in("id", statIds);

  // Get previous values for the TARGET user
  const { data: prevEntries } = await supabase
    .from("stat_entries")
    .select("stat_id, value")
    .in("stat_id", statIds)
    .eq("profile_id", targetProfileId)
    .eq("week_start", prevWeek);

  const prevMap = new Map(prevEntries?.map((e) => [e.stat_id, e.value]) ?? []);
  const statMap = new Map(stats?.map((s) => [s.id, s]) ?? []);

  // Build upsert rows
  const rows = entries.map((entry) => {
    const stat = statMap.get(entry.stat_id);
    const prevValue = prevMap.get(entry.stat_id) ?? null;
    const conditionResult = calculateCondition(
      entry.value,
      prevValue,
      stat?.good_direction ?? "up"
    );

    return {
      stat_id: entry.stat_id,
      profile_id: targetProfileId,
      week_start,
      value: entry.value,
      previous_value: prevValue,
      percent_change: conditionResult.percentChange,
      auto_condition: conditionResult.condition,
      self_condition: entry.self_condition ?? null,
      final_condition: null,
      playbook_response: entry.playbook_response ?? null,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      practice_id: practiceId,
    };
  });

  const { error } = await supabase.from("stat_entries").upsert(rows, {
    onConflict: "stat_id,profile_id,week_start",
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/enter");
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
    .select("*, stat:stats(*, post:posts(*, division:divisions(*))), profile:profiles(*)")
    .eq("stat_id", statId)
    .order("week_start", { ascending: false })
    .limit(limit);

  return (data as StatEntry[]) ?? [];
}
