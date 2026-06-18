"use server";

import { addDays, format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWeekStart, getLastNWeeks } from "@/lib/constants";
import { calculateCondition, type ConditionName } from "@/lib/conditions";
import type { ContributorEntry, DashboardStat, Profile } from "@/lib/types";

interface OverallCalc {
  condition: ConditionName;
  latest: number;
  baseline: number;
  percentChange: number;
  /** How many prior weeks went into the baseline average. */
  baselineWeeks: number;
}

/**
 * Compute the lifetime "overall" condition for a stat: how is the most
 * recent week doing compared to the all-time historical average?
 *
 * Baseline = mean of every prior week's total (the latest week is excluded so
 * it doesn't dilute its own baseline). Current = the latest week's total.
 * Returns null when there's only one week of data — nothing to compare against.
 */
function computeOverall(
  weekTotals: { week_start: string; total: number }[],
  goodDirection: "up" | "down",
): OverallCalc | null {
  const sorted = [...weekTotals].sort((a, b) =>
    a.week_start.localeCompare(b.week_start),
  );
  if (sorted.length < 2) return null;

  const latest = sorted[sorted.length - 1].total;
  const history = sorted.slice(0, -1);
  const baseline =
    history.reduce((sum, x) => sum + x.total, 0) / history.length;
  const result = calculateCondition(latest, baseline, goodDirection);

  return {
    condition: result.condition,
    latest,
    baseline,
    percentChange: result.percentChange,
    baselineWeeks: history.length,
  };
}

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
  const sparklineWeeks = getLastNWeeks(week, 5);

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = callerProfile?.role === "admin";

  // Get all active stats with their post + division
  const { data: rawStats } = await supabase
    .from("stats")
    .select("*, post:posts(*, division:divisions(*))")
    .eq("is_active", true)
    .order("display_order");

  const stats = isAdmin
    ? rawStats
    : rawStats?.filter(
        (s) => !s.is_private && !s.post?.division?.is_private,
      );

  if (!stats?.length) return [];

  const statIds = stats.map((s) => s.id);

  // Get all entries for current week, previous week, and sparkline range
  const { data: entries } = await supabase
    .from("stat_entries")
    .select("*, profile:profiles!stat_entries_profile_id_fkey(*)")
    .in("stat_id", statIds)
    .gte("week_start", sparklineWeeks[0])
    .lte("week_start", week)
    .order("week_start", { ascending: true });

  // Lightweight all-time fetch for the lifetime overall-condition calc.
  // Only the columns we need to avoid hauling profiles + playbook text.
  const { data: allTimeEntries } = await supabase
    .from("stat_entries")
    .select("stat_id, week_start, value")
    .in("stat_id", statIds)
    .lte("week_start", week);

  // Pre-aggregate all-time entries: stat_id → [{ week_start, total }] (sum across contributors)
  const allTimeByStat = new Map<string, { week_start: string; total: number }[]>();
  for (const e of allTimeEntries ?? []) {
    const list = allTimeByStat.get(e.stat_id) ?? [];
    const existing = list.find((x) => x.week_start === e.week_start);
    if (existing) existing.total += Number(e.value);
    else list.push({ week_start: e.week_start, total: Number(e.value) });
    allTimeByStat.set(e.stat_id, list);
  }

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
    practice_id: "",
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
    // Find the most recent entry before the current week (not just immediate prior)
    const priorEntries = statEntries
      .filter((e) => e.week_start < week)
      .sort((a, b) => b.week_start.localeCompare(a.week_start));

    let currentEntry = currentWeekEntries[0] ?? null;
    let previousEntry = priorEntries[0] ?? null;

    // If multiple entries for same week, aggregate into the first entry object
    if (currentWeekEntries.length > 1) {
      const totalValue = currentWeekEntries.reduce((sum, e) => sum + Number(e.value), 0);
      currentEntry = { ...currentWeekEntries[0], value: totalValue };
    }
    // If multiple employees submitted for the same prior week, aggregate
    if (previousEntry) {
      const prevWeekStr = previousEntry.week_start;
      const samePrevWeek = priorEntries.filter((e) => e.week_start === prevWeekStr);
      if (samePrevWeek.length > 1) {
        const totalValue = samePrevWeek.reduce((sum, e) => sum + Number(e.value), 0);
        previousEntry = { ...samePrevWeek[0], value: totalValue };
      }
    }

    // Sync previous_value on the current entry to match the aggregated previous total
    // so the stat card's % change calculation uses the correct base
    if (currentEntry && previousEntry) {
      currentEntry = { ...currentEntry, previous_value: previousEntry.value };
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

    // Build contributor breakdown when multiple entries exist for the current week
    let contributors: ContributorEntry[] | undefined;
    if (currentWeekEntries.length > 1) {
      contributors = currentWeekEntries.map((e) => ({
        profileName: (e.profile as unknown as Profile)?.full_name ?? "Unknown",
        value: Number(e.value),
      }));
    }

    return {
      stat,
      post: stat.post,
      division: stat.post?.division,
      employee: primaryEmployee,
      currentEntry,
      previousEntry,
      sparklineData,
      contributors,
      overallAuto: computeOverall(
        allTimeByStat.get(stat.id) ?? [],
        stat.good_direction,
      ),
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
  const sparklineWeeks = getLastNWeeks(week, 5);

  // Get assigned posts
  const { data: assignments } = await supabase
    .from("employee_posts")
    .select("post_id")
    .eq("profile_id", user.id);

  if (!assignments?.length) return [];
  const postIds = assignments.map((a) => a.post_id);

  // Get stats for those posts
  const { data: rawStats } = await supabase
    .from("stats")
    .select("*, post:posts(*, division:divisions(*))")
    .in("post_id", postIds)
    .eq("is_active", true)
    .order("display_order");

  // Employees assigned to a post still need to submit entries for private
  // stats on /enter — but the dashboard hides them to match what admins control.
  const stats = rawStats?.filter(
    (s) => !s.is_private && !s.post?.division?.is_private,
  );

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

  // All-time, lightweight, for the overall-condition calc.
  const { data: allTimeEntries } = await supabase
    .from("stat_entries")
    .select("stat_id, week_start, value")
    .in("stat_id", statIds)
    .lte("week_start", week);

  const allTimeByStat = new Map<string, { week_start: string; total: number }[]>();
  for (const e of allTimeEntries ?? []) {
    const list = allTimeByStat.get(e.stat_id) ?? [];
    const existing = list.find((x) => x.week_start === e.week_start);
    if (existing) existing.total += Number(e.value);
    else list.push({ week_start: e.week_start, total: Number(e.value) });
    allTimeByStat.set(e.stat_id, list);
  }

  // Get profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return stats.map((stat) => {
    const statEntries = entries?.filter((e) => e.stat_id === stat.id) ?? [];
    const currentEntry = statEntries.find((e) => e.week_start === week) ?? null;
    // Find the most recent entry before the current week (not just immediate prior)
    const previousEntry =
      [...statEntries]
        .filter((e) => e.week_start < week)
        .sort((a, b) => b.week_start.localeCompare(a.week_start))[0] ?? null;

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
      overallAuto: computeOverall(
        allTimeByStat.get(stat.id) ?? [],
        stat.good_direction,
      ),
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
    .select("stat_id")
    .eq("week_start", week);

  const entrySet = new Set(entries?.map((e) => e.stat_id) ?? []);

  // Find missing
  const profileMap = new Map<string, { profile: Profile; missingStats: string[] }>();

  for (const assignment of activeAssignments) {
    if (!assignment.profile) continue;
    const profile = assignment.profile as unknown as Profile;
    const assignedStats = stats.filter(
      (s) => s.post_id === assignment.post_id
    );

    for (const stat of assignedStats) {
      if (!entrySet.has(stat.id)) {
        if (!profileMap.has(profile.id)) {
          profileMap.set(profile.id, { profile, missingStats: [] });
        }
        profileMap.get(profile.id)!.missingStats.push(stat.name);
      }
    }
  }

  return Array.from(profileMap.values());
}

// ============================================================
// Weekly entry coverage (replaces the binary "missing submissions"
// view for the daily-tracking model). Shows per-person, per-stat
// completion across the work week. Today is never flagged as late;
// only a skipped *past* weekday counts as "behind".
// ============================================================

export type CoverageState = "entered" | "today" | "upcoming" | "skipped";

export interface CoverageDay {
  date: string;
  label: string;
  state: CoverageState;
}

export interface StatCoverage {
  statId: string;
  statName: string;
  /** Manual/weekly-only stats have no daily dots — just a weekly entered flag. */
  isManual: boolean;
  days: CoverageDay[];
  weeklyEntered: boolean;
  behind: boolean;
}

export interface PersonCoverage {
  profile: Profile;
  stats: StatCoverage[];
  behindCount: number;
}

export interface WeeklyCoverageResult {
  people: PersonCoverage[];
  totalSlots: number;
  filledSlots: number;
  anyBehind: boolean;
  /** True when migration 039 isn't applied yet (no daily table/columns). */
  setupRequired: boolean;
}

/** Detect a missing daily-tracking schema so the dashboard degrades gracefully. */
function coverageSetupMissing(
  error: { code?: string; message?: string } | null,
): boolean {
  const m = error?.message?.toLowerCase() ?? "";
  return Boolean(
    error &&
      (m.includes("daily_stat_entries") ||
        m.includes("weekly_formula") ||
        m.includes("daily_tracking_enabled") ||
        error.code === "PGRST204" ||
        error.code === "PGRST205" ||
        error.code === "42P01" ||
        error.code === "42703"),
  );
}

export async function getWeeklyCoverage(
  weekStart?: string,
): Promise<WeeklyCoverageResult> {
  const empty: WeeklyCoverageResult = {
    people: [],
    totalSlots: 0,
    filledSlots: 0,
    anyBehind: false,
    setupRequired: false,
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerProfile?.role !== "admin") return empty;

  const week = weekStart ?? getCurrentWeekStart();
  const monday = new Date(`${week}T00:00:00`);
  const dates = Array.from({ length: 5 }, (_, i) =>
    format(addDays(monday, i), "yyyy-MM-dd"),
  );
  const today = format(new Date(), "yyyy-MM-dd");
  const lastDay = dates[dates.length - 1];
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri"];

  const { data: stats } = await supabase
    .from("stats")
    .select("*, post:posts(*)")
    .eq("is_active", true)
    .order("display_order");

  const statIds = (stats ?? []).map((s) => s.id);
  if (!statIds.length) return empty;

  const [{ data: daily, error: dailyError }, { data: weekly }] =
    await Promise.all([
      supabase
        .from("daily_stat_entries")
        .select("stat_id, entry_date")
        .in("stat_id", statIds)
        .eq("week_start", week),
      supabase
        .from("stat_entries")
        .select("stat_id")
        .in("stat_id", statIds)
        .eq("week_start", week),
    ]);
  if (coverageSetupMissing(dailyError)) return { ...empty, setupRequired: true };

  const dailySet = new Set(
    (daily ?? []).map((d) => `${d.stat_id}:${d.entry_date}`),
  );
  const weeklySet = new Set((weekly ?? []).map((w) => w.stat_id));

  // Map post → active employees so coverage is grouped by responsible person.
  const postIds = [...new Set((stats ?? []).map((s) => s.post_id))];
  const { data: assignments } = await supabase
    .from("employee_posts")
    .select("*, profile:profiles(*)")
    .in("post_id", postIds);
  const postEmployeesMap = new Map<string, Profile[]>();
  assignments?.forEach((a) => {
    const profile = a.profile as unknown as Profile | null;
    if (profile && profile.is_active !== false) {
      const list = postEmployeesMap.get(a.post_id) ?? [];
      list.push(profile);
      postEmployeesMap.set(a.post_id, list);
    }
  });

  const unassigned = {
    id: "unassigned",
    full_name: "Unassigned",
  } as unknown as Profile;

  const personMap = new Map<string, PersonCoverage>();
  let totalSlots = 0;
  let filledSlots = 0;
  let anyBehind = false;

  for (const stat of stats ?? []) {
    const isManual =
      stat.weekly_formula === "manual" || stat.daily_tracking_enabled === false;
    const days: CoverageDay[] = [];
    let behind = false;

    if (!isManual) {
      dates.forEach((date, i) => {
        const entered = dailySet.has(`${stat.id}:${date}`);
        let state: CoverageState;
        if (entered) state = "entered";
        else if (date < today) state = "skipped";
        else if (date === today) state = "today";
        else state = "upcoming";
        if (state === "skipped") behind = true;
        // Progress counts only days that are actually due (past or today).
        if (date <= today) {
          totalSlots++;
          if (entered) filledSlots++;
        }
        days.push({ date, label: labels[i], state });
      });
    } else if (today > lastDay && !weeklySet.has(stat.id)) {
      // Manual stats aren't "late" until the week is fully over.
      behind = true;
    }

    if (behind) anyBehind = true;

    const employees = postEmployeesMap.get(stat.post_id) ?? [];
    const coverage: StatCoverage = {
      statId: stat.id,
      statName: stat.name,
      isManual,
      days,
      weeklyEntered: weeklySet.has(stat.id),
      behind,
    };

    for (const employee of employees.length ? employees : [unassigned]) {
      let person = personMap.get(employee.id);
      if (!person) {
        person = { profile: employee, stats: [], behindCount: 0 };
        personMap.set(employee.id, person);
      }
      person.stats.push(coverage);
      if (behind) person.behindCount++;
    }
  }

  return {
    people: Array.from(personMap.values()),
    totalSlots,
    filledSlots,
    anyBehind,
    setupRequired: false,
  };
}
