import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import {
  getAdminDashboard,
  getMissingSubmissions,
} from "@/actions/dashboard";
import { getCurrentWeekStart, formatWeekLabel } from "@/lib/constants";
import { StatCard } from "@/components/dashboard/stat-card";
import { MissingSubmissions } from "@/components/dashboard/missing-submissions";
import { WeekSelector } from "@/components/dashboard/week-selector";
import Link from "next/link";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const weekStart = params.week ?? getCurrentWeekStart();
  const isAdmin = profile.role === "admin";

  const [stats, missing] = await Promise.all([
    getAdminDashboard(weekStart),
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
        (() => {
          // Group stats by division
          const grouped = new Map<string, { label: string; number: number; stats: typeof stats }>();
          for (const statData of stats) {
            const div = statData.division;
            const key = div?.id ?? "unknown";
            const label = div ? `Div ${div.number} – ${div.name}` : "Other";
            const num = div?.number ?? 99;
            if (!grouped.has(key)) {
              grouped.set(key, { label, number: num, stats: [] });
            }
            grouped.get(key)!.stats.push(statData);
          }
          // Sort by division number
          const sortedGroups = Array.from(grouped.values()).sort(
            (a, b) => a.number - b.number
          );

          return (
            <div className="space-y-8">
              {sortedGroups.map((group) => (
                <div key={group.label}>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    {group.label}
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {group.stats.map((statData) => (
                      <StatCard key={statData.stat.id} data={statData} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          No stats data available for this week.
        </div>
      )}
    </div>
  );
}
