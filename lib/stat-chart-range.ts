import { format, parseISO, startOfWeek, subMonths } from "date-fns";

export type StatChartRange = 1 | 3 | 12 | 0;
export const STAT_CHART_RANGES = [
  { label: "1 month", value: 1 },
  { label: "3 months", value: 3 },
  { label: "1 year", value: 12 },
  { label: "All time", value: 0 },
] as const;

export function statChartToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
}

export function inStatChartRange(date: string, range: StatChartRange, today = statChartToday()) {
  const cutoff = range === 0 ? "" : format(subMonths(parseISO(today), range), "yyyy-MM-dd");
  return date >= cutoff && date <= today;
}

export function annotationWeek(date: string) {
  return format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function statChartDomain(values: Array<number | null>, startAtZero = false, minimumPadding = 1): [number, number] {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!finite.length) return [0, 1];
  const low = Math.min(...finite);
  const high = Math.max(...finite);
  const padding = Math.max((high - low) * 0.12, Math.abs(high) * 0.02, minimumPadding);
  let bottom = low >= 0 ? Math.max(0, low - padding) : low - padding;
  let top = high + padding;
  if (startAtZero) { bottom = Math.min(0, bottom); top = Math.max(0, top); }
  return [Math.floor(bottom * 100) / 100, Math.ceil(top * 100) / 100];
}
