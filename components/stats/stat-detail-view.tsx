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
import type { StatEntry, StatType } from "@/lib/types";
import { ChevronRight, MessageSquareText } from "lucide-react";

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
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  const filteredEntries = useMemo(() => {
    if (selectedEmployeeId === "all") return entries;
    return entries.filter((e) => e.profile_id === selectedEmployeeId);
  }, [entries, selectedEmployeeId]);

  const currentEmployeeName =
    employees.length === 1
      ? employees[0].name
      : selectedEmployeeId !== "all"
        ? employees.find((e) => e.id === selectedEmployeeId)?.name
        : null;

  function toggleExpand(entryId: string) {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  }

  const colCount = 4 + (hasMultipleEmployees ? 1 : 0);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">{statName}</h1>
        <p className="text-muted-foreground">
          {divisionLabel} &middot; {postTitle}
          {currentEmployeeName && <> &middot; {currentEmployeeName}</>}
        </p>
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
        <CardHeader>
          <CardTitle className="text-base">Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredEntries.length > 0 ? (
            <StatHistoryChart entries={filteredEntries} statType={statType} />
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
                <TableHead className="w-8"></TableHead>
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
                const hasPlaybook = !!entry.playbook_response;
                const isExpanded = expandedEntries.has(entry.id);

                return (
                  <>
                    <TableRow
                      key={entry.id}
                      className={hasPlaybook ? "cursor-pointer hover:bg-muted/50" : ""}
                      onClick={() => hasPlaybook && toggleExpand(entry.id)}
                    >
                      <TableCell className="w-8 pr-0">
                        {hasPlaybook && (
                          <span className="text-muted-foreground">
                            <ChevronRight
                              className={`h-4 w-4 transition-transform duration-200 ${
                                isExpanded ? "rotate-90" : ""
                              }`}
                            />
                          </span>
                        )}
                      </TableCell>
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
                        <div className="flex items-center gap-1.5">
                          {condition ? (
                            <ConditionDisplay condition={condition} size="sm" />
                          ) : (
                            "—"
                          )}
                          {hasPlaybook && !isExpanded && (
                            <MessageSquareText className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {hasPlaybook && (
                      <TableRow key={`${entry.id}-playbook`}>
                        <TableCell className="p-0" />
                        <TableCell
                          colSpan={colCount}
                          className="p-0"
                        >
                          <div
                            className="grid transition-[grid-template-rows] duration-200 ease-in-out"
                            style={{
                              gridTemplateRows: isExpanded ? "1fr" : "0fr",
                            }}
                          >
                            <div className="overflow-hidden">
                              <div className="py-3 px-4 bg-muted/30 border-l-2 border-primary/20">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                                  Action Plan
                                </p>
                                <p className="text-sm whitespace-pre-wrap">
                                  {entry.playbook_response}
                                </p>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
              {filteredEntries.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={colCount + 1}
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
