"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { CONDITION_CONFIG, type ConditionName } from "@/lib/conditions";

interface SparklineProps {
  data: { week: string; value: number }[];
  condition?: ConditionName | null;
  height?: number;
}

export function Sparkline({ data, condition, height = 40 }: SparklineProps) {
  const color = condition
    ? CONDITION_CONFIG[condition].color
    : "#6b7280";

  return (
    <div style={{ width: "100%", minWidth: 60, height, minHeight: height }}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
