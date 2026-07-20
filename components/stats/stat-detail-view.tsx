"use client";

import { Fragment, useState, useMemo } from "react";
import Link from "next/link";
import { StatTrendPanel } from "@/components/stats/stat-trend-panel";
import { ConditionDisplay } from "@/components/stats/condition-display";
import { formatStatValue, formatPercentChange } from "@/lib/utils";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatName } from "@/components/stats/stat-name";
import type {
  StatComparisonOption,
  StatEntry,
  StatType,
  OicLogEntry,
} from "@/lib/types";
import { calculateCondition } from "@/lib/conditions";
import type { ConditionName } from "@/lib/conditions";
import { BadgeDollarSign, ChevronRight, MessageSquareText, ReceiptText, Users } from "lucide-react";
import { EntryRowActions } from "@/components/stats/entry-row-actions";
import { ConditionPicker } from "@/components/stats/condition-picker";

interface StatDetailViewProps {
  statId: string;
  statName: string;
  statType: StatType;
  statDescription?: string | null;
  goodDirection?: "up" | "down";
  divisionLabel: string;
  postTitle: string;
  entries: StatEntry[];
  oicEntries?: OicLogEntry[];
  isAdmin?: boolean;
  isBillsStat?: boolean;
  isCherryApprovedFinancingStat?: boolean;
  comparisonOptions?: StatComparisonOption[];
}

/** A single week's data: aggregated total + individual contributor entries */
interface WeekGroup {
  weekStart: string;
  totalValue: number;
  entries: StatEntry[];
  /** Effective condition shown to the user — final override if set, else auto. */
  condition: ConditionName | null;
  /** Auto-calculated condition from WoW % change, ignoring override. */
  autoCondition: ConditionName | null;
  /** Latest entry for this week — where the override is stored. */
  latestEntryId: string;
  hasOverride: boolean;
  percentChange: number | null;
  playbookResponse: string | null;
}

