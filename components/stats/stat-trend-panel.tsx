"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, GitCompareArrows, Search, X } from "lucide-react";
import { getComparisonStatHistory } from "@/actions/stat-entries";
import { StatHistoryChart } from "@/components/stats/stat-history-chart";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type {
  OicLogEntry,
  StatComparisonOption,
  StatComparisonSeries,
  StatEntry,
  StatType,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface StatTrendPanelProps {
  statId: string;
  statName: string;
  entries: StatEntry[];
  statType: StatType;
  goodDirection?: "up" | "down";
  oicEntries?: OicLogEntry[];
  comparisonOptions: StatComparisonOption[];
}

export function StatTrendPanel({
  statId,
  statName,
  entries,
  statType,
  goodDirection = "up",
  oicEntries = [],
  comparisonOptions,
}: StatTrendPanelProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [series, setSeries] = useState<StatComparisonSeries[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (selectedIds.length === 0) {
      return;
    }

    getComparisonStatHistory(selectedIds)
      .then((result) => {
        if (active) setSeries(result);
      })
      .catch(() => {
        if (active) setSeries([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedIds]);

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return comparisonOptions;
    return comparisonOptions.filter((option) =>
      [option.name, option.divisionLabel, option.postTitle]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [comparisonOptions, search]);

  function toggleStat(id: string) {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((item) => item !== id)
      : selectedIds.length >= 3
        ? selectedIds
        : [...selectedIds, id];
    setSelectedIds(next);
    if (next.length === 0) {
      setSeries([]);
      setIsLoading(false);
    } else if (next !== selectedIds) {
      setIsLoading(true);
    }
  }

  return (
    <div className="space-y-4 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Trend</h2>
          {selectedIds.length > 0 && (
            <p className="text-xs text-muted-foreground">Relative trend</p>
          )}
        </div>
        <Dialog>
          <DialogTrigger render={<Button variant="outline" size="sm" />}>
            <GitCompareArrows />
            Compare
            {selectedIds.length > 0 && (
              <span className="rounded bg-muted px-1 text-[11px]">{selectedIds.length}</span>
            )}
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Compare stats</DialogTitle>
            </DialogHeader>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search stats"
                className="pl-8"
              />
            </div>
            <div className="max-h-80 overflow-y-auto rounded-lg border p-1">
              {filteredOptions.map((option) => {
                const selected = selectedIds.includes(option.id);
                const disabled = !selected && selectedIds.length >= 3;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleStat(option.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted",
                      disabled && "cursor-not-allowed opacity-40",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded border",
                        selected && "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {selected && <Check className="size-3.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{option.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[option.divisionLabel, option.postTitle].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <DialogFooter>
              <DialogClose render={<Button />}>Done</DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => {
            const option = comparisonOptions.find((item) => item.id === id);
            if (!option) return null;
            return (
              <Button
                key={id}
                variant="secondary"
                size="xs"
                onClick={() => toggleStat(id)}
              >
                {option.name}
                <X />
              </Button>
            );
          })}
        </div>
      )}

      <StatHistoryChart
        entries={entries}
        statId={statId}
        statName={statName}
        statType={statType}
        goodDirection={goodDirection}
        oicEntries={oicEntries}
        comparisonSeries={series}
        isComparisonLoading={isLoading}
      />
    </div>
  );
}
