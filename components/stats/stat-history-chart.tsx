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
  Legend,
  ReferenceLine,
} from "recharts";
import { CONDITION_CONFIG, type ConditionName } from "@/lib/conditions";
import type { StatEntry, StatType, OicLogEntry } from "@/lib/types";
import { formatStatValue } from "@/lib/utils";
import { format, startOfWeek, addDays } from "date-fns";

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
    condition: e.final_condition ?? e.auto_condition,
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

  return (
    <div className="space-y-2">
      <div
        className="w-full"
        style={{ minWidth: 200, minHeight: 300, height: 300 }}
      >
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="week" className="text-xs" tick={{ fontSize: 12 }} />
            <YAxis
              className="text-xs"
              tick={{ fontSize: 12 }}
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
            {entries.length >= 4 && (
              <Legend
                formatter={(value) =>
                  value === "avg" ? "4-week average" : "Weekly"
                }
              />
            )}

            {/* OIC annotation lines */}
            {annotations.map((ann) => {
              const isActive = activeAnnotation === ann.weekLabel;
              return (
              <ReferenceLine
                key={ann.weekLabel}
                x={ann.weekLabel}
                stroke={isActive ? "#3b82f6" : "#9ca3af"}
                strokeDasharray={isActive ? "0" : "4 4"}
                strokeWidth={isActive ? 2 : 1.5}
                strokeOpacity={isActive ? 1 : 0.5}
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

            <Line
              type="monotone"
              dataKey="value"
              name="value"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={(props: Record<string, unknown>) => {
                const cx = (props.cx as number) ?? 0;
                const cy = (props.cy as number) ?? 0;
                const payload = props.payload as {
                  condition?: ConditionName | null;
                  week?: string;
                } | undefined;
                const condition = payload?.condition ?? null;
                const weekLabel = payload?.week ?? "";
                const hasAnnotation = annotations.some(
                  (a) => a.weekLabel === weekLabel
                );
                const color = condition
                  ? CONDITION_CONFIG[condition].color
                  : "#6b7280";
                return (
                  <g key={`${cx}-${cy}`}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill={color}
                      stroke="white"
                      strokeWidth={2}
                    />
                    {hasAnnotation && (() => {
                      const isActivePoint = activeAnnotation === weekLabel;
                      return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isActivePoint ? 10 : 8}
                        fill={isActivePoint ? "rgba(59,130,246,0.1)" : "none"}
                        stroke={isActivePoint ? "#3b82f6" : "#9ca3af"}
                        strokeWidth={isActivePoint ? 2 : 1.5}
                        strokeDasharray={isActivePoint ? "0" : "3 2"}
                        onClick={() =>
                          setActiveAnnotation(
                            activeAnnotation === weekLabel ? null : weekLabel
                          )
                        }
                        className="cursor-pointer"
                      />
                      );
                    })()}
                  </g>
                );
              }}
            />
            {entries.length >= 4 && (
              <Line
                type="monotone"
                dataKey="avg"
                name="avg"
                stroke="#a855f7"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                connectNulls={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Annotation pills */}
      {annotations.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">OIC changes (click to view):</span>
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
                  <span className="text-[10px] opacity-70">({ann.entries.length})</span>
                )}
              </button>
            ))}
          </div>
          {activeAnnotation && (() => {
            const ann = annotations.find((a) => a.weekLabel === activeAnnotation);
            if (!ann) return null;
            return (
              <div className="rounded-md border border-border bg-muted/50 px-3 py-2 space-y-1">
                {ann.entries.map((e, i) => (
                  <div key={i} className="text-xs">
                    <span className="text-foreground">{e.text}</span>
                    <span className="text-muted-foreground"> — {e.by}, {e.date}</span>
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
