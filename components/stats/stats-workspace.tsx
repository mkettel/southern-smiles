"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calculator, ExternalLink, RotateCcw, Save, Search } from "lucide-react";
import { toast } from "sonner";
import {
  resetWeeklyOverride,
  saveDailyStatInput,
  saveWeeklyOverride,
  type WorkspaceStat,
} from "@/actions/stats-workspace";
import { formatStatValue } from "@/lib/utils";
import { isTotalCreditCardDebtStat } from "@/lib/financial-connections";
import { buildStatsHref } from "@/lib/stats-navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface Props {
  mode: "daily" | "weekly";
  weekStart: string;
  dates: string[];
  stats: WorkspaceStat[];
  isAdmin: boolean;
  billsManagedHidden?: boolean;
  approvedFinancingManagedHidden?: boolean;
  financialDebtManagedHidden?: boolean;
  initialDivisionFilter?: string;
}

const FORMULA_LABELS = {
  sum: "Daily total",
  average: "Daily average",
  manual: "Manual weekly",
  collections_per_staff: "Collections / staff-days",
  ratio_of_sums: "Ratio of weekly totals",
  sum_of_weekly_totals: "Sum of weekly totals",
} as const;

function todayString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function divisionKey(item: WorkspaceStat) {
  return item.post.division?.id ?? "unassigned";
}

function divisionLabel(item: WorkspaceStat) {
  const division = item.post.division;
  if (!division) return "Unassigned";
  return `Division ${division.number} ${division.name}`;
}

function divisionNumber(item: WorkspaceStat) {
  return item.post.division?.number ?? 999;
}

function divisionColor(item: WorkspaceStat) {
  return item.post.division?.color || "#6b7280";
}

function getStaffDays(item: WorkspaceStat) {
  return item.dailyEntries.reduce((sum, entry) => {
    const value = entry.input_value == null ? null : Number(entry.input_value);
    return value === null || !Number.isFinite(value) ? sum : sum + value;
  }, 0);
}

function getMissingStaffDaysForCollections(
  item: WorkspaceStat,
  allStats: WorkspaceStat[],
  dailyValues: Record<string, string>,
) {
  if (item.stat.weekly_formula !== "collections_per_staff") return [];
  if (!item.stat.formula_source_stat_id) return [];

  const collectionsStat = allStats.find(
    (candidate) => candidate.stat.id === item.stat.formula_source_stat_id,
  );
  if (!collectionsStat) return [];

  return collectionsStat.dailyEntries
    .filter((entry) => {
      const value = entry.value == null ? null : Number(entry.value);
      return value !== null && Number.isFinite(value);
    })
    .filter((entry) => {
      const staffKey = `${item.stat.id}:${entry.entry_date}`;
      return (dailyValues[staffKey]?.trim() ?? "") === "";
    })
    .map((entry) => entry.entry_date);
}

function dayLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function sortStats(items: WorkspaceStat[]) {
  return [...items].sort((a, b) => {
    const divisionCompare = divisionNumber(a) - divisionNumber(b);
    if (divisionCompare !== 0) return divisionCompare;
    const postCompare = a.post.title.localeCompare(b.post.title);
    if (postCompare !== 0) return postCompare;
    return a.stat.display_order - b.stat.display_order;
  });
}

function groupByDivision(items: WorkspaceStat[]) {
  const groups = new Map<
    string,
    { key: string; label: string; color: string; number: number; stats: WorkspaceStat[] }
  >();

  for (const item of sortStats(items)) {
    const key = divisionKey(item);
    const group =
      groups.get(key) ??
      {
        key,
        label: divisionLabel(item),
        color: divisionColor(item),
        number: divisionNumber(item),
        stats: [],
      };
    group.stats.push(item);
    groups.set(key, group);
  }

  return [...groups.values()].sort((a, b) => a.number - b.number);
}

