export type StatsMode = "daily" | "weekly";

export function buildStatsHref({
  mode,
  week,
  division,
}: {
  mode: StatsMode;
  week: string;
  division?: string;
}) {
  const params = new URLSearchParams({ mode, week });

  if (division && division !== "all") {
    params.set("division", division);
  }

  return `/stats?${params.toString()}`;
}
