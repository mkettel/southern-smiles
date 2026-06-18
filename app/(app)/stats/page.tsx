import Link from "next/link";
import { redirect } from "next/navigation";
import { addDays, format } from "date-fns";
import { CalendarDays, CalendarRange } from "lucide-react";
import { getProfile } from "@/actions/auth";
import { getStatsWorkspace } from "@/actions/stats-workspace";
import { getCurrentWeekStart, formatWeekLabel } from "@/lib/constants";
import { WeekSelector } from "@/components/dashboard/week-selector";
import { StatsWorkspace } from "@/components/stats/stats-workspace";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function getWorkspaceDates(weekStart: string) {
  const monday = new Date(`${weekStart}T00:00:00`);
  return Array.from({ length: 5 }, (_, index) =>
    format(addDays(monday, index), "yyyy-MM-dd"),
  );
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; mode?: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const params = await searchParams;
  const weekStart = params.week ?? getCurrentWeekStart();
  const mode = params.mode === "weekly" ? "weekly" : "daily";
  const data = await getStatsWorkspace(weekStart);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stats</h1>
          <p className="text-sm text-muted-foreground">{formatWeekLabel(weekStart)}</p>
        </div>
        <WeekSelector currentWeek={weekStart} />
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
              href={`/stats?mode=${item.value}&week=${weekStart}`}
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

      {data.setupRequired ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-8 text-center">
            <p className="text-sm font-medium">Database setup required</p>
            <p className="mt-1 text-sm text-muted-foreground">Apply migration 039 to enable the unified Stats workspace.</p>
          </CardContent>
        </Card>
      ) : (
        <StatsWorkspace
          key={`${mode}:${weekStart}`}
          mode={mode}
          weekStart={weekStart}
          dates={getWorkspaceDates(weekStart)}
          stats={data.stats}
          isAdmin={data.isAdmin}
        />
      )}
    </div>
  );
}
