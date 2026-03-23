"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { CONDITION_CONFIG, type ConditionName } from "@/lib/conditions";
import type { StatType } from "@/lib/types";
import { formatStatValue } from "@/lib/utils";
import { format } from "date-fns";

interface SparklineProps {
  data: { week: string; value: number }[];
  condition?: ConditionName | null;
  statType?: StatType;
  height?: number;
}

export function Sparkline({
  data,
  condition,
  statType = "count",
  height = 100,
}: SparklineProps) {
  const color = condition ? CONDITION_CONFIG[condition].color : "#6b7280";

  const chartData = data.map((d) => ({
    ...d,
    label: format(new Date(d.week + "T00:00:00"), "MMM d"),
  }));

  return (
    <div style={{ width: "100%", minWidth: 60, height, minHeight: height }}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="var(--color-border, #e5e7eb)"
            strokeOpacity={0.5}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: "var(--color-muted-foreground, #9ca3af)" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 9, fill: "var(--color-muted-foreground, #9ca3af)" }}
            axisLine={false}
            tickLine={false}
            width={40}
            domain={[0, "auto"]}
            allowDecimals={false}
            tickCount={4}
            tickFormatter={(v) => {
              if (statType === "dollar") {
                if (v >= 1000) return `$${(v / 1000).toFixed(0)}k`;
                return `$${v}`;
              }
              if (statType === "percentage") return `${v}%`;
              return String(v);
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-background, #fff)",
              borderColor: "var(--color-border, #e5e7eb)",
              borderRadius: "6px",
              color: "var(--color-foreground, #000)",
              fontSize: "11px",
              padding: "4px 8px",
            }}
            labelStyle={{ color: "var(--color-foreground, #000)", fontWeight: 600 }}
            itemStyle={{ color: "var(--color-foreground, #000)" }}
            formatter={(value) => [formatStatValue(Number(value), statType), ""]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#grad-${color.replace("#", "")})`}
            dot={{
              r: 2.5,
              fill: color,
              stroke: "var(--color-background, #fff)",
              strokeWidth: 1.5,
            }}
            activeDot={{
              r: 4,
              fill: color,
              stroke: "var(--color-background, #fff)",
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
