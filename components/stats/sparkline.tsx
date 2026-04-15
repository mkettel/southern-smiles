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
import { formatWeekLabel } from "@/lib/constants";
import { addDays, format } from "date-fns";

interface SparklineProps {
  data: { week: string; value: number }[];
  condition?: ConditionName | null;
  statType?: StatType;
  goodDirection?: "up" | "down";
  height?: number;
  /** Hide axes + grid for dense layouts. Tooltip stays active on hover. */
  compact?: boolean;
}

export function Sparkline({
  data,
  condition,
  statType = "count",
  goodDirection = "up",
  height = 100,
  compact = false,
}: SparklineProps) {
  const color = condition ? CONDITION_CONFIG[condition].color : "#6b7280";

  const chartData = data.map((d) => ({
    ...d,
    label: format(
      addDays(new Date(d.week + "T00:00:00"), 4),
      "MMM d"
    ),
    weekIso: d.week,
  }));

  return (
    <div style={{ width: "100%", minWidth: 60, height, minHeight: height }}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart
          data={chartData}
          margin={
            compact
              ? { top: 2, right: 2, bottom: 2, left: 2 }
              : undefined
          }
        >
          <defs>
            <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {!compact && (
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="var(--color-border, #e5e7eb)"
              strokeOpacity={0.5}
            />
          )}
          {!compact && (
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: "var(--color-muted-foreground, #9ca3af)" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
          )}
          {!compact ? (
            <YAxis
              tick={{ fontSize: 9, fill: "var(--color-muted-foreground, #9ca3af)" }}
              axisLine={false}
              tickLine={false}
              width={40}
              domain={[0, "auto"]}
              reversed={goodDirection === "down"}
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
          ) : (
            <YAxis
              hide
              domain={["dataMin", "dataMax"]}
              reversed={goodDirection === "down"}
            />
          )}
          <Tooltip
            separator=""
            wrapperStyle={{ zIndex: 50, pointerEvents: "none" }}
            allowEscapeViewBox={{ x: true, y: true }}
            contentStyle={{
              backgroundColor: "var(--color-background, #fff)",
              borderColor: "var(--color-border, #e5e7eb)",
              borderRadius: "6px",
              color: "var(--color-foreground, #000)",
              fontSize: "11px",
              padding: "6px 10px",
            }}
            labelStyle={{
              color: "var(--color-muted-foreground, #9ca3af)",
              fontWeight: 500,
              fontSize: "10px",
              marginBottom: "2px",
            }}
            itemStyle={{
              color: "var(--color-foreground, #000)",
              fontSize: "15px",
              fontWeight: 700,
              padding: 0,
            }}
            labelFormatter={(label, payload) => {
              const iso = payload?.[0]?.payload?.weekIso as string | undefined;
              return iso ? formatWeekLabel(iso) : label;
            }}
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
