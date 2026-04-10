"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown } from "lucide-react";
import { ConditionDisplay } from "./condition-display";
import { StatName } from "./stat-name";
import { PlaybookPanel } from "./playbook-panel";
import { calculateCondition, type ConditionResult } from "@/lib/conditions";
import { formatStatValue } from "@/lib/utils";
import { formatWeekLabel, weeksBetween } from "@/lib/constants";
import { submitWeeklyStats } from "@/actions/stat-entries";
import type { OtherStatForEntry, ConditionPlaybook, StatType } from "@/lib/types";

interface OtherStatsSectionProps {
  weekStart: string;
  stats: OtherStatForEntry[];
  playbooks: ConditionPlaybook[];
}

interface EntryState {
  value: string;
  conditionResult: ConditionResult | null;
  playbookResponse: string;
  percentageAmbiguity: { asTyped: number; asWhole: number } | null;
}

export function OtherStatsSection({
  weekStart,
  stats,
  playbooks,
}: OtherStatsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [savingStatId, setSavingStatId] = useState<string | null>(null);
  const [savedStats, setSavedStats] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const s of stats) {
      if (s.existingEntry) initial.add(s.stat.id);
    }
    return initial;
  });

  const [entries, setEntries] = useState<Record<string, EntryState>>(() => {
    const initial: Record<string, EntryState> = {};
    for (const s of stats) {
      const existing = s.existingEntry;
      const value = existing ? String(existing.value) : "";
      let conditionResult: ConditionResult | null = null;
      if (existing) {
        conditionResult = calculateCondition(
          existing.value,
          s.previousValue,
          s.stat.good_direction
        );
      }
      initial[s.stat.id] = {
        value,
        conditionResult,
        playbookResponse: existing?.playbook_response ?? "",
        percentageAmbiguity: null,
      };
    }
    return initial;
  });

  const handleValueChange = useCallback(
    (statId: string, inputValue: string) => {
      const statItem = stats.find((s) => s.stat.id === statId);
      if (!statItem) return;

      const numVal = parseFloat(inputValue);
      let conditionResult: ConditionResult | null = null;

      if (!isNaN(numVal) && inputValue.trim() !== "") {
        conditionResult = calculateCondition(
          numVal,
          statItem.previousValue,
          statItem.stat.good_direction
        );
      }

      setEntries((prev) => ({
        ...prev,
        [statId]: {
          ...prev[statId],
          value: inputValue,
          conditionResult,
          percentageAmbiguity: null,
        },
      }));
    },
    [stats]
  );

  const handleValueBlur = useCallback(
    (statId: string) => {
      setEntries((prev) => {
        const entry = prev[statId];
        if (!entry || entry.value.trim() === "") return prev;

        const num = parseFloat(entry.value);
        if (isNaN(num)) return prev;

        const statItem = stats.find((s) => s.stat.id === statId);
        let normalized = num;

        if (statItem?.stat.stat_type === "percentage") {
          normalized = Math.min(100, Math.max(0, num));

          // Detect ambiguous decimal percentages (e.g. 0.8 could mean 0.8% or 80%)
          if (normalized > 0 && normalized < 1) {
            const asWhole = Math.round(normalized * 100 * 100) / 100;
            if (asWhole <= 100) {
              const conditionResult = calculateCondition(
                normalized,
                statItem.previousValue,
                statItem.stat.good_direction
              );
              return {
                ...prev,
                [statId]: {
                  ...entry,
                  value: String(normalized),
                  conditionResult,
                  percentageAmbiguity: { asTyped: normalized, asWhole },
                },
              };
            }
          }
        }

        if (statItem?.stat.stat_type === "count") {
          normalized = Math.round(normalized);
        }

        const displayValue = String(normalized);
        if (displayValue === entry.value) return prev;

        return {
          ...prev,
          [statId]: { ...entry, value: displayValue },
        };
      });
    },
    [stats]
  );

  const handleResolvePercentage = useCallback(
    (statId: string, chosenValue: number) => {
      const statItem = stats.find((s) => s.stat.id === statId);
      if (!statItem) return;

      const conditionResult = calculateCondition(
        chosenValue,
        statItem.previousValue,
        statItem.stat.good_direction
      );

      setEntries((prev) => ({
        ...prev,
        [statId]: {
          ...prev[statId],
          value: String(chosenValue),
          conditionResult,
          percentageAmbiguity: null,
        },
      }));
    },
    [stats]
  );

  const handlePlaybookChange = useCallback(
    (statId: string, response: string) => {
      setEntries((prev) => ({
        ...prev,
        [statId]: {
          ...prev[statId],
          playbookResponse: response,
        },
      }));
    },
    []
  );

  async function handleSaveSingle(statId: string) {
    const statItem = stats.find((s) => s.stat.id === statId);
    if (!statItem) return;

    const entry = entries[statId];
    if (entry.percentageAmbiguity) {
      toast.error("Please confirm the percentage value first");
      return;
    }
    const val = parseFloat(entry.value);
    if (isNaN(val)) {
      toast.error("Please enter a value");
      return;
    }

    if (!statItem.employee.id) {
      toast.error("No employee assigned to this post. Assign an employee first.");
      return;
    }

    setSavingStatId(statId);
    const result = await submitWeeklyStats({
      week_start: weekStart,
      profile_id: statItem.employee.id,
      entries: [
        {
          stat_id: statId,
          value: val,
          self_condition: entry.conditionResult?.condition ?? null,
          playbook_response: entry.playbookResponse || null,
        },
      ],
    });

    if (result.error) {
      toast.error(
        typeof result.error === "string" ? result.error : "Save failed"
      );
    } else {
      toast.success(`Saved ${statItem.stat.name} for ${statItem.employee.full_name}`);
      setSavedStats((prev) => new Set(prev).add(statId));
    }
    setSavingStatId(null);
  }

  // Group stats by employee
  const grouped = stats.reduce<
    Map<string, { employee: OtherStatForEntry["employee"]; stats: OtherStatForEntry[] }>
  >((acc, s) => {
    const key = s.employee.id;
    if (!acc.has(key)) {
      acc.set(key, { employee: s.employee, stats: [] });
    }
    acc.get(key)!.stats.push(s);
    return acc;
  }, new Map());

  const enteredCount = stats.filter((s) => s.existingEntry !== null).length;
  const totalCount = stats.length;

  if (stats.length === 0) return null;

  return (
    <div className="space-y-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div>
          <h2 className="text-lg font-semibold">Other Stats</h2>
          <p className="text-sm text-muted-foreground">
            {enteredCount} of {totalCount} entered this week
          </p>
        </div>
        <ChevronDown
          className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded && (
        <div className="space-y-6">
          {[...grouped.entries()].map(([employeeId, group]) => (
            <div key={employeeId} className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                {group.employee.full_name}
              </h3>
              {group.stats.map((statItem) => {
                const entry = entries[statItem.stat.id];
                const { stat } = statItem;
                const hasExisting = statItem.existingEntry !== null;

                return (
                  <Card
                    key={stat.id}
                    className={hasExisting && !entry.value ? "border-green-800/30" : ""}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">
                            <StatName
                              name={stat.name}
                              description={stat.description}
                            />
                          </CardTitle>
                          {hasExisting && (
                            <Badge
                              variant="outline"
                              className="text-xs text-green-600 border-green-600/30"
                            >
                              Entered: {formatStatValue(statItem.existingEntry!.value, stat.stat_type)}
                            </Badge>
                          )}
                          {!hasExisting && (
                            <Badge
                              variant="outline"
                              className="text-xs text-muted-foreground"
                            >
                              Not entered
                            </Badge>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {stat.post?.title}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Week prior
                        {statItem.previousWeekStart && (() => {
                          const missing =
                            weeksBetween(
                              statItem.previousWeekStart,
                              weekStart
                            ) - 1;
                          return (
                            <span className="text-xs">
                              {" "}
                              ({formatWeekLabel(statItem.previousWeekStart)}
                              {missing > 0 && (
                                <span className="text-amber-500">
                                  {" · "}
                                  {missing}-week gap
                                </span>
                              )}
                              )
                            </span>
                          );
                        })()}
                        :{" "}
                        {statItem.previousValue !== null ? (
                          <span className="font-medium text-foreground">
                            {formatStatValue(
                              statItem.previousValue,
                              stat.stat_type
                            )}
                          </span>
                        ) : (
                          <span className="italic">Never entered</span>
                        )}
                      </p>

                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <Label htmlFor={`other-stat-${stat.id}`} className="sr-only">
                            {stat.name}
                          </Label>
                          <div className="relative">
                            {stat.stat_type === "dollar" && (
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                                $
                              </span>
                            )}
                            <Input
                              id={`other-stat-${stat.id}`}
                              type="number"
                              step={stat.stat_type === "count" ? "1" : "0.01"}
                              min="0"
                              max={
                                stat.stat_type === "percentage" ? "100" : undefined
                              }
                              placeholder={
                                hasExisting
                                  ? `Current: ${formatStatValue(statItem.existingEntry!.value, stat.stat_type)}`
                                  : `Enter ${stat.stat_type === "dollar" ? "amount" : stat.stat_type === "percentage" ? "percentage" : "count"}`
                              }
                              value={entry.value}
                              onChange={(e) =>
                                handleValueChange(stat.id, e.target.value)
                              }
                              onBlur={() => handleValueBlur(stat.id)}
                              className={stat.stat_type === "dollar" ? "pl-7" : ""}
                            />
                            {stat.stat_type === "percentage" && (
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                                %
                              </span>
                            )}
                          </div>
                        </div>
                        {entry.conditionResult && (
                          <ConditionDisplay
                            condition={entry.conditionResult.condition}
                          />
                        )}
                      </div>

                      {entry.percentageAmbiguity && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
                          <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">
                            Did you mean{" "}
                            <strong>{entry.percentageAmbiguity.asTyped}%</strong> or{" "}
                            <strong>{entry.percentageAmbiguity.asWhole}%</strong>?
                          </p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleResolvePercentage(
                                  stat.id,
                                  entry.percentageAmbiguity!.asTyped
                                )
                              }
                            >
                              {entry.percentageAmbiguity.asTyped}%
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleResolvePercentage(
                                  stat.id,
                                  entry.percentageAmbiguity!.asWhole
                                )
                              }
                            >
                              {entry.percentageAmbiguity.asWhole}%
                            </Button>
                          </div>
                        </div>
                      )}

                      {entry.conditionResult && (
                        <PlaybookPanel
                          condition={entry.conditionResult.condition}
                          playbooks={playbooks}
                          response={entry.playbookResponse}
                          onResponseChange={(r) =>
                            handlePlaybookChange(stat.id, r)
                          }
                        />
                      )}

                      {entry.value && (
                        <div className="flex items-center justify-end gap-2 pt-1">
                          {savedStats.has(stat.id) && savingStatId !== stat.id && (
                            <span className="flex items-center gap-1 text-xs text-green-600">
                              <Check className="h-3 w-3" />
                              Saved
                            </span>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSaveSingle(stat.id)}
                            disabled={savingStatId === stat.id}
                          >
                            {savingStatId === stat.id
                              ? "Saving..."
                              : hasExisting
                                ? "Overwrite"
                                : "Save"}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
