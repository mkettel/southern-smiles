"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calculator, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import {
  resetWeeklyOverride,
  saveDailyStatInput,
  saveWeeklyOverride,
  type WorkspaceStat,
} from "@/actions/stats-workspace";
import { formatStatValue } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface Props {
  mode: "daily" | "weekly";
  weekStart: string;
  dates: string[];
  stats: WorkspaceStat[];
  isAdmin: boolean;
}

const FORMULA_LABELS = {
  sum: "Daily total",
  average: "Daily average",
  manual: "Manual weekly",
  collections_per_staff: "Collections per staff average",
} as const;

function dayLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function StatsWorkspace({ mode, weekStart, dates, stats, isAdmin }: Props) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
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
    () => stats.filter((item) => item.stat.daily_tracking_enabled && item.stat.weekly_formula !== "manual"),
    [stats],
  );

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
      const result = await saveDailyStatInput({ statId: item.stat.id, entryDate: date, value });
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

  if ((mode === "daily" ? dailyStats : stats).length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {isAdmin ? "No active stats are configured." : "No stats are assigned to you."}
        </CardContent>
      </Card>
    );
  }

  if (mode === "weekly") {
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        {stats.map((item) => {
          const overridden = Boolean(item.weeklyEntry?.is_manual_override);
          return (
            <Card key={item.stat.id} size="sm">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{item.stat.name}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">{item.post.title}</p>
                  </div>
                  <Badge variant={overridden ? "default" : "secondary"}>
                    {overridden ? "Manual override" : FORMULA_LABELS[item.stat.weekly_formula]}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
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
                {overridden && item.weeklyEntry?.calculated_value != null && (
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>Calculated: {formatStatValue(Number(item.weeklyEntry.calculated_value), item.stat.stat_type)}</span>
                    <Button variant="ghost" size="sm" onClick={() => reset(item)}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reset to calculated
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {dailyStats.map((item) => (
        <Card key={item.stat.id}>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base">{item.stat.name}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{item.post.title}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{FORMULA_LABELS[item.stat.weekly_formula]}</Badge>
                {item.weeklyEntry && (
                  <Badge variant="secondary">Week: {formatStatValue(Number(item.weeklyEntry.value), item.stat.stat_type)}</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
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
                        placeholder={derived ? "Staff" : undefined}
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
                        {entry?.value == null ? "Needs Collections" : formatStatValue(Number(entry.value), item.stat.stat_type)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
