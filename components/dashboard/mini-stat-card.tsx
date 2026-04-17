"use client";

import Link from "next/link";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Sparkline } from "@/components/stats/sparkline";
import { ConditionDisplay } from "@/components/stats/condition-display";
import { OverallConditionPicker } from "@/components/stats/overall-condition-picker";
import { formatStatValue, formatPercentChange } from "@/lib/utils";
import { calculateCondition, CONDITION_CONFIG } from "@/lib/conditions";
import type { DashboardStat } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MiniStatCardProps {
  data: DashboardStat;
  /** Show a compact sparkline. Turn off for the densest canvas layout. */
  showSparkline?: boolean;
  /** Override card height. Defaults vary by context. */
  className?: string;
  isAdmin?: boolean;
}

export function MiniStatCard({
  data,
  showSparkline = true,
  className,
  isAdmin = false,
}: MiniStatCardProps) {
  const { stat, division, currentEntry, previousEntry, sparklineData, overallAuto } = data;
  const divisionColor = division?.color ?? undefined;

  const hasCurrentData =
    currentEntry?.value !== null && currentEntry?.value !== undefined;
  const displayEntry = hasCurrentData ? currentEntry : previousEntry;
  const displayValue = displayEntry?.value ?? null;

  const condition =
    displayEntry?.final_condition ?? displayEntry?.auto_condition ?? null;
  const conditionColor = condition
    ? CONDITION_CONFIG[condition].color
    : "#6b7280";

  const hasPrevious =
    hasCurrentData &&
    currentEntry?.previous_value !== null &&
    currentEntry?.previous_value !== undefined;

  const delta = hasPrevious
    ? (currentEntry!.value ?? 0) - currentEntry!.previous_value!
    : null;
  const percentChange = hasPrevious
    ? calculateCondition(
        currentEntry!.value,
        currentEntry!.previous_value!,
        stat.good_direction
      ).percentChange
    : null;

  const TrendIcon =
    delta !== null
      ? delta > 0
        ? TrendingUp
        : delta < 0
          ? TrendingDown
          : Minus
      : Minus;

  const trendColor =
    delta !== null
      ? delta > 0
        ? stat.good_direction === "up"
          ? "text-green-600"
          : "text-red-600"
        : delta < 0
          ? stat.good_direction === "down"
            ? "text-green-600"
            : "text-red-600"
          : "text-muted-foreground"
      : "text-muted-foreground";

  const filteredSparkline = sparklineData.filter((d, i) => {
    if (i === sparklineData.length - 1 && !hasCurrentData && d.value === 0) {
      return false;
    }
    return true;
  });

  return (
    <Link
      href={`/stats/${stat.id}`}
      className={cn(
        "group relative flex flex-col rounded-md border bg-card hover:shadow-md transition-shadow",
        className
      )}
    >
      <div className="flex-1 p-2 min-w-0">
        <div className="mb-0.5 flex items-start justify-between gap-1">
          <p
            className="text-[11px] font-semibold leading-tight text-foreground line-clamp-2"
            title={stat.name}
          >
            {stat.name}
          </p>
          {isAdmin ? (
            <OverallConditionPicker
              statId={stat.id}
              overallCondition={stat.overall_condition}
              fallbackCondition={overallAuto?.condition ?? condition}
              autoBreakdown={overallAuto}
              statType={stat.stat_type}
              size="sm"
            />
          ) : (
            (stat.overall_condition ?? overallAuto?.condition ?? condition) && (
              <ConditionDisplay
                condition={
                  (stat.overall_condition ?? overallAuto?.condition ?? condition)!
                }
                size="sm"
              />
            )
          )}
        </div>
        {displayValue !== null ? (
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold tabular-nums leading-none">
              {formatStatValue(displayValue, stat.stat_type)}
            </span>
            {delta !== null && (
              <span
                className={`inline-flex items-center gap-0.5 text-[10px] ${trendColor}`}
              >
                <TrendIcon className="h-2.5 w-2.5" />
                {formatPercentChange(percentChange ?? 0)}
              </span>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic">No data</div>
        )}
      </div>
      {showSparkline && filteredSparkline.length > 1 && (
        <div className="pb-1">
          <Sparkline
            data={filteredSparkline}
            condition={condition}
            statType={stat.stat_type}
            goodDirection={stat.good_direction}
            height={40}
            compact
            color={divisionColor}
          />
        </div>
      )}
    </Link>
  );
}
