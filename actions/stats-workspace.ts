"use server";

import { format, startOfWeek } from "date-fns";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPracticeId } from "@/lib/practice";
import { getCurrentWeekStart } from "@/lib/constants";
import { calculateCondition } from "@/lib/conditions";
import { isBillsManagedStat } from "@/lib/bills";
import {
  calculateCollectionsPerStaffWeek,
  calculateRatioOfSumsWeek,
  calculateSumOfWeeklyTotals,
  getDailyInputStatId,
  isNewPatientBookingsInput,
  isWeeklyFormulaActive,
} from "@/lib/stat-formulas";
import { refreshSumOfWeeklyTotalDependents } from "@/lib/sum-weekly-stat-sync";
import { isCherryApprovedFinancingStat } from "@/lib/cherry-financing";
import { isTotalCreditCardDebtStat } from "@/lib/financial-connections";
import type { DailyStatEntry, Post, Profile, Stat, StatEntry } from "@/lib/types";

export interface WorkspaceStat {
  stat: Stat;
  post: Post;
  dailyEntries: DailyStatEntry[];
  weeklyEntry: StatEntry | null;
  dailyInputStatId: string;
  dailyInputPrompt?: string;
}

function weekStartForDate(date: string) {
  return format(startOfWeek(new Date(`${date}T00:00:00`), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

function isSetupMissing(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return Boolean(
    error &&
      (message.includes("weekly_formula") ||
        message.includes("formula_denominator_stat_id") ||
        message.includes("daily_stat_entries") ||
        error.code === "PGRST204" ||
        error.code === "PGRST205"),
  );
}

async function getActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!profile) throw new Error("Profile not found");
  return { supabase, user, profile: profile as Profile };
}

async function canEditStat(statId: string) {
  const { supabase, user, profile } = await getActor();
  const { data: stat } = await supabase
    .from("stats")
    .select("*, post:posts(*)")
    .eq("id", statId)
    .single();
  if (!stat) return { error: "Stat not found" as const };
  if (isBillsManagedStat(stat as Stat & { post: Post })) {
    return { error: "Bills is updated from the Bills tracker" as const };
  }
  if (isCherryApprovedFinancingStat(stat as Stat & { post: Post })) {
    return { error: "Approved Financing is updated from Cherry approval imports" as const };
  }
  if (isTotalCreditCardDebtStat(stat as Stat & { post: Post })) {
    return { error: "Total Credit Card Debt is updated from Financial Connections" as const };
  }

  if (profile.role !== "admin") {
    const { data: assignment } = await supabase
      .from("employee_posts")
      .select("id")
      .eq("profile_id", user.id)
      .eq("post_id", stat.post_id)
      .maybeSingle();
    if (!assignment) return { error: "This stat is not assigned to you" as const };
  }

  return { supabase, user, profile, stat: stat as Stat & { post: Post } };
}

function rollupValue(stat: Stat, entries: { value: number | null }[]) {
  const values = entries
    .map((entry) => (entry.value === null ? null : Number(entry.value)))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (!values.length) return null;
  if (stat.weekly_formula === "average") {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  return values.reduce((sum, value) => sum + value, 0);
}

async function calculateWeeklyValue(
  admin: ReturnType<typeof createAdminClient>,
  stat: Stat,
  weekStart: string,
) {
  if (stat.weekly_formula === "sum_of_weekly_totals") {
    if (!stat.formula_source_stat_ids.length) return null;
    const { data: sourceEntries } = await admin
      .from("stat_entries")
      .select("value")
      .in("stat_id", stat.formula_source_stat_ids)
      .eq("week_start", weekStart);
    return calculateSumOfWeeklyTotals(sourceEntries ?? []);
  }

  if (stat.weekly_formula === "ratio_of_sums") {
    if (!stat.formula_source_stat_id || !stat.formula_denominator_stat_id) return null;
    const [{ data: numeratorEntries }, { data: denominatorEntries }] = await Promise.all([
      admin
        .from("daily_stat_entries")
        .select("value")
        .eq("stat_id", stat.formula_source_stat_id)
        .eq("week_start", weekStart),
      admin
        .from("daily_stat_entries")
        .select("value")
        .eq("stat_id", stat.formula_denominator_stat_id)
        .eq("week_start", weekStart),
    ]);
    return calculateRatioOfSumsWeek(numeratorEntries ?? [], denominatorEntries ?? []);
  }

  if (stat.weekly_formula !== "collections_per_staff") {
    const { data: daily } = await admin
      .from("daily_stat_entries")
      .select("value")
      .eq("stat_id", stat.id)
      .eq("week_start", weekStart);
    return rollupValue(stat, daily ?? []);
  }

  if (!stat.formula_source_stat_id) return null;

  const [{ data: collectionsEntries }, { data: staffEntries }] = await Promise.all([
    admin
      .from("daily_stat_entries")
      .select("entry_date, value")
      .eq("stat_id", stat.formula_source_stat_id)
      .eq("week_start", weekStart),
    admin
      .from("daily_stat_entries")
      .select("entry_date, input_value")
      .eq("stat_id", stat.id)
      .eq("week_start", weekStart),
  ]);

  return calculateCollectionsPerStaffWeek(
    collectionsEntries ?? [],
    staffEntries ?? [],
  );
}

async function syncWeekly(stat: Stat, weekStart: string, actorId: string, practiceId: string) {
  if (stat.weekly_formula === "manual") return;
  if (!isWeeklyFormulaActive(stat.formula_effective_from, weekStart)) return;
  const admin = createAdminClient();
  const [{ data: existing }, { data: previous }] = await Promise.all([
    admin.from("stat_entries").select("*").eq("stat_id", stat.id).eq("week_start", weekStart).maybeSingle(),
    admin
      .from("stat_entries")
      .select("value")
      .eq("stat_id", stat.id)
      .lt("week_start", weekStart)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const calculated = await calculateWeeklyValue(admin, stat, weekStart);
  if (calculated === null) {
    if (stat.weekly_formula === "collections_per_staff") {
      return;
    }
    if (existing && !existing.is_manual_override) {
      await admin.from("stat_entries").delete().eq("id", existing.id);
    }
    return;
  }

  const previousValue = previous?.value == null ? null : Number(previous.value);
  const condition = calculateCondition(calculated, previousValue, stat.good_direction);
  const value = existing?.is_manual_override ? Number(existing.value) : calculated;
  await admin.from("stat_entries").upsert(
    {
      stat_id: stat.id,
      profile_id: actorId,
      practice_id: practiceId,
      week_start: weekStart,
      value,
      calculated_value: calculated,
      is_manual_override: existing?.is_manual_override ?? false,
      previous_value: previousValue,
      percent_change: condition.percentChange,
      auto_condition: condition.condition,
      self_condition: existing?.self_condition ?? condition.condition,
      final_condition: existing?.final_condition ?? null,
      playbook_response: existing?.playbook_response ?? null,
      updated_by: actorId,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stat_id,week_start" },
  );
}

async function refreshDependents(sourceStatId: string, entryDate: string, actorId: string, practiceId: string) {
  const admin = createAdminClient();
  const [{ data: sourceEntry }, { data: sourceDependents }, { data: denominatorDependents }] = await Promise.all([
    admin.from("daily_stat_entries").select("value").eq("stat_id", sourceStatId).eq("entry_date", entryDate).maybeSingle(),
    admin.from("stats").select("*").eq("formula_source_stat_id", sourceStatId),
    admin.from("stats").select("*").eq("formula_denominator_stat_id", sourceStatId).eq("weekly_formula", "ratio_of_sums"),
  ]);
  const weekStart = weekStartForDate(entryDate);
  await refreshSumOfWeeklyTotalDependents(
    sourceStatId,
    weekStart,
    actorId,
    practiceId,
  );
  const dependents = new Map<string, Stat>();
  for (const dependent of [...(sourceDependents ?? []), ...(denominatorDependents ?? [])] as Stat[]) {
    dependents.set(dependent.id, dependent);
  }

  for (const dependent of dependents.values()) {
    if (dependent.weekly_formula === "ratio_of_sums") {
      await syncWeekly(dependent, weekStart, actorId, practiceId);
      continue;
    }
    if (dependent.weekly_formula !== "collections_per_staff") continue;
    const { data: row } = await admin
      .from("daily_stat_entries")
      .select("*")
      .eq("stat_id", dependent.id)
      .eq("entry_date", entryDate)
      .maybeSingle();
    if (!row) continue;
    const staff = row.input_value == null ? null : Number(row.input_value);
    const collections = sourceEntry?.value == null ? null : Number(sourceEntry.value);
    const value = staff && collections !== null ? collections / staff : null;
    await admin
      .from("daily_stat_entries")
      .update({ value, profile_id: actorId, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    await syncWeekly(dependent, weekStart, actorId, practiceId);
  }
}

export async function getStatsWorkspace(weekStart = getCurrentWeekStart()) {
  const { supabase, user, profile } = await getActor();
  let postIds: string[] | null = null;
  if (profile.role !== "admin") {
    const { data: assignments } = await supabase
      .from("employee_posts")
      .select("post_id")
      .eq("profile_id", user.id);
    postIds = assignments?.map((assignment) => assignment.post_id) ?? [];
    if (!postIds.length) {
      return {
        stats: [] as WorkspaceStat[],
        setupRequired: false,
        isAdmin: false,
        billsManagedHidden: false,
        approvedFinancingManagedHidden: false,
        financialDebtManagedHidden: false,
      };
    }
  }

  let query = supabase
    .from("stats")
    .select("*, post:posts(*, division:divisions(*))")
    .eq("is_active", true)
    .order("display_order");
  if (postIds) query = query.in("post_id", postIds);
  const { data: stats, error } = await query;
  if (isSetupMissing(error)) {
    return {
      stats: [] as WorkspaceStat[],
      setupRequired: true,
      isAdmin: profile.role === "admin",
      billsManagedHidden: false,
      approvedFinancingManagedHidden: false,
      financialDebtManagedHidden: false,
    };
  }
  if (error) throw new Error(error.message);

  const statIds = stats?.map((stat) => stat.id) ?? [];
  if (!statIds.length) {
    return {
      stats: [] as WorkspaceStat[],
      setupRequired: false,
      isAdmin: profile.role === "admin",
      billsManagedHidden: false,
      approvedFinancingManagedHidden: false,
      financialDebtManagedHidden: false,
    };
  }
  const [{ data: daily, error: dailyError }, { data: weekly }] = await Promise.all([
    supabase.from("daily_stat_entries").select("*").in("stat_id", statIds).eq("week_start", weekStart),
    supabase.from("stat_entries").select("*").in("stat_id", statIds).eq("week_start", weekStart),
  ]);
  if (isSetupMissing(dailyError)) {
    return {
      stats: [] as WorkspaceStat[],
      setupRequired: true,
      isAdmin: profile.role === "admin",
      billsManagedHidden: false,
      approvedFinancingManagedHidden: false,
      financialDebtManagedHidden: false,
    };
  }
  if (dailyError) throw new Error(dailyError.message);

  const visibleStats = (stats ?? []).filter(
    (stat) =>
      !isNewPatientBookingsInput(stat) &&
      !isBillsManagedStat(stat as Stat & { post: Post }) &&
      !isCherryApprovedFinancingStat(stat as Stat & { post: Post }),
  );
  const hiddenBillsStats = (stats ?? []).filter((stat) =>
    isBillsManagedStat(stat as Stat & { post: Post }),
  );
  const hiddenApprovedFinancingStats = (stats ?? []).filter((stat) =>
    isCherryApprovedFinancingStat(stat as Stat & { post: Post }),
  );
  const hiddenFinancialDebtStats = (stats ?? []).filter((stat) =>
    isTotalCreditCardDebtStat(stat as Stat & { post: Post }),
  );

  return {
    setupRequired: false,
    isAdmin: profile.role === "admin",
    // True when every assigned stat was the system-managed Bills stat, so the
    // empty state can explain it's auto-synced rather than say "nothing assigned".
    billsManagedHidden: visibleStats.length === 0 && hiddenBillsStats.length > 0,
    approvedFinancingManagedHidden:
      visibleStats.length === 0 && hiddenApprovedFinancingStats.length > 0,
    financialDebtManagedHidden:
      visibleStats.length === 0 && hiddenFinancialDebtStats.length > 0,
    stats: visibleStats.map((stat) => {
      const typedStat = stat as Stat;
      const dailyInputStatId = getDailyInputStatId(typedStat);
      return {
        stat: stat as Stat,
        post: stat.post as Post,
        dailyInputStatId,
        dailyInputPrompt:
          dailyInputStatId !== stat.id ? "How many people booked today?" : undefined,
        dailyEntries: ((daily ?? []) as DailyStatEntry[]).filter(
          (entry) => entry.stat_id === dailyInputStatId,
        ),
        weeklyEntry: ((weekly ?? []) as StatEntry[]).find((entry) => entry.stat_id === stat.id) ?? null,
      };
    }),
  };
}

export async function saveDailyStatInput(input: { statId: string; entryDate: string; value: number | null }) {
  const access = await canEditStat(input.statId);
  if ("error" in access) return { error: access.error };
  const { user, stat, supabase } = access;
  const practiceId = await getCurrentPracticeId(supabase);
  const admin = createAdminClient();
  const weekStart = weekStartForDate(input.entryDate);

  if (stat.weekly_formula === "ratio_of_sums") {
    return { error: "This stat is calculated from its weekly source totals" };
  }
  if (stat.weekly_formula === "sum_of_weekly_totals") {
    return { error: "This stat is calculated from its source stats" };
  }

  if (input.value !== null && (!Number.isFinite(input.value) || input.value < 0)) {
    return { error: "Enter a value of 0 or greater" };
  }
  if (input.value === null) {
    await admin.from("daily_stat_entries").delete().eq("stat_id", stat.id).eq("entry_date", input.entryDate);
  } else {
    const normalizedInput =
      stat.stat_type === "count" && stat.weekly_formula !== "collections_per_staff"
        ? Math.round(input.value)
        : input.value;
    let calculatedValue: number | null = normalizedInput;
    if (stat.weekly_formula === "collections_per_staff") {
      if (input.value <= 0) return { error: "Staff worked must be greater than 0" };
      if (!stat.formula_source_stat_id) return { error: "This formula needs a source stat" };
      const { data: source } = await admin
        .from("daily_stat_entries")
        .select("value")
        .eq("stat_id", stat.formula_source_stat_id)
        .eq("entry_date", input.entryDate)
        .maybeSingle();
      calculatedValue = source?.value == null ? null : Number(source.value) / input.value;
    }
    if (stat.stat_type === "percentage" && input.value > 100) {
      return { error: "Percentage values cannot exceed 100" };
    }
    await admin.from("daily_stat_entries").upsert(
      {
        practice_id: practiceId,
        stat_id: stat.id,
        profile_id: user.id,
        entry_date: input.entryDate,
        week_start: weekStart,
        input_value: normalizedInput,
        value: calculatedValue,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stat_id,entry_date" },
    );
  }

  await syncWeekly(stat, weekStart, user.id, practiceId);
  await refreshDependents(stat.id, input.entryDate, user.id, practiceId);
  revalidatePath("/stats");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function saveWeeklyOverride(input: { statId: string; weekStart: string; value: number }) {
  const access = await canEditStat(input.statId);
  if ("error" in access) return { error: access.error };
  if (!Number.isFinite(input.value) || input.value < 0) return { error: "Enter a value of 0 or greater" };
  const { user, stat, supabase } = access;
  if (stat.stat_type === "percentage" && input.value > 100) {
    return { error: "Percentage values cannot exceed 100" };
  }
  const value = stat.stat_type === "count" ? Math.round(input.value) : input.value;
  const practiceId = await getCurrentPracticeId(supabase);
  const admin = createAdminClient();
  const { data: previous } = await admin
    .from("stat_entries")
    .select("value")
    .eq("stat_id", stat.id)
    .lt("week_start", input.weekStart)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  const previousValue = previous?.value == null ? null : Number(previous.value);
  const condition = calculateCondition(value, previousValue, stat.good_direction);
  await admin.from("stat_entries").upsert(
    {
      stat_id: stat.id,
      profile_id: user.id,
      practice_id: practiceId,
      week_start: input.weekStart,
      value,
      is_manual_override: true,
      previous_value: previousValue,
      percent_change: condition.percentChange,
      auto_condition: condition.condition,
      self_condition: condition.condition,
      updated_by: user.id,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stat_id,week_start" },
  );
  await refreshSumOfWeeklyTotalDependents(
    stat.id,
    input.weekStart,
    user.id,
    practiceId,
  );
  revalidatePath("/stats");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function resetWeeklyOverride(statId: string, weekStart: string) {
  const access = await canEditStat(statId);
  if ("error" in access) return { error: access.error };
  const { user, stat, supabase } = access;
  const practiceId = await getCurrentPracticeId(supabase);
  const admin = createAdminClient();
  await admin.from("stat_entries").update({ is_manual_override: false }).eq("stat_id", statId).eq("week_start", weekStart);
  await syncWeekly(stat, weekStart, user.id, practiceId);
  await refreshSumOfWeeklyTotalDependents(
    stat.id,
    weekStart,
    user.id,
    practiceId,
  );
  revalidatePath("/stats");
  revalidatePath("/dashboard");
  return { success: true };
}
