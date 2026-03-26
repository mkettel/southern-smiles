"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentWeekStart, getPreviousWeekStart, getLastNWeeks } from "@/lib/constants";
import type { DashboardStat, Profile } from "@/lib/types";

/**
 * Get dashboard data: all stats with current/previous entries and sparklines.
 * Visible to all authenticated users.
 */
export async function getAdminDashboard(
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

  // Build a map: post_id → employee profiles (multiple possible)
  const postEmployeesMap = new Map<string, Profile[]>();
  assignments?.forEach((a) => {
    if (a.profile) {
      const list = postEmployeesMap.get(a.post_id) ?? [];
      list.push(a.profile as unknown as Profile);
      postEmployeesMap.set(a.post_id, list);
    }
  });

  const unassignedProfile: Profile = {
    id: "",
    full_name: "Unassigned",
    email: "",
    username: null,
    avatar_url: null,
    avatar_color: null,
    role: "employee" as const,
    is_active: true,
    created_at: "",
    updated_at: "",
  };

  // One card per stat. If multiple employees contribute, aggregate:
  // - Show the most recent submitter as the employee
  // - Sum/average values across employees for sparkline (or pick latest)
  // - The stat detail page handles per-employee filtering
  return stats.map((stat) => {
    const statEntries = entries?.filter((e) => e.stat_id === stat.id) ?? [];
    const employees = postEmployeesMap.get(stat.post_id) ?? [unassignedProfile];

    // For current/previous entries: if multiple employees submitted,
    // sum their values (for counts/dollars) to show the aggregate.
    // For single employee (current norm), this just returns their entry.
    const currentWeekEntries = statEntries.filter((e) => e.week_start === week);
    const prevWeekEntries = statEntries.filter((e) => e.week_start === prevWeek);

    let currentEntry = currentWeekEntries[0] ?? null;
    let previousEntry = prevWeekEntries[0] ?? null;

    // If multiple entries for same week, aggregate into the first entry object
    if (currentWeekEntries.length > 1) {
      const totalValue = currentWeekEntries.reduce((sum, e) => sum + Number(e.value), 0);
      currentEntry = { ...currentWeekEntries[0], value: totalValue };
    }
    if (prevWeekEntries.length > 1) {
      const totalValue = prevWeekEntries.reduce((sum, e) => sum + Number(e.value), 0);
      previousEntry = { ...prevWeekEntries[0], value: totalValue };
    }

    // Sparkline: aggregate per week
    const sparklineData = sparklineWeeks.map((w) => {
      const weekEntries = statEntries.filter((e) => e.week_start === w);
      const total = weekEntries.reduce((sum, e) => sum + Number(e.value), 0);
      return { week: w, value: total };
    });

    // Show employee name(s) — single name or "2 contributors"
    const primaryEmployee = employees.length === 1
      ? employees[0]
      : {
          ...employees[0],
          full_name: employees.map((e) => e.full_name).join(", "),
        };

    return {
      stat,
      post: stat.post,
      division: stat.post?.division,
      employee: primaryEmployee,
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Verify admin
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerProfile?.role !== "admin") return [];

  const week = weekStart ?? getCurrentWeekStart();

  // Get all employees with their assigned posts
  const { data: assignments } = await supabase
    .from("employee_posts")
    .select("profile_id, post_id, profile:profiles(*), post:posts(*)");

  if (!assignments?.length) return [];

  // Filter to only active employees (can't filter on joined table in Supabase)
  const activeAssignments = assignments.filter((a) => {
    const profile = a.profile as unknown as Profile | null;
    return profile?.is_active === true;
  });

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

  for (const assignment of activeAssignments) {
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
