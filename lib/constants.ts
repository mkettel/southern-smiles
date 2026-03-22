import { startOfWeek, format, subWeeks, addWeeks } from "date-fns";

/**
 * Get the Monday of the current week (our standard week_start).
 */
export function getCurrentWeekStart(): string {
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  return format(monday, "yyyy-MM-dd");
}

/**
 * Get the Monday of the previous week.
 */
export function getPreviousWeekStart(weekStart: string): string {
  const date = new Date(weekStart + "T00:00:00");
  const prev = subWeeks(date, 1);
  return format(prev, "yyyy-MM-dd");
}

/**
 * Get the Monday of the next week.
 */
export function getNextWeekStart(weekStart: string): string {
  const date = new Date(weekStart + "T00:00:00");
  const next = addWeeks(date, 1);
  return format(next, "yyyy-MM-dd");
}

/**
 * Format a week_start date for display, e.g. "Week of Mar 17, 2026"
 */
export function formatWeekLabel(weekStart: string): string {
  const date = new Date(weekStart + "T00:00:00");
  return `Week of ${format(date, "MMM d, yyyy")}`;
}

/**
 * Get the last N week_start dates (Mondays) ending with the given week.
 */
export function getLastNWeeks(weekStart: string, n: number): string[] {
  const weeks: string[] = [];
  let current = weekStart;
  for (let i = 0; i < n; i++) {
    weeks.unshift(current);
    current = getPreviousWeekStart(current);
  }
  return weeks;
}
