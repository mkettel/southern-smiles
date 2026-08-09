import Link from "next/link";
import { redirect } from "next/navigation";
import { addDays, format } from "date-fns";
import { CalendarDays, CalendarRange, CheckCircle2, ListChecks } from "lucide-react";
import { getProfile } from "@/actions/auth";
import { getStatsWorkspace } from "@/actions/stats-workspace";
import { getCurrentWeekStart, formatWeekLabel } from "@/lib/constants";
import { WeekSelector } from "@/components/dashboard/week-selector";
import { StatsWorkspace } from "@/components/stats/stats-workspace";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { buildStatsHref } from "@/lib/stats-navigation";

function getWorkspaceDates(weekStart: string) {
  const monday = new Date(`${weekStart}T00:00:00`);
  return Array.from({ length: 5 }, (_, index) =>
    format(addDays(monday, index), "yyyy-MM-dd"),
  );
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; mode?: string; division?: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const params = await searchParams;
  const weekStart = params.week ?? getCurrentWeekStart();
  const mode = params.mode === "weekly" ? "weekly" : "daily";
  const data = await getStatsWorkspace(weekStart);

  const dates = getWorkspaceDates(weekStart);
  const today = format(new Date(), "yyyy-MM-dd");
  const showTodayChecklist =
    mode === "daily" && !data.setupRequired && dates.includes(today);
  const dailyStats = data.stats.filter(
    (item) =>
      item.stat.daily_tracking_enabled &&
      item.stat.weekly_formula !== "manual" &&
      item.stat.weekly_formula !== "sum_of_weekly_totals" &&
      (item.stat.weekly_formula !== "ratio_of_sums" ||
        item.dailyInputStatId !== item.stat.id),
  );
  const modeStats = mode === "daily" ? dailyStats : data.stats;
  const requestedDivision = params.division ?? "all";
  const divisionFilter =
    requestedDivision === "all" ||
    modeStats.some(
      (item) => (item.post.division?.id ?? "unassigned") === requestedDivision,
    )
      ? requestedDivision
      : "all";
  const enteredToday = dailyStats.filter((item) =>
    item.dailyEntries.some(
      (entry) =>
        entry.entry_date === today &&
        (entry.input_value != null || entry.value != null),
    ),
  ).length;
  const allDoneToday = dailyStats.length > 0 && enteredToday === dailyStats.length;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stats</h1>
          <p className="text-sm text-muted-foreground">{formatWeekLabel(weekStart)}</p>
        </div>
        <WeekSelector
          currentWeek={weekStart}
          mode={mode}
          division={divisionFilter}
        />
      </div>

      <div className="inline-flex h-9 items-center rounded-md bg-muted p-1">
        {[
          { value: "daily", label: "Daily", icon: CalendarDays },
          { value: "weekly", label: "Weekly", icon: CalendarRange },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.value}
              href={buildStatsHref({
                mode: item.value as "daily" | "weekly",
                week: weekStart,
                division: divisionFilter,
              })}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded px-3 text-sm font-medium transition-colors",
                mode === item.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>

      {showTodayChecklist && dailyStats.length > 0 && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border p-3 text-sm",
            allDoneToday
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-border bg-card",
          )}
        >
          {allDoneToday ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <ListChecks className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-medium">
            Today, {format(new Date(`${today}T00:00:00`), "EEE")}
          </span>
          <span className="text-muted-foreground">
            {allDoneToday
              ? "all stats entered"
              : `${enteredToday} of ${dailyStats.length} entered`}
          </span>
        </div>
      )}

      {data.setupRequired ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-8 text-center">
            <p className="text-sm font-medium">Database setup required</p>
            <p className="mt-1 text-sm text-muted-foreground">Apply migration 039 to enable the unified Stats workspace.</p>
          </CardContent>
        </Card>
      ) : (
        <StatsWorkspace
          key={`${mode}:${weekStart}:${divisionFilter}`}
          mode={mode}
          weekStart={weekStart}
          dates={dates}
          stats={data.stats}
          isAdmin={data.isAdmin}
          billsManagedHidden={data.billsManagedHidden ?? false}
          approvedFinancingManagedHidden={data.approvedFinancingManagedHidden ?? false}
          financialDebtManagedHidden={data.financialDebtManagedHidden ?? false}
          initialDivisionFilter={divisionFilter}
        />
      )}
    </div>
  );
}
