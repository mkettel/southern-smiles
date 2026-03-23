"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConditionDisplay } from "@/components/stats/condition-display";
import { Sparkline } from "@/components/stats/sparkline";
import { formatStatValue, formatPercentChange, formatDelta } from "@/lib/utils";
import type { DashboardStat } from "@/lib/types";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  data: DashboardStat;
}

export function StatCard({ data }: StatCardProps) {
  const { stat, post, employee, currentEntry, previousEntry, sparklineData } =
    data;

  // If current week has no data, fall back to showing previous week's data
  const hasCurrentData = currentEntry?.value !== null && currentEntry?.value !== undefined;
  const showingPrevious = !hasCurrentData && previousEntry !== null;

  const displayEntry = hasCurrentData ? currentEntry : previousEntry;
  const displayValue = displayEntry?.value ?? null;

  const condition =
    displayEntry?.final_condition ??
    displayEntry?.auto_condition ??
    null;

  // Delta: compare displayed entry against the one before it
  // If showing current: delta = current - previous
  // If showing previous (fallback): no delta to show
  const delta =
    hasCurrentData && previousEntry
      ? (currentEntry?.value ?? 0) - previousEntry.value
      : null;

  const percentChange = hasCurrentData ? (currentEntry?.percent_change ?? null) : null;

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

  // Filter out weeks with zero value from sparkline if they're the latest (current empty week)
  const filteredSparkline = sparklineData.filter((d, i) => {
    // Keep everything except the last point if it's 0 and there's no current entry
    if (i === sparklineData.length - 1 && !hasCurrentData && d.value === 0) {
      return false;
    }
    return true;
  });

  return (
    <Link href={`/stats/${stat.id}`}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.name}
              </CardTitle>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                {employee.full_name} &middot; {post?.title}
              </p>
            </div>
            {condition && <ConditionDisplay condition={condition} size="sm" />}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {displayValue !== null ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">
                  {formatStatValue(displayValue, stat.stat_type)}
                </span>
                {delta !== null && (
                  <span className={`flex items-center gap-0.5 text-xs ${trendColor}`}>
                    <TrendIcon className="h-3 w-3" />
                    {formatPercentChange(percentChange ?? 0)}
                  </span>
                )}
              </div>
              {showingPrevious ? (
                <p className="text-xs text-muted-foreground italic">
                  Last week &middot; not yet submitted
                </p>
              ) : delta !== null ? (
                <p className="text-xs text-muted-foreground">
                  {formatDelta(delta, stat.stat_type)} vs last week
                </p>
              ) : null}
            </>
          ) : (
            <div className="text-sm text-muted-foreground italic py-2">
              No data available
            </div>
          )}
          <Sparkline
            data={filteredSparkline}
            condition={condition}
            statType={stat.stat_type}
            height={120}
          />
        </CardContent>
      </Card>
    </Link>
  );
}
