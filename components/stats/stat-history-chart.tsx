"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import type { StatEntry, StatType, OicLogEntry } from "@/lib/types";
import { formatStatValue } from "@/lib/utils";
import { format, startOfWeek } from "date-fns";
import { Activity } from "lucide-react";

interface StatHistoryChartProps {
  entries: StatEntry[];
  statType: StatType;
  goodDirection?: "up" | "down";
  oicEntries?: OicLogEntry[];
}

function calcRollingAverage(
  values: number[],
  window: number
): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    const slice = values.slice(i - window + 1, i + 1);
    return slice.reduce((sum, v) => sum + v, 0) / slice.length;
  });
}

/** Map an OIC entry's effective_date to the Monday week label used on the chart */
function dateToWeekLabel(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const monday = startOfWeek(date, { weekStartsOn: 1 });
  return format(monday, "MMM d");
}

interface WeekAnnotation {
  weekLabel: string;
  entries: { text: string; by: string; date: string }[];
}

export function StatHistoryChart({
  entries,
  statType,
  goodDirection = "up",
  oicEntries = [],
}: StatHistoryChartProps) {
  const [showOic, setShowOic] = useState(false);
  const [activeAnnotation, setActiveAnnotation] = useState<string | null>(null);

  const sorted = [...entries].sort(
    (a, b) =>
      new Date(a.week_start).getTime() - new Date(b.week_start).getTime()
  );

  const values = sorted.map((e) => Number(e.value));
  const rolling = calcRollingAverage(values, 4);

  const data = sorted.map((e, i) => ({
    week: format(new Date(e.week_start + "T00:00:00"), "MMM d"),
    value: Number(e.value),
    avg: rolling[i],
  }));

  // Group OIC entries by their corresponding chart week
  const chartWeekLabels = new Set(data.map((d) => d.week));

  const annotations = useMemo((): WeekAnnotation[] => {
    const byWeek = new Map<string, WeekAnnotation>();

    for (const oic of oicEntries) {
      const weekLabel = dateToWeekLabel(oic.effective_date);
      if (!chartWeekLabels.has(weekLabel)) continue;

      if (!byWeek.has(weekLabel)) {
        byWeek.set(weekLabel, { weekLabel, entries: [] });
      }
      byWeek.get(weekLabel)!.entries.push({
        text: oic.entry_text,
        by: oic.profile?.full_name ?? "Unknown",
        date: format(new Date(oic.effective_date + "T00:00:00"), "MMM d"),
      });
    }

    return Array.from(byWeek.values());
  }, [oicEntries, chartWeekLabels]);

  const hasAnnotations = annotations.length > 0;

  return (
    <div className="space-y-3">
      {/* Legend + OIC toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 rounded-full bg-[#3b82f6]" />
            Weekly
          </span>
          {entries.length >= 4 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-0.5 rounded-full bg-[#94a3b8] opacity-60" />
              4-wk avg
            </span>
          )}
        </div>
        {hasAnnotations && (
          <button
            onClick={() => {
              setShowOic(!showOic);
              if (showOic) setActiveAnnotation(null);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
              showOic
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            <Activity className="h-3 w-3" />
            OIC Changes ({annotations.reduce((n, a) => n + a.entries.length, 0)})
          </button>
        )}
      </div>

      {/* Chart */}
      <div
        className="w-full"
        style={{ minWidth: 200, minHeight: 300, height: 300 }}
      >
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid
              vertical={false}
              stroke="var(--color-border, #e5e7eb)"
              strokeOpacity={0.12}
            />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 12, fill: "var(--color-muted-foreground, #9ca3af)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "var(--color-muted-foreground, #9ca3af)" }}
              axisLine={false}
              tickLine={false}
              reversed={goodDirection === "down"}
              tickFormatter={(v) => formatStatValue(v, statType)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-background, #fff)",
                borderColor: "var(--color-border, #e5e7eb)",
                borderRadius: "8px",
                color: "var(--color-foreground, #000)",
                fontSize: "13px",
              }}
              labelStyle={{
                color: "var(--color-foreground, #000)",
                fontWeight: 600,
              }}
              itemStyle={{
                color: "var(--color-foreground, #000)",
              }}
              formatter={(value, name) => [
                value != null ? formatStatValue(Number(value), statType) : "—",
                name === "avg" ? "4-wk avg" : "Value",
              ]}
            />

            {/* OIC annotation lines (only when toggled on) */}
            {showOic &&
              annotations.map((ann) => {
                const isActive = activeAnnotation === ann.weekLabel;
                return (
                  <ReferenceLine
                    key={ann.weekLabel}
                    x={ann.weekLabel}
                    stroke={isActive ? "#3b82f6" : "#9ca3af"}
                    strokeWidth={isActive ? 1.5 : 1}
                    strokeOpacity={isActive ? 0.7 : 0.3}
                    label={{
                      value: `${ann.entries.length}`,
                      position: "top",
                      fill: isActive ? "#3b82f6" : "#9ca3af",
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  />
                );
              })}

            {/* Weekly line — hero */}
            <Line
              type="monotone"
              dataKey="value"
              name="value"
              stroke="#3b82f6"
              strokeWidth={2.5}
              dot={{
                r: 3,
                fill: "#3b82f6",
                stroke: "var(--color-background, #fff)",
                strokeWidth: 1.5,
              }}
              activeDot={{
                r: 5,
                fill: "#3b82f6",
                stroke: "var(--color-background, #fff)",
                strokeWidth: 2,
              }}
            />

            {/* 4-week rolling average — secondary */}
            {entries.length >= 4 && (
              <Line
                type="monotone"
                dataKey="avg"
                name="avg"
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeOpacity={0.6}
                strokeDasharray="6 3"
                dot={false}
                connectNulls={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* OIC annotation pills (only when toggled on) */}
      {showOic && hasAnnotations && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {annotations.map((ann) => (
              <button
                key={ann.weekLabel}
                onClick={() =>
                  setActiveAnnotation(
                    activeAnnotation === ann.weekLabel ? null : ann.weekLabel
                  )
                }
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  activeAnnotation === ann.weekLabel
                    ? "bg-muted text-foreground"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                {ann.weekLabel}
                {ann.entries.length > 1 && (
                  <span className="text-[10px] opacity-70">
                    ({ann.entries.length})
                  </span>
                )}
              </button>
            ))}
          </div>
          {activeAnnotation &&
            (() => {
              const ann = annotations.find(
                (a) => a.weekLabel === activeAnnotation
              );
              if (!ann) return null;
              return (
                <div className="rounded-md border border-border bg-muted/50 px-3 py-2 space-y-1">
                  {ann.entries.map((e, i) => (
                    <div key={i} className="text-xs">
                      <span className="text-foreground">{e.text}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        — {e.by}, {e.date}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()}
        </div>
      )}
    </div>
  );
}
