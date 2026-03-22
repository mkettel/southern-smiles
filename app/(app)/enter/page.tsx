import { getMyStatsForWeek } from "@/actions/stat-entries";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWeekStart,
  getNextWeekStart,
  formatWeekLabel,
} from "@/lib/constants";
import { StatEntryForm } from "@/components/stats/stat-entry-form";
import type { ConditionPlaybook } from "@/lib/types";

export default async function EnterStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; from?: string }>;
}) {
  const params = await searchParams;
  const currentWeek = getCurrentWeekStart();
  let weekStart = params.week ?? currentWeek;
  let advancedFromWeek: string | null = params.from ?? null;
  let advancedFromWeekLabel: string | null = advancedFromWeek
    ? formatWeekLabel(advancedFromWeek)
    : null;

  // If no explicit week param, check if current week is already fully submitted.
  // If so, advance to next week so the form is blank for new entry.
  if (!params.week) {
    const currentWeekStats = await getMyStatsForWeek(weekStart);
    const allSubmitted =
      currentWeekStats.length > 0 &&
      currentWeekStats.every((s) => s.existingEntry !== null);

    if (allSubmitted) {
      advancedFromWeek = weekStart;
      advancedFromWeekLabel = formatWeekLabel(weekStart);
      weekStart = getNextWeekStart(weekStart);
    }
  }

  const weekLabel = formatWeekLabel(weekStart);

  const [stats, playbooks] = await Promise.all([
    getMyStatsForWeek(weekStart),
    getPlaybooks(),
  ]);

  const hasExistingEntries = stats.some((s) => s.existingEntry !== null);

  return (
    <div className="max-w-2xl mx-auto">
      <StatEntryForm
        weekStart={weekStart}
        weekLabel={weekLabel}
        stats={stats}
        playbooks={playbooks}
        isEditing={hasExistingEntries}
        advancedFromWeek={advancedFromWeek}
        advancedFromWeekLabel={advancedFromWeekLabel}
      />
    </div>
  );
}

async function getPlaybooks(): Promise<ConditionPlaybook[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("condition_playbooks").select("*");
  return (data as ConditionPlaybook[]) ?? [];
}
