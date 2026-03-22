"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { CONDITION_CONFIG, type ConditionName } from "@/lib/conditions";
import type { StatEntry, StatType } from "@/lib/types";
import { formatStatValue } from "@/lib/utils";
import { format } from "date-fns";

interface StatHistoryChartProps {
  entries: StatEntry[];
  statType: StatType;
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

export function StatHistoryChart({ entries, statType }: StatHistoryChartProps) {
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

  return (
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
            tickFormatter={(v) => formatStatValue(v, statType)}
          />
          <Tooltip
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
              } | undefined;
              const condition = payload?.condition ?? null;
              const color = condition
                ? CONDITION_CONFIG[condition].color
                : "#6b7280";
              return (
                <circle
                  key={`${cx}-${cy}`}
                  cx={cx}
                  cy={cy}
                  r={4}
                  fill={color}
                  stroke="white"
                  strokeWidth={2}
                />
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
  );
}
