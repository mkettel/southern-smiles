"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentWeekStart, getPreviousWeekStart, getLastNWeeks } from "@/lib/constants";
import type { DashboardStat, Profile } from "@/lib/types";

/**
 * Get dashboard data for admin: all stats with current/previous entries and sparklines.
 */
export async function getAdminDashboard(
  weekStart?: string
): Promise<DashboardStat[]> {
  const supabase = await createClient();
  const week = weekStart ?? getCurrentWeekStart();
  const prevWeek = getPreviousWeekStart(week);
  const sparklineWeeks = getLastNWeeks(week, 4);

  // Get all active stats with their post + division
  const { data: stats } = await supabase
    .from("stats")
    .select("*, post:posts(*, division:divisions(*))")
    .eq("is_active", true)
    .order("display_order");

  if (!stats?.length) return [];

  const statIds = stats.map((s) => s.id);

  // Get all entries for current week, previous week, and sparkline range
  const { data: entries } = await supabase
    .from("stat_entries")
    .select("*, profile:profiles(*)")
    .in("stat_id", statIds)
    .gte("week_start", sparklineWeeks[0])
    .lte("week_start", week)
    .order("week_start", { ascending: true });

  // Get employee assignments to map stats → employees
  const postIds = [...new Set(stats.map((s) => s.post_id))];
  const { data: assignments } = await supabase
    .from("employee_posts")
    .select("*, profile:profiles(*)")
    .in("post_id", postIds);

  // Build a map: post_id → employee profile
  const postEmployeeMap = new Map<string, Profile>();
  assignments?.forEach((a) => {
    if (a.profile) postEmployeeMap.set(a.post_id, a.profile as Profile);
  });

  return stats.map((stat) => {
    const statEntries = entries?.filter((e) => e.stat_id === stat.id) ?? [];
    const currentEntry = statEntries.find((e) => e.week_start === week) ?? null;
    const previousEntry =
      statEntries.find((e) => e.week_start === prevWeek) ?? null;

    const sparklineData = sparklineWeeks.map((w) => ({
      week: w,
      value: statEntries.find((e) => e.week_start === w)?.value ?? 0,
    }));

    return {
      stat,
      post: stat.post,
      division: stat.post?.division,
      employee: postEmployeeMap.get(stat.post_id) ?? {
        id: "",
        full_name: "Unassigned",
        email: "",
        role: "employee" as const,
        is_active: true,
        created_at: "",
        updated_at: "",
      },
      currentEntry,
      previousEntry,
      sparklineData,
    } as DashboardStat;
  });
}

/**
 * Get dashboard data for a specific employee.
 */
export async function getEmployeeDashboard(
  weekStart?: string
): Promise<DashboardStat[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const week = weekStart ?? getCurrentWeekStart();
  const prevWeek = getPreviousWeekStart(week);
  const sparklineWeeks = getLastNWeeks(week, 4);

  // Get assigned posts
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

  // Get entries
  const { data: entries } = await supabase
    .from("stat_entries")
    .select("*")
    .in("stat_id", statIds)
    .gte("week_start", sparklineWeeks[0])
    .lte("week_start", week)
    .order("week_start", { ascending: true });

  // Get profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return stats.map((stat) => {
    const statEntries = entries?.filter((e) => e.stat_id === stat.id) ?? [];
    const currentEntry = statEntries.find((e) => e.week_start === week) ?? null;
    const previousEntry =
      statEntries.find((e) => e.week_start === prevWeek) ?? null;

    const sparklineData = sparklineWeeks.map((w) => ({
      week: w,
      value: statEntries.find((e) => e.week_start === w)?.value ?? 0,
    }));

    return {
      stat,
      post: stat.post,
      division: stat.post?.division,
      employee: profile as Profile,
      currentEntry,
      previousEntry,
      sparklineData,
    } as DashboardStat;
  });
}

/**
 * Get list of employees who haven't submitted all stats for the given week.
 */
export async function getMissingSubmissions(weekStart?: string) {
  const supabase = await createClient();
  const week = weekStart ?? getCurrentWeekStart();

  // Get all active employees with their assigned stats
  const { data: assignments } = await supabase
    .from("employee_posts")
    .select("profile_id, post_id, profile:profiles(*), post:posts(*)")
    .eq("profile:profiles.is_active" as string, true);

  if (!assignments?.length) return [];

  // Get all active stats
  const { data: stats } = await supabase
    .from("stats")
    .select("id, post_id, name")
    .eq("is_active", true);

  if (!stats?.length) return [];

  // Get all entries for this week
  const { data: entries } = await supabase
    .from("stat_entries")
    .select("stat_id, profile_id")
    .eq("week_start", week);

  const entrySet = new Set(
    entries?.map((e) => `${e.profile_id}:${e.stat_id}`) ?? []
  );

  // Find missing
  const missing: { profile: Profile; missingStats: string[] }[] = [];
  const profileMap = new Map<string, { profile: Profile; missingStats: string[] }>();

  for (const assignment of assignments) {
    if (!assignment.profile) continue;
    const profile = assignment.profile as unknown as Profile;
    const assignedStats = stats.filter(
      (s) => s.post_id === assignment.post_id
    );

    for (const stat of assignedStats) {
      if (!entrySet.has(`${profile.id}:${stat.id}`)) {
        if (!profileMap.has(profile.id)) {
          profileMap.set(profile.id, { profile, missingStats: [] });
        }
        profileMap.get(profile.id)!.missingStats.push(stat.name);
      }
    }
  }

  return Array.from(profileMap.values());
}
