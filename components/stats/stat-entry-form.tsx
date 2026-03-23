"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { ConditionDisplay } from "./condition-display";
import { PlaybookPanel } from "./playbook-panel";
import { calculateCondition, type ConditionResult } from "@/lib/conditions";
import { formatStatValue } from "@/lib/utils";
import { submitWeeklyStats } from "@/actions/stat-entries";
import type { MyStatForEntry, ConditionPlaybook, StatType } from "@/lib/types";

interface StatEntryFormProps {
  weekStart: string;
  weekLabel: string;
  stats: MyStatForEntry[];
  playbooks: ConditionPlaybook[];
  isEditing?: boolean;
  advancedFromWeek?: string | null;
  advancedFromWeekLabel?: string | null;
}

interface EntryState {
  value: string;
  conditionResult: ConditionResult | null;
  playbookResponse: string;
}

const TYPE_LABELS: Record<StatType, string> = {
  dollar: "$",
  percentage: "%",
  count: "#",
};

export function StatEntryForm({
  weekStart,
  weekLabel,
  stats,
  playbooks,
  isEditing = false,
  advancedFromWeek = null,
  advancedFromWeekLabel = null,
}: StatEntryFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [savingStatId, setSavingStatId] = useState<string | null>(null);
  const [savedStats, setSavedStats] = useState<Set<string>>(() => {
    // Mark stats that already have existing entries as saved
    const initial = new Set<string>();
    for (const s of stats) {
      if (s.existingEntry) initial.add(s.stat.id);
    }
    return initial;
  });

  // Initialize state from existing entries or blank
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
    const entry = entries[statId];
    const val = parseFloat(entry.value);
    if (isNaN(val)) {
      toast.error("Please enter a value");
      return;
    }

    setSavingStatId(statId);
    const result = await submitWeeklyStats({
      week_start: weekStart,
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
        typeof result.error === "string"
          ? result.error
          : "Save failed"
      );
    } else {
      toast.success("Saved");
      setSavedStats((prev) => new Set(prev).add(statId));
    }
    setSavingStatId(null);
  }

  async function handleSubmit() {
    // Validate all entries have values
    const entryData = stats
      .map((s) => {
        const entry = entries[s.stat.id];
        const val = parseFloat(entry.value);
        if (isNaN(val)) return null;
        return {
          stat_id: s.stat.id,
          value: val,
          self_condition: entry.conditionResult?.condition ?? null,
          playbook_response: entry.playbookResponse || null,
        };
      })
      .filter(Boolean) as {
      stat_id: string;
      value: number;
      self_condition: string | null;
      playbook_response: string | null;
    }[];

    if (entryData.length === 0) {
      toast.error("Please enter at least one stat value");
      return;
    }

    setSubmitting(true);
    const result = await submitWeeklyStats({
      week_start: weekStart,
      entries: entryData,
    });

    if (result.error) {
      toast.error(
        typeof result.error === "string"
          ? result.error
          : "Validation failed. Check your inputs."
      );
      setSubmitting(false);
      return;
    }

    toast.success("Stats submitted successfully!");
    router.push("/dashboard");
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">
            {isEditing ? "Edit Stats" : "Enter Stats"}
          </h1>
          {isEditing && (
            <Badge variant="secondary" className="text-xs">
              Editing existing entry
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground">{weekLabel}</p>
      </div>

      {advancedFromWeek && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-4">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            You already submitted stats for {advancedFromWeekLabel}. This form is for the <strong>upcoming week</strong>.
          </p>
          <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
            Need to make changes?{" "}
            <Link
              href={`/enter?week=${advancedFromWeek}`}
              className="font-medium underline underline-offset-2"
            >
              Edit {advancedFromWeekLabel}
            </Link>
          </p>
        </div>
      )}

      {stats.map((statItem) => {
        const entry = entries[statItem.stat.id];
        const { stat } = statItem;
        return (
          <Card key={stat.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{stat.name}</CardTitle>
                <Badge variant="outline" className="text-xs">
                  {stat.post?.title}
                </Badge>
              </div>
              {stat.description && (
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {stat.description}
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {statItem.previousValue !== null && (
                <p className="text-sm text-muted-foreground">
                  Last week:{" "}
                  <span className="font-medium text-foreground">
                    {formatStatValue(statItem.previousValue, stat.stat_type)}
                  </span>
                </p>
              )}

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Label htmlFor={`stat-${stat.id}`} className="sr-only">
                    {stat.name}
                  </Label>
                  <div className="relative">
                    {stat.stat_type === "dollar" && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                        $
                      </span>
                    )}
                    <Input
                      id={`stat-${stat.id}`}
                      type="number"
                      step={stat.stat_type === "count" ? "1" : "0.01"}
                      min="0"
                      max={stat.stat_type === "percentage" ? "100" : undefined}
                      placeholder={`Enter ${stat.stat_type === "dollar" ? "amount" : stat.stat_type === "percentage" ? "percentage" : "count"}`}
                      value={entry.value}
                      onChange={(e) =>
                        handleValueChange(stat.id, e.target.value)
                      }
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

              {entry.conditionResult && (
                <PlaybookPanel
                  condition={entry.conditionResult.condition}
                  playbooks={playbooks}
                  response={entry.playbookResponse}
                  onResponseChange={(r) => handlePlaybookChange(stat.id, r)}
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
                    disabled={savingStatId === stat.id || submitting}
                  >
                    {savingStatId === stat.id ? "Saving..." : "Save"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {stats.length > 1 && (
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full"
          size="lg"
        >
          {submitting
            ? "Submitting..."
            : isEditing
              ? "Update All Stats"
              : "Submit All Stats"}
        </Button>
      )}

      {stats.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No stats assigned to you. Contact your administrator.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