export function StatsWorkspace({
  mode,
  weekStart,
  dates,
  stats,
  isAdmin,
  billsManagedHidden = false,
  approvedFinancingManagedHidden = false,
  financialDebtManagedHidden = false,
  initialDivisionFilter = "all",
}: Props) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [divisionFilter, setDivisionFilter] = useState(initialDivisionFilter);
  const [missingTodayOnly, setMissingTodayOnly] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [dailyValues, setDailyValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const item of stats) {
      for (const date of dates) {
        const entry = item.dailyEntries.find((row) => row.entry_date === date);
        const source = item.stat.weekly_formula === "collections_per_staff" ? entry?.input_value : entry?.value;
        initial[`${item.stat.id}:${date}`] = source == null ? "" : String(Number(source));
      }
    }
    return initial;
  });
  const [weeklyValues, setWeeklyValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(stats.map((item) => [item.stat.id, item.weeklyEntry ? String(Number(item.weeklyEntry.value)) : ""])),
  );

  const dailyStats = useMemo(
    () => stats.filter(
      (item) =>
        item.stat.daily_tracking_enabled &&
        item.stat.weekly_formula !== "manual" &&
        item.stat.weekly_formula !== "sum_of_weekly_totals" &&
        (item.stat.weekly_formula !== "ratio_of_sums" || item.dailyInputStatId !== item.stat.id),
    ),
    [stats],
  );
  const today = todayString();
  const todayInWeek = dates.includes(today);
  const modeStats = mode === "daily" ? dailyStats : stats;
  const showOrganizer = isAdmin || modeStats.length > 8;
  const divisionOptions = useMemo(() => {
    const options = new Map<
      string,
      { key: string; label: string; color: string; number: number; count: number }
    >();
    for (const item of modeStats) {
      const key = divisionKey(item);
      const option =
        options.get(key) ??
        {
          key,
          label: divisionLabel(item),
          color: divisionColor(item),
          number: divisionNumber(item),
          count: 0,
        };
      option.count += 1;
      options.set(key, option);
    }
    return [...options.values()].sort((a, b) => a.number - b.number);
  }, [modeStats]);

  function selectDivision(division: string) {
    setDivisionFilter(division);
    router.replace(
      buildStatsHref({ mode, week: weekStart, division }),
      { scroll: false },
    );
  }

  const visibleStats = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return modeStats.filter((item) => {
      if (divisionFilter !== "all" && divisionKey(item) !== divisionFilter) {
        return false;
      }

      if (normalizedSearch) {
        const haystack = [
          item.stat.name,
          item.stat.abbreviation,
          item.post.title,
          item.post.division?.name,
          item.post.division?.number ? `division ${item.post.division.number}` : null,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(normalizedSearch)) return false;
      }

      if (mode === "daily" && missingTodayOnly && todayInWeek) {
        const key = `${item.stat.id}:${today}`;
        return (dailyValues[key]?.trim() ?? "") === "";
      }

      return true;
    });
  }, [dailyValues, divisionFilter, missingTodayOnly, mode, modeStats, search, today, todayInWeek]);
  const groupedStats = useMemo(() => groupByDivision(visibleStats), [visibleStats]);

  function saveDaily(item: WorkspaceStat, date: string) {
    const key = `${item.stat.id}:${date}`;
    const raw = dailyValues[key]?.trim() ?? "";
    const value = raw === "" ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      toast.error("Enter a value of 0 or greater");
      return;
    }
    setPendingKey(key);
    startTransition(async () => {
      const result = await saveDailyStatInput({ statId: item.dailyInputStatId, entryDate: date, value });
      if (result.error) toast.error(result.error);
      else {
        toast.success(raw === "" ? "Day cleared" : "Day saved");
        router.refresh();
      }
      setPendingKey(null);
    });
  }

  function saveWeekly(item: WorkspaceStat) {
    const raw = weeklyValues[item.stat.id]?.trim() ?? "";
    const value = Number(raw);
    if (raw === "" || !Number.isFinite(value) || value < 0) {
      toast.error("Enter a weekly value of 0 or greater");
      return;
    }
    setPendingKey(item.stat.id);
    startTransition(async () => {
      const result = await saveWeeklyOverride({ statId: item.stat.id, weekStart, value });
      if (result.error) toast.error(result.error);
      else {
        toast.success("Weekly total saved");
        router.refresh();
      }
      setPendingKey(null);
    });
  }

  function reset(item: WorkspaceStat) {
    setPendingKey(item.stat.id);
    startTransition(async () => {
      const result = await resetWeeklyOverride(item.stat.id, weekStart);
      if (result.error) toast.error(result.error);
      else {
        if (item.weeklyEntry?.calculated_value != null) {
          setWeeklyValues((current) => ({
            ...current,
            [item.stat.id]: String(Number(item.weeklyEntry?.calculated_value)),
          }));
        }
        toast.success("Restored calculated total");
        router.refresh();
      }
      setPendingKey(null);
    });
  }

  if (modeStats.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {billsManagedHidden
            ? "Your Bills stat is updated automatically from the Bills tracker — there's nothing to enter here."
            : approvedFinancingManagedHidden
              ? "Your Approved Financing stat is updated automatically from Cherry approval imports — there's nothing to enter here."
              : financialDebtManagedHidden
                ? "Your Total Credit Card Debt stat is updated automatically from Financial Connections — there's nothing to enter here."
                : isAdmin
                  ? "No active stats are configured."
                  : "No stats are assigned to you."}
        </CardContent>
      </Card>
    );
  }

  const organizer = (
    <div className="space-y-3 rounded-lg border bg-card/40 p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search stat or post..."
            className="pl-8"
            aria-label="Search stats"
          />
        </div>
        {mode === "daily" && todayInWeek && (
          <Button
            type="button"
          variant={missingTodayOnly ? "default" : "outline"}
          aria-pressed={missingTodayOnly}
          onClick={() => setMissingTodayOnly((current) => !current)}
        >
            Missing today
          </Button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Button
          type="button"
          variant={divisionFilter === "all" ? "default" : "outline"}
          size="sm"
          aria-pressed={divisionFilter === "all"}
          onClick={() => selectDivision("all")}
        >
          All
        </Button>
        {divisionOptions.map((division) => (
          <Button
            key={division.key}
            type="button"
            variant={divisionFilter === division.key ? "default" : "outline"}
            size="sm"
            aria-pressed={divisionFilter === division.key}
            onClick={() => selectDivision(division.key)}
            className="gap-1.5"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: division.color }}
            />
            <span>{division.number === 999 ? "Unassigned" : `Div ${division.number}`}</span>
            <span className="text-xs opacity-70">{division.count}</span>
          </Button>
        ))}
      </div>
    </div>
  );

  const emptyFilteredState = (
    <Card>
      <CardContent className="py-8 text-center text-sm text-muted-foreground">
        No stats match the current filters.
      </CardContent>
    </Card>
  );

  if (mode === "weekly") {
    return (
      <div className="space-y-4">
        {showOrganizer && organizer}
        {groupedStats.length === 0
          ? emptyFilteredState
          : groupedStats.map((group) => (
              <section key={group.key} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: group.color }} />
                  <h2 className="text-sm font-semibold">{group.label}</h2>
                  <span className="text-xs text-muted-foreground">{group.stats.length} stats</span>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {group.stats.map((item) => {
                    const overridden = Boolean(item.weeklyEntry?.is_manual_override);
                    const isSourceTotal =
                      item.stat.weekly_formula === "sum_of_weekly_totals";
                    const isFinancialDebt = isTotalCreditCardDebtStat(item.stat);
                    const missingStaffDates = getMissingStaffDaysForCollections(item, stats, dailyValues);
                    return (
                      <Card
                        key={item.stat.id}
                        size="sm"
                        style={{ borderColor: group.color }}
                        className="border ring-0"
                      >
                        <CardHeader>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <CardTitle className="text-base">{item.stat.name}</CardTitle>
                              <p className="mt-1 text-xs text-muted-foreground">{item.post.title}</p>
                            </div>
                            <Badge variant={overridden ? "default" : "secondary"}>
                              {isFinancialDebt
                                ? "Auto-synced"
                                : overridden
                                  ? "Manual override"
                                  : FORMULA_LABELS[item.stat.weekly_formula]}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {isFinancialDebt ? (
                            <div className="space-y-3">
                              <div>
                                <p className="text-3xl font-semibold tabular-nums">
                                  {item.weeklyEntry
                                    ? formatStatValue(
                                        Number(item.weeklyEntry.value),
                                        item.stat.stat_type,
                                      )
                                    : "—"}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Updated automatically from included cards in Financial Connections.
                                </p>
                              </div>
                              {isAdmin && (
                                <Link
                                  href="/admin/financial-connections"
                                  className={buttonVariants({ variant: "outline", size: "sm" })}
                                >
                                  Review connections
                                  <ExternalLink />
                                </Link>
                              )}
                            </div>
                          ) : isSourceTotal ? (
                            <div>
                              <p className="text-3xl font-semibold tabular-nums">
                                {item.weeklyEntry
                                  ? formatStatValue(
                                      Number(item.weeklyEntry.value),
                                      item.stat.stat_type,
                                    )
                                  : "—"}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Calculated automatically from the five outflow stats.
                              </p>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <Input
                                type="number"
                                min="0"
                                step={item.stat.stat_type === "count" ? "1" : "0.01"}
                                value={weeklyValues[item.stat.id] ?? ""}
                                onChange={(event) => setWeeklyValues((current) => ({ ...current, [item.stat.id]: event.target.value }))}
                                aria-label={`${item.stat.name} weekly value`}
                              />
                              <Button size="icon" onClick={() => saveWeekly(item)} disabled={isPending && pendingKey === item.stat.id} aria-label="Save weekly total">
                                <Save className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                          {overridden && item.weeklyEntry?.calculated_value != null && (
                            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                              <span>Calculated: {formatStatValue(Number(item.weeklyEntry.calculated_value), item.stat.stat_type)}</span>
                              <Button variant="ghost" size="sm" onClick={() => reset(item)}>
                                <RotateCcw className="h-3.5 w-3.5" />
                                Reset to calculated
                              </Button>
                            </div>
                          )}
                          {missingStaffDates.length > 0 && (
                            <p className="rounded-md bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300">
                              Staff-days missing for {missingStaffDates.map(dayLabel).join(", ")}. Weekly total will pause until filled.
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showOrganizer && organizer}
      {groupedStats.length === 0
        ? emptyFilteredState
        : groupedStats.map((group) => (
            <section key={group.key} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: group.color }} />
                <h2 className="text-sm font-semibold">{group.label}</h2>
                <span className="text-xs text-muted-foreground">{group.stats.length} stats</span>
              </div>
              <div className="space-y-3">
                {group.stats.map((item) => {
                  const missingStaffDates = getMissingStaffDaysForCollections(item, stats, dailyValues);
                  return (
                    <Card
                      key={item.stat.id}
                      style={{ borderColor: group.color }}
                      className="border ring-0"
                    >
                      <CardHeader className="pb-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <CardTitle className="text-base">{item.stat.name}</CardTitle>
                            <p className="mt-1 text-xs text-muted-foreground">{item.post.title}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">
                              {item.dailyInputPrompt
                                ? "Weekly booking rate"
                                : FORMULA_LABELS[item.stat.weekly_formula]}
                            </Badge>
                            {item.stat.weekly_formula === "collections_per_staff" && (
                              <Badge variant="secondary">{getStaffDays(item)} staff-days</Badge>
                            )}
                            {item.weeklyEntry && (
                              <Badge variant="secondary">Week: {formatStatValue(Number(item.weeklyEntry.value), item.stat.stat_type)}</Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {item.dailyInputPrompt && (
                          <p className="text-sm font-medium">{item.dailyInputPrompt}</p>
                        )}
                        {missingStaffDates.length > 0 && (
                          <p className="rounded-md bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300">
                            Staff-days missing for {missingStaffDates.map(dayLabel).join(", ")}. Weekly total will pause until filled.
                          </p>
                        )}
                        <div className="grid gap-3 sm:grid-cols-5">
                          {dates.map((date) => {
                            const key = `${item.stat.id}:${date}`;
                            const entry = item.dailyEntries.find((row) => row.entry_date === date);
                            const derived = item.stat.weekly_formula === "collections_per_staff";
                            return (
                              <div key={date} className="space-y-1.5">
                                <label htmlFor={key} className="block text-xs font-medium text-muted-foreground">{dayLabel(date)}</label>
                                <div className="flex gap-1.5">
                                  <Input
                                    id={key}
                                    type="number"
                                    min="0"
                                    step={derived ? "0.5" : item.stat.stat_type === "count" ? "1" : "0.01"}
                                    value={dailyValues[key] ?? ""}
                                    placeholder={
                                      derived
                                        ? "Staff worked"
                                        : item.dailyInputPrompt
                                          ? "Booked"
                                          : undefined
                                    }
                                    onChange={(event) => setDailyValues((current) => ({ ...current, [key]: event.target.value }))}
                                    onBlur={() => saveDaily(item, date)}
                                    onWheel={(event) => event.currentTarget.blur()}
                                  />
                                  <Button variant="outline" size="icon-sm" onClick={() => saveDaily(item, date)} disabled={isPending && pendingKey === key} aria-label="Save daily stat">
                                    <Save className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                                {derived && (
                                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <Calculator className="h-3 w-3" />
                                    {entry?.value == null ? "Enter Collections first" : `Daily preview: ${formatStatValue(Number(entry.value), item.stat.stat_type)}`}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
    </div>
  );
}