export function StatDetailView({
  statId,
  statName,
  statType,
  statDescription,
  goodDirection = "up",
  divisionLabel,
  postTitle,
  entries,
  oicEntries = [],
  isAdmin = false,
  isBillsStat = false,
  isCherryApprovedFinancingStat = false,
  comparisonOptions = [],
}: StatDetailViewProps) {
  const employees = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of entries) {
      if (entry.profile) {
        map.set(entry.profile.id, entry.profile.full_name);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [entries]);

  const hasMultipleEmployees = employees.length > 1;
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("all");
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [expandedPlaybooks, setExpandedPlaybooks] = useState<Set<string>>(
    new Set()
  );

  const filteredEntries = useMemo(() => {
    if (selectedEmployeeId === "all") return entries;
    return entries.filter((e) => e.profile_id === selectedEmployeeId);
  }, [entries, selectedEmployeeId]);

  /** Group entries by week, aggregate values, and recompute % change from aggregated totals */
  const weekGroups = useMemo((): WeekGroup[] => {
    const byWeek = new Map<string, StatEntry[]>();
    for (const entry of filteredEntries) {
      const list = byWeek.get(entry.week_start) ?? [];
      list.push(entry);
      byWeek.set(entry.week_start, list);
    }

    // Sort weeks newest-first, but we need chronological order to compute % change
    const weeksSorted = Array.from(byWeek.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    );

    const groups: WeekGroup[] = [];
    let previousTotal: number | null = null;

    for (const [weekStart, weekEntries] of weeksSorted) {
      const sorted = [...weekEntries].sort((a, b) =>
        b.submitted_at.localeCompare(a.submitted_at)
      );
      const latest = sorted[0];
      const totalValue = weekEntries.reduce(
        (sum, e) => sum + Number(e.value),
        0
      );

      // Recalculate % change and condition from aggregated totals
      const result = calculateCondition(totalValue, previousTotal, goodDirection);

      const autoCondition =
        previousTotal !== null ? result.condition : (latest.auto_condition ?? null);

      groups.push({
        weekStart,
        totalValue,
        entries: weekEntries,
        condition: latest.final_condition ?? autoCondition,
        autoCondition,
        latestEntryId: latest.id,
        hasOverride: latest.final_condition !== null,
        percentChange: previousTotal !== null ? result.percentChange : null,
        playbookResponse: latest.playbook_response ?? null,
      });

      previousTotal = totalValue;
    }

    // Return newest-first for display
    return groups.reverse();
  }, [filteredEntries, goodDirection]);

  /** Aggregated data for the chart — one point per week with summed values */
  const aggregatedChartEntries = useMemo((): StatEntry[] => {
    return weekGroups
      .map((wg) => {
        const latest = [...wg.entries].sort((a, b) =>
          b.submitted_at.localeCompare(a.submitted_at)
        )[0];
        return {
          ...latest,
          value: wg.totalValue,
        };
      })
      .sort(
        (a, b) =>
          new Date(a.week_start).getTime() - new Date(b.week_start).getTime()
      );
  }, [weekGroups]);

  const currentEmployeeName =
    employees.length === 1
      ? employees[0].name
      : selectedEmployeeId !== "all"
        ? employees.find((e) => e.id === selectedEmployeeId)?.name
        : null;

  function toggleWeekExpand(weekStart: string) {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(weekStart)) {
        next.delete(weekStart);
      } else {
        next.add(weekStart);
      }
      return next;
    });
  }

  function togglePlaybook(weekStart: string) {
    setExpandedPlaybooks((prev) => {
      const next = new Set(prev);
      if (next.has(weekStart)) {
        next.delete(weekStart);
      } else {
        next.add(weekStart);
      }
      return next;
    });
  }

  const showingAllEmployees = selectedEmployeeId === "all";
  const canEditEntryValues = isAdmin && !isCherryApprovedFinancingStat;
  const colCount = canEditEntryValues ? 7 : 6; // chevron, week, entered by, value, change, condition, [actions]

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            <StatName name={statName} description={statDescription} />
          </h1>
          <p className="text-muted-foreground">
            {divisionLabel} &middot; {postTitle}
            {currentEmployeeName && <> &middot; {currentEmployeeName}</>}
          </p>
        </div>
        {isBillsStat && (
          <Button nativeButton={false} render={<Link href="/admin/bills" />}>
            <ReceiptText className="h-4 w-4" />
            Open Bills tracker
          </Button>
        )}
        {isCherryApprovedFinancingStat && (
          <Button nativeButton={false} render={<Link href="/admin/cherry-financing" />}>
            <BadgeDollarSign className="h-4 w-4" />
            Open Cherry imports
          </Button>
        )}
      </div>

      {hasMultipleEmployees && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Filter by employee:
          </span>
          <Select
            value={selectedEmployeeId}
            onValueChange={(v) => v && setSelectedEmployeeId(v)}
          >
            <SelectTrigger className="w-[200px]">
              <span>
                {selectedEmployeeId === "all"
                  ? "All employees"
                  : employees.find((e) => e.id === selectedEmployeeId)?.name}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All employees</SelectItem>
              {employees.map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Card>
        <CardContent>
          {aggregatedChartEntries.length > 0 ? (
            <StatTrendPanel
              statId={statId}
              statName={statName}
              entries={aggregatedChartEntries}
              statType={statType}
              goodDirection={goodDirection}
              oicEntries={oicEntries}
              comparisonOptions={comparisonOptions}
            />
          ) : (
            <p className="text-muted-foreground text-sm">No data yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Weekly History ({weekGroups.length} weeks)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Week</TableHead>
                <TableHead>Entered by</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Condition</TableHead>
                {canEditEntryValues && <TableHead className="w-24 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {weekGroups.map((wg) => {
                const hasMultipleContributors =
                  showingAllEmployees && wg.entries.length > 1;
                const isWeekExpanded = expandedWeeks.has(wg.weekStart);
                const hasPlaybook = !!wg.playbookResponse;
                const isPlaybookExpanded = expandedPlaybooks.has(wg.weekStart);
                const isExpandable = hasMultipleContributors || hasPlaybook;

                return (
                  <Fragment key={wg.weekStart}>
                    {/* Aggregated week row */}
                    <TableRow
                      className={
                        isExpandable ? "cursor-pointer hover:bg-muted/50" : ""
                      }
                      onClick={() => {
                        if (hasMultipleContributors) {
                          toggleWeekExpand(wg.weekStart);
                          if (hasPlaybook) togglePlaybook(wg.weekStart);
                        } else if (hasPlaybook) {
                          togglePlaybook(wg.weekStart);
                        }
                      }}
                    >
                      <TableCell className="w-8 pr-0">
                        {isExpandable && (
                          <span className="text-muted-foreground">
                            <ChevronRight
                              className={`h-4 w-4 transition-transform duration-300 ${
                                isWeekExpanded || isPlaybookExpanded
                                  ? "rotate-90"
                                  : ""
                              }`}
                            />
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {format(
                          new Date(wg.weekStart + "T00:00:00"),
                          "MMM d, yyyy"
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {hasMultipleContributors ? (
                          <span className="inline-flex items-center gap-1 text-xs bg-muted px-1.5 py-0.5 rounded-full">
                            <Users className="h-3 w-3" />
                            {wg.entries.length} contributors
                          </span>
                        ) : (
                          <span className="text-sm">
                            {wg.entries[0]?.profile?.full_name ?? "—"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatStatValue(wg.totalValue, statType)}
                      </TableCell>
                      <TableCell>
                        {wg.percentChange !== null
                          ? formatPercentChange(wg.percentChange)
                          : "—"}
                      </TableCell>
                      <TableCell onClick={(e) => isAdmin && e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          {isAdmin ? (
                            <ConditionPicker
                              entryId={wg.latestEntryId}
                              condition={wg.condition}
                              autoCondition={wg.autoCondition}
                              hasOverride={wg.hasOverride}
                              size="sm"
                            />
                          ) : wg.condition ? (
                            <ConditionDisplay
                              condition={wg.condition}
                              size="sm"
                            />
                          ) : (
                            "—"
                          )}
                          {hasPlaybook && !isPlaybookExpanded && (
                            <MessageSquareText className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>
                      </TableCell>
                      {canEditEntryValues && (
                        <TableCell className="text-right">
                          {!hasMultipleContributors && wg.entries[0] && (
                            <EntryRowActions
                              entryId={wg.entries[0].id}
                              currentValue={Number(wg.entries[0].value)}
                              statType={statType}
                              contributorName={
                                wg.entries[0].profile?.full_name ?? "this user"
                              }
                            />
                          )}
                        </TableCell>
                      )}
                    </TableRow>

                    {/* Contributor breakdown rows */}
                    {hasMultipleContributors && isWeekExpanded &&
                      wg.entries.map((entry) => (
                        <TableRow key={entry.id} className="bg-muted/20">
                          <TableCell className="w-8 pr-0" />
                          <TableCell />
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {entry.profile?.full_name ?? "Unknown"}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatStatValue(Number(entry.value), statType)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {entry.percent_change !== null
                              ? formatPercentChange(
                                  Number(entry.percent_change)
                                )
                              : "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {(entry.final_condition ??
                              entry.auto_condition) ? (
                              <ConditionDisplay
                                condition={
                                  (entry.final_condition ??
                                    entry.auto_condition)!
                                }
                                size="sm"
                              />
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          {canEditEntryValues && (
                            <TableCell className="text-right">
                              <EntryRowActions
                                entryId={entry.id}
                                currentValue={Number(entry.value)}
                                statType={statType}
                                contributorName={
                                  entry.profile?.full_name ?? "this user"
                                }
                              />
                            </TableCell>
                          )}
                        </TableRow>
                      ))}

                    {/* Playbook content */}
                    {hasPlaybook && (
                      <TableRow className="border-0 hover:bg-transparent">
                        <TableCell className="!p-0" />
                        <TableCell colSpan={colCount - 1} className="!p-0">
                          <div
                            className="grid transition-[grid-template-rows] duration-300 ease-in-out"
                            style={{
                              gridTemplateRows: isPlaybookExpanded
                                ? "1fr"
                                : "0fr",
                            }}
                          >
                            <div className="overflow-hidden">
                              <div className="py-3 px-4 bg-muted/30 border-l-2 border-primary/20">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                                  Action Plan
                                </p>
                                <p className="text-sm whitespace-pre-wrap">
                                  {wg.playbookResponse}
                                </p>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
              {weekGroups.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={colCount}
                    className="text-center text-muted-foreground"
                  >
                    No entries yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
