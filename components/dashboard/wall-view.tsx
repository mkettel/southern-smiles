"use client";

import { useMemo } from "react";
import { MiniStatCard } from "./mini-stat-card";
import type { DashboardStat, Division } from "@/lib/types";

interface WallViewProps {
  stats: DashboardStat[];
}

/**
 * Dense column-grouped view — one column per division, stats stacked
 * vertically inside. Keeps all stats on screen while preserving division
 * grouping.
 */
export function WallView({ stats }: WallViewProps) {
  const columns = useMemo(() => {
    const byDiv = new Map<
      string,
      { division: Division | null; stats: DashboardStat[] }
    >();
    for (const s of stats) {
      const key = s.division?.id ?? "__none";
      if (!byDiv.has(key)) {
        byDiv.set(key, { division: s.division ?? null, stats: [] });
      }
      byDiv.get(key)!.stats.push(s);
    }
    for (const col of byDiv.values()) {
      col.stats.sort((a, b) => a.stat.display_order - b.stat.display_order);
    }
    return Array.from(byDiv.values()).sort(
      (a, b) => (a.division?.number ?? 99) - (b.division?.number ?? 99)
    );
  }, [stats]);

  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
      }}
    >
      {columns.map((col, i) => {
        const color = col.division?.color || "#6b7280";
        return (
          <div
            key={col.division?.id ?? `none-${i}`}
            className="flex flex-col gap-2"
          >
            <div className="flex items-center gap-2 px-1">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                {col.division
                  ? `${col.division.name}`
                  : "Other"}
              </h2>
              {col.division && (
                <span className="text-[10px] text-muted-foreground/70 tabular-nums">
                  {col.division.number}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {col.stats.map((data) => (
                <MiniStatCard key={data.stat.id} data={data} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
