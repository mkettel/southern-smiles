"use client";

import { addWeeks, format, parseISO, startOfWeek } from "date-fns";
import { StatDetailView } from "@/components/stats/stat-detail-view";
import { statChartToday } from "@/lib/stat-chart-range";
import type { StatEntry } from "@/lib/types";

export function StatRangePreview() {
  const lastWeek = startOfWeek(parseISO(statChartToday()), { weekStartsOn: 1 });
  const entries: StatEntry[] = Array.from({ length: 80 }, (_, i) => ({
    id: `sample-${i}`, stat_id: "sample", profile_id: "sample",
    week_start: format(addWeeks(lastWeek, i - 79), "yyyy-MM-dd"),
    value: i === 12 ? 96 : i < 28 ? 18 + (i * 7) % 21 : Math.round(29 + (i - 28) * 0.32 + Math.sin(i * 1.7) * 4),
    previous_value: null, percent_change: null, auto_condition: null, self_condition: null,
    final_condition: null, playbook_response: null,
    submitted_at: "2026-09-27T12:00:00Z", updated_at: "2026-09-27T12:00:00Z",
  }));
  return <main className="mx-auto w-full max-w-6xl space-y-7 px-4 py-8 sm:px-8">
    <header className="mx-auto flex max-w-4xl flex-wrap justify-between gap-2 border-b pb-4 text-sm"><span>Southern Smiles / Stats</span><span className="text-muted-foreground">Local preview · Sample data</span></header>
    <StatDetailView statId="sample" statName="New patient consultations" statType="count" divisionLabel="Marketing" postTitle="Consultations" entries={entries} />
  </main>;
}
