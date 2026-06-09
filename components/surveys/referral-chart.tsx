"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import type { ReferralAggregationItem } from "@/lib/types";

const COLORS = [
  "#3b82f6",
  "#22c55e",
  "#a855f7",
  "#f59e0b",
  "#ef4444",
  "#14b8a6",
  "#ec4899",
  "#6366f1",
];

export function ReferralChart({ data }: { data: ReferralAggregationItem[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No referral-source answers yet.
      </p>
    );
  }

  return (
    <div style={{ width: "100%", height: Math.max(180, data.length * 44) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
        >
          <CartesianGrid horizontal={false} stroke="var(--color-border, #e5e7eb)" strokeOpacity={0.4} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground, #9ca3af)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="source"
            width={140}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground, #9ca3af)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--color-muted, #f3f4f6)", fillOpacity: 0.4 }}
            formatter={(value) => [`${value} response${value === 1 ? "" : "s"}`, ""]}
            separator=""
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
