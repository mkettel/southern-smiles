import { createAdminClient } from "@/lib/supabase/admin";
import { calculateCondition } from "@/lib/conditions";
import { calculateSumOfWeeklyTotals } from "@/lib/stat-formulas";
import type { Stat, StatEntry } from "@/lib/types";

export async function refreshSumOfWeeklyTotalDependents(
  sourceStatId: string,
  weekStart: string,
  actorId: string,
  practiceId: string,
) {
  const admin = createAdminClient();
  const { data: dependents } = await admin
    .from("stats")
    .select("*")
    .eq("weekly_formula", "sum_of_weekly_totals")
    .contains("formula_source_stat_ids", [sourceStatId]);

  for (const dependent of (dependents ?? []) as Stat[]) {
    const { data: sourceEntries } = await admin
      .from("stat_entries")
      .select("value")
      .in("stat_id", dependent.formula_source_stat_ids)
      .eq("week_start", weekStart);
    const calculated = calculateSumOfWeeklyTotals(sourceEntries ?? []);
    const [{ data: existing }, { data: previous }] = await Promise.all([
      admin
        .from("stat_entries")
        .select("*")
        .eq("stat_id", dependent.id)
        .eq("week_start", weekStart)
        .maybeSingle(),
      admin
        .from("stat_entries")
        .select("value")
        .eq("stat_id", dependent.id)
        .lt("week_start", weekStart)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (calculated === null) {
      if (existing && !existing.is_manual_override) {
        await admin.from("stat_entries").delete().eq("id", existing.id);
      }
      continue;
    }

    const typedExisting = existing as StatEntry | null;
    const previousValue = previous?.value == null ? null : Number(previous.value);
    const condition = calculateCondition(
      calculated,
      previousValue,
      dependent.good_direction,
    );
    await admin.from("stat_entries").upsert(
      {
        stat_id: dependent.id,
        profile_id: actorId,
        practice_id: practiceId,
        week_start: weekStart,
        value: typedExisting?.is_manual_override
          ? Number(typedExisting.value)
          : calculated,
        calculated_value: calculated,
        is_manual_override: typedExisting?.is_manual_override ?? false,
        previous_value: previousValue,
        percent_change: condition.percentChange,
        auto_condition: condition.condition,
        self_condition: typedExisting?.self_condition ?? condition.condition,
        final_condition: typedExisting?.final_condition ?? null,
        playbook_response: typedExisting?.playbook_response ?? null,
        updated_by: actorId,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stat_id,week_start" },
    );
  }
}
