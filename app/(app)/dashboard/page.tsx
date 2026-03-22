import { getProfile } from "@/actions/auth";
import {
  getAdminDashboard,
  getEmployeeDashboard,
  getMissingSubmissions,
} from "@/actions/dashboard";
import { getCurrentWeekStart, formatWeekLabel } from "@/lib/constants";
import { StatCard } from "@/components/dashboard/stat-card";
import { MissingSubmissions } from "@/components/dashboard/missing-submissions";
import { WeekSelector } from "@/components/dashboard/week-selector";
import Link from "next/link";
import type { Profile } from "@/lib/types";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const profile = (await getProfile()) as Profile;
  const weekStart = params.week ?? getCurrentWeekStart();
  const isAdmin = profile.role === "admin";

  const [stats, missing] = await Promise.all([
    isAdmin
      ? getAdminDashboard(weekStart)
      : getEmployeeDashboard(weekStart),
    isAdmin ? getMissingSubmissions(weekStart) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">{formatWeekLabel(weekStart)}</p>
        </div>
        <div className="flex items-center gap-3">
          <WeekSelector currentWeek={weekStart} />
          {!isAdmin && (
            <Link
              href={`/enter?week=${weekStart}`}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors"
            >
              Enter Stats
            </Link>
          )}
        </div>
      </div>

      {isAdmin && missing.length > 0 && (
        <MissingSubmissions missing={missing} />
      )}

      {stats.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((statData) => (
            <StatCard key={statData.stat.id} data={statData} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          No stats data available for this week.
        </div>
      )}
    </div>
  );
}
