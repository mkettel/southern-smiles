"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { CONDITION_CONFIG, type ConditionName } from "@/lib/conditions";
import type { StatEntry, StatType } from "@/lib/types";
import { formatStatValue } from "@/lib/utils";
import { format } from "date-fns";

interface StatHistoryChartProps {
  entries: StatEntry[];
  statType: StatType;
}

export function StatHistoryChart({ entries, statType }: StatHistoryChartProps) {
  const data = [...entries]
    .sort(
      (a, b) =>
        new Date(a.week_start).getTime() - new Date(b.week_start).getTime()
    )
    .map((e) => ({
      week: format(new Date(e.week_start + "T00:00:00"), "MMM d"),
      value: Number(e.value),
      condition: e.final_condition ?? e.auto_condition,
    }));

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="week" className="text-xs" tick={{ fontSize: 12 }} />
          <YAxis
            className="text-xs"
            tick={{ fontSize: 12 }}
            tickFormatter={(v) => formatStatValue(v, statType)}
          />
          <Tooltip
            formatter={(value) => [
              formatStatValue(Number(value), statType),
              "Value",
            ]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={(props: Record<string, unknown>) => {
              const cx = (props.cx as number) ?? 0;
              const cy = (props.cy as number) ?? 0;
              const payload = props.payload as { condition?: ConditionName | null } | undefined;
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
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
