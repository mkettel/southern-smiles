import { startOfWeek, format, subWeeks, addWeeks, addDays } from "date-fns";

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
 * Format a week_start date for display, e.g. "Mar 16 - Mar 22, 2026"
 * Shows Monday through Sunday of that week.
 */
export function formatWeekLabel(weekStart: string): string {
  const monday = new Date(weekStart + "T00:00:00");
  const sunday = addDays(monday, 6);

  // Same month: "Mar 16 - 22, 2026"
  if (monday.getMonth() === sunday.getMonth()) {
    return `${format(monday, "MMM d")} - ${format(sunday, "d, yyyy")}`;
  }
  // Different months: "Mar 30 - Apr 5, 2026"
  return `${format(monday, "MMM d")} - ${format(sunday, "MMM d, yyyy")}`;
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
