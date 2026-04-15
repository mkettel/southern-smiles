"use client";

import { useMemo } from "react";
import { PanContainer } from "@/components/admin/org/pan-container";
import { MiniStatCard } from "./mini-stat-card";
import type { DashboardStat, Division } from "@/lib/types";

interface CanvasViewProps {
  stats: DashboardStat[];
}

/**
 * Pan + zoom canvas of stat cards, grouped into division columns. Mirrors the
 * org board layout so the two views feel consistent.
 */
export function CanvasView({ stats }: CanvasViewProps) {
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
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Drag to pan · scroll to move · ⌘/Ctrl + scroll to zoom
      </p>

      <PanContainer className="border rounded-lg bg-background h-[calc(100vh-240px)] min-h-[500px]">
        <div
          data-pan-handle
          className="flex gap-2 p-4 min-w-max min-h-full items-stretch"
        >
          {columns.map((col, i) => {
            const color = col.division?.color || "#6b7280";
            return (
              <div
                key={col.division?.id ?? `none-${i}`}
                className="w-64 shrink-0 flex flex-col text-white rounded-md shadow-sm"
                style={{ backgroundColor: color }}
              >
                <div className="h-16 px-3 py-2 border-b-2 border-white/30 flex flex-col items-center justify-center text-center rounded-t-md">
                  <div className="flex items-center justify-center gap-2">
                    <h3 className="font-bold text-xs tracking-wide uppercase leading-tight">
                      {col.division?.name ?? "Other"}
                    </h3>
                    {col.division && (
                      <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1.5 text-[10px] font-bold rounded-full bg-white/25 tabular-nums">
                        {col.division.number}
                      </span>
                    )}
                  </div>
                  {col.division?.executive && (
                    <div className="text-[10px] opacity-80 mt-0.5">
                      {col.division.executive}
                    </div>
                  )}
                </div>
                <div className="flex-1 bg-white/5 p-2 space-y-2">
                  {col.stats.map((data) => (
                    <MiniStatCard
                      key={data.stat.id}
                      data={data}
                      className="bg-background text-foreground"
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </PanContainer>
    </div>
  );
}
