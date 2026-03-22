import { getMyStatsForWeek } from "@/actions/stat-entries";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWeekStart, formatWeekLabel } from "@/lib/constants";
import { StatEntryForm } from "@/components/stats/stat-entry-form";
import type { ConditionPlaybook } from "@/lib/types";

export default async function EnterStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const weekStart = params.week ?? getCurrentWeekStart();
  const weekLabel = formatWeekLabel(weekStart);

  const [stats, playbooks] = await Promise.all([
    getMyStatsForWeek(weekStart),
    getPlaybooks(),
  ]);

  return (
    <div className="max-w-2xl mx-auto">
      <StatEntryForm
        weekStart={weekStart}
        weekLabel={weekLabel}
        stats={stats}
        playbooks={playbooks}
      />
    </div>
  );
}

async function getPlaybooks(): Promise<ConditionPlaybook[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("condition_playbooks").select("*");
  return (data as ConditionPlaybook[]) ?? [];
}
