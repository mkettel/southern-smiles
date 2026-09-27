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
import type {
  StatComparisonSeries,
  StatEntry,
  StatType,
  OicLogEntry,
} from "@/lib/types";
import { formatStatValue } from "@/lib/utils";
import { formatWeekLabel } from "@/lib/constants";
import { addDays, format } from "date-fns";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { annotationWeek, inStatChartRange, statChartDomain, statChartToday, STAT_CHART_RANGES, type StatChartRange } from "@/lib/stat-chart-range";

interface StatHistoryChartProps {
  entries: StatEntry[];
  statId?: string;
  statName?: string;
  statType: StatType;
  goodDirection?: "up" | "down";
  oicEntries?: OicLogEntry[];
  comparisonSeries?: StatComparisonSeries[];
  isComparisonLoading?: boolean;
  range?: StatChartRange;
  onRangeChange?: (range: StatChartRange) => void;
}

const SERIES_COLORS = ["#2563eb", "#059669", "#d97706", "#dc2626"];

function aggregateByWeek(entries: StatEntry[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    totals.set(
      entry.week_start,
      (totals.get(entry.week_start) ?? 0) + Number(entry.value),
    );
  }
  return totals;
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

interface WeekAnnotation {
  weekLabel: string;
  entries: { text: string; by: string; date: string }[];
}

export function StatHistoryChart({
  entries,
  statId = "current",
  statName = "Weekly",
  statType,
  goodDirection = "up",
  oicEntries = [],
  comparisonSeries = [],
  isComparisonLoading = false,
  range: controlledRange,
  onRangeChange,
}: StatHistoryChartProps) {
  const [localRange, setLocalRange] = useState<StatChartRange>(3);
  const [startAtZero, setStartAtZero] = useState(false);
  const range = controlledRange ?? localRange;
  const today = statChartToday();
  const [showOic, setShowOic] = useState(false);
  const [activeAnnotation, setActiveAnnotation] = useState<string | null>(null);

  const sorted = [...entries].sort(
    (a, b) =>
      new Date(a.week_start).getTime() - new Date(b.week_start).getTime()
  );

  const values = sorted.map((e) => Number(e.value));
  const rolling = calcRollingAverage(values, 4);

  const data = sorted.map((e, i) => ({
    week: format(
      addDays(new Date(e.week_start + "T00:00:00"), 4),
      "MMM d"
    ),
    weekIso: e.week_start,
    value: Number(e.value),
    avg: rolling[i],
  })).filter(point => inStatChartRange(point.weekIso, range, today));

  const allSeries = useMemo(
    () => [
      { id: statId, name: statName, statType, entries },
      ...comparisonSeries,
    ],
    [comparisonSeries, entries, statId, statName, statType],
  );
  const isComparing = comparisonSeries.length > 0;

  const comparisonData = useMemo(() => {
    if (!isComparing) return [];

    const totalsBySeries = allSeries.map((series) => ({
      series,
      totals: aggregateByWeek(series.entries),
    }));
    const weeks = Array.from(
      new Set(totalsBySeries.flatMap(({ totals }) => Array.from(totals.keys()))),
    ).sort();

    const bases = new Map(
      totalsBySeries.map(({ series, totals }) => {
        const firstNonZero = weeks
          .map((week) => totals.get(week))
          .find((value) => value != null && value !== 0);
        return [series.id, firstNonZero ?? 1];
      }),
    );

    return weeks.map((weekIso) => {
      const point: Record<string, string | number | null> = {
        weekIso,
        week: format(addDays(new Date(`${weekIso}T00:00:00`), 4), "MMM d"),
      };

      for (const { series, totals } of totalsBySeries) {
        const actual = totals.get(weekIso);
        point[`${series.id}Actual`] = actual ?? null;
        point[series.id] =
          actual == null ? null : (actual / (bases.get(series.id) ?? 1)) * 100;
      }
      return point;
    });
  }, [allSeries, isComparing]);

  const visibleComparisonData = comparisonData.filter(point => inStatChartRange(String(point.weekIso), range, today));
  const plottedData = isComparing ? visibleComparisonData : data;
  const rawDomain = statChartDomain(isComparing
    ? visibleComparisonData.flatMap(point => allSeries.map(series => typeof point[series.id] === "number" ? point[series.id] as number : null))
    : data.flatMap(point => [point.value, point.avg]), startAtZero, !isComparing && statType === "percentage" ? 0.1 : 1);
  const domain: [number, number] = !isComparing && statType === "count"
    ? [Math.floor(rawDomain[0]), Math.ceil(rawDomain[1])]
    : rawDomain;
  const periodValues = data.map(point => point.value).filter(Number.isFinite);
  const axisLabel = (value: number) => isComparing ? `${Math.round(value)} index` : formatStatValue(value, statType);

  // Use full ISO weeks so annotations cannot collide across different years.
  const chartWeekLabels = new Set(plottedData.map((d) => String(d.weekIso)));

  const annotations = ((): WeekAnnotation[] => {
    const byWeek = new Map<string, WeekAnnotation>();

    for (const oic of oicEntries) {
      const weekLabel = annotationWeek(oic.effective_date);
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
  })();

  const hasAnnotations = annotations.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Time range" className="flex flex-wrap gap-1 rounded-md border p-1">
          {STAT_CHART_RANGES.map(option => <Button key={option.value} type="button" size="sm" variant={range === option.value ? "default" : "ghost"} aria-pressed={range === option.value} onClick={() => { setLocalRange(option.value); onRangeChange?.(option.value); setActiveAnnotation(null); }}>{option.label}</Button>)}
        </div>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={startAtZero} onChange={event => setStartAtZero(event.target.checked)} />Start scale at zero</label>
      </div>
      {!isComparing && periodValues.length > 0 && <dl className="grid grid-cols-3 gap-3 border-y py-3">
        {[["Latest", periodValues.at(-1)!], ["Period low", Math.min(...periodValues)], ["Period high", Math.max(...periodValues)]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words text-lg font-semibold tabular-nums">{formatStatValue(Number(value), statType)}</dd></div>)}
      </dl>}
      {plottedData.length > 0 && <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>{format(new Date(`${plottedData[0].weekIso}T00:00:00`), "MMM d, yyyy")} - {format(addDays(new Date(`${plottedData.at(-1)!.weekIso}T00:00:00`), 4), "MMM d, yyyy")}</span>
        <span aria-live="polite">Scale: {axisLabel(domain[0])} - {axisLabel(domain[1])}</span>
      </div>}
      {/* Legend + OIC toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {isComparing ? (
            allSeries.map((series, index) => (
              <span key={series.id} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-0.5 w-3 rounded-full"
                  style={{ backgroundColor: SERIES_COLORS[index] }}
                />
                {series.name}
              </span>
            ))
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 rounded-full bg-[#3b82f6]" />
              Weekly
            </span>
          )}
          {!isComparing && entries.length >= 4 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 rounded-full bg-[#94a3b8] opacity-60" />
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
      {plottedData.length === 0 ? <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No entries in this period.</div> : <div
        className="w-full"
        style={{ minWidth: 200, minHeight: 300, height: 300 }}
      >
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={plottedData}>
            <CartesianGrid
              vertical={false}
              stroke="var(--color-border, #e5e7eb)"
              strokeOpacity={0.12}
            />
            <XAxis
              dataKey="weekIso"
              minTickGap={30}
              tickFormatter={(date) => format(addDays(new Date(`${date}T00:00:00`), 4), range === 0 ? "MMM yy" : "MMM d")}
              tick={{ fontSize: 12, fill: "var(--color-muted-foreground, #9ca3af)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={domain}
              allowDataOverflow
              allowDecimals={isComparing || statType !== "count"}
              tick={{ fontSize: 12, fill: "var(--color-muted-foreground, #9ca3af)" }}
              axisLine={false}
              tickLine={false}
              reversed={!isComparing && goodDirection === "down"}
              tickFormatter={(v) =>
                isComparing ? `${Math.round(v)}` : formatStatValue(v, statType)
              }
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
              labelFormatter={(label, payload) => {
                const iso = payload?.[0]?.payload?.weekIso as
                  | string
                  | undefined;
                return iso ? formatWeekLabel(iso) : label;
              }}
              formatter={(value, name, item) => {
                if (!isComparing) {
                  return [
                    value != null ? formatStatValue(Number(value), statType) : "—",
                    name === "avg" ? "4-wk avg" : "Value",
                  ];
                }

                const series = allSeries.find((candidate) => candidate.id === item.dataKey);
                const actual = series
                  ? item.payload?.[`${series.id}Actual`]
                  : null;
                return [
                  series && actual != null
                    ? `${formatStatValue(Number(actual), series.statType)} · ${Math.round(Number(value))} index`
                    : "—",
                  name,
                ];
              }}
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

            {isComparing ? (
              allSeries.map((series, index) => (
                <Line
                  key={series.id}
                  type="monotone"
                  dataKey={series.id}
                  name={series.name}
                  stroke={SERIES_COLORS[index]}
                  strokeWidth={index === 0 ? 2.75 : 2.25}
                  connectNulls
                  dot={{
                    r: 2.5,
                    fill: SERIES_COLORS[index],
                    stroke: "var(--color-background, #fff)",
                    strokeWidth: 1.5,
                  }}
                  activeDot={{
                    r: 4.5,
                    fill: SERIES_COLORS[index],
                    stroke: "var(--color-background, #fff)",
                    strokeWidth: 2,
                  }}
                />
              ))
            ) : (
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
            )}

            {/* 4-week rolling average — secondary */}
            {!isComparing && entries.length >= 4 && (
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
      </div>}

      {isComparisonLoading && (
        <div className="text-xs text-muted-foreground">Loading comparison…</div>
      )}

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
                {formatWeekLabel(ann.weekLabel)}
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
