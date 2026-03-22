"use client";

import { useState, useMemo } from "react";
import { StatHistoryChart } from "@/components/stats/stat-history-chart";
import { ConditionDisplay } from "@/components/stats/condition-display";
import { formatStatValue, formatPercentChange } from "@/lib/utils";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import { Badge } from "@/components/ui/badge";
import type { StatEntry, StatType } from "@/lib/types";

interface StatDetailViewProps {
  statName: string;
  statType: StatType;
  divisionLabel: string;
  postTitle: string;
  entries: StatEntry[];
}

export function StatDetailView({
  statName,
  statType,
  divisionLabel,
  postTitle,
  entries,
}: StatDetailViewProps) {
  // Find unique employees who have entries
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

  const filteredEntries = useMemo(() => {
    if (selectedEmployeeId === "all") return entries;
    return entries.filter((e) => e.profile_id === selectedEmployeeId);
  }, [entries, selectedEmployeeId]);

  // Current employee label for subtitle
  const currentEmployeeName =
    employees.length === 1
      ? employees[0].name
      : selectedEmployeeId !== "all"
        ? employees.find((e) => e.id === selectedEmployeeId)?.name
        : null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">{statName}</h1>
        <p className="text-muted-foreground">
          {divisionLabel} &middot; {postTitle}
          {currentEmployeeName && (
            <> &middot; {currentEmployeeName}</>
          )}
        </p>
      </div>

      {hasMultipleEmployees && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter by employee:</span>
          <Select
            value={selectedEmployeeId}
            onValueChange={(v) => v && setSelectedEmployeeId(v)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
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
        <CardHeader>
          <CardTitle className="text-base">Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredEntries.length > 0 ? (
            <StatHistoryChart
              entries={filteredEntries}
              statType={statType}
            />
          ) : (
            <p className="text-muted-foreground text-sm">No data yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Weekly History ({filteredEntries.length} entries)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                {hasMultipleEmployees && <TableHead>Employee</TableHead>}
                <TableHead>Value</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Condition</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.map((entry) => {
                const condition =
                  entry.final_condition ?? entry.auto_condition;
                return (
                  <TableRow key={entry.id}>
                    <TableCell>
                      {format(
                        new Date(entry.week_start + "T00:00:00"),
                        "MMM d, yyyy"
                      )}
                    </TableCell>
                    {hasMultipleEmployees && (
                      <TableCell className="text-muted-foreground">
                        {entry.profile?.full_name ?? "—"}
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      {formatStatValue(Number(entry.value), statType)}
                    </TableCell>
                    <TableCell>
                      {entry.percent_change !== null
                        ? formatPercentChange(Number(entry.percent_change))
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {condition ? (
                        <ConditionDisplay condition={condition} size="sm" />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredEntries.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={hasMultipleEmployees ? 5 : 4}
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
