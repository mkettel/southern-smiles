import { getMyStatsForWeek, getOtherStatsForWeek } from "@/actions/stat-entries";
import { getProfile } from "@/actions/auth";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWeekStart,
  getNextWeekStart,
  formatWeekLabel,
} from "@/lib/constants";
import { StatEntryForm } from "@/components/stats/stat-entry-form";
import { OtherStatsSection } from "@/components/stats/other-stats-section";
import { WeekSelector } from "@/components/dashboard/week-selector";
import { Separator } from "@/components/ui/separator";
import type { ConditionPlaybook, Profile } from "@/lib/types";

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
  const profile = (await getProfile()) as Profile | null;
  const isAdmin = profile?.role === "admin";

  const [stats, playbooks, otherStats] = await Promise.all([
    getMyStatsForWeek(weekStart),
    getPlaybooks(),
    isAdmin ? getOtherStatsForWeek(weekStart) : Promise.resolve([]),
  ]);

  const hasExistingEntries = stats.some((s) => s.existingEntry !== null);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            {hasExistingEntries ? "Edit Stats" : "Enter Stats"}
          </h1>
          <p className="text-muted-foreground">{weekLabel}</p>
        </div>
        <WeekSelector currentWeek={weekStart} />
      </div>
      <StatEntryForm
        weekStart={weekStart}
        weekLabel={weekLabel}
        stats={stats}
        playbooks={playbooks}
        isEditing={hasExistingEntries}
        advancedFromWeek={advancedFromWeek}
        advancedFromWeekLabel={advancedFromWeekLabel}
        hideHeader
      />
      {isAdmin && otherStats.length > 0 && (
        <>
          <Separator className="my-8" />
          <OtherStatsSection
            weekStart={weekStart}
            stats={otherStats}
            playbooks={playbooks}
          />
        </>
      )}
    </div>
  );
}

async function getPlaybooks(): Promise<ConditionPlaybook[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("condition_playbooks").select("*");
  return (data as ConditionPlaybook[]) ?? [];
}
