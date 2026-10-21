type StatValueDefinition = { name: string; stat_type: string };

export function allowsNegativeWeeklyValue(stat: StatValueDefinition): boolean {
  return stat.stat_type === "dollar" && stat.name.trim().toLowerCase() === "profit";
}

export function weeklyStatValueError(stat: StatValueDefinition, value: number): string | null {
  if (!Number.isFinite(value)) return "Enter a valid weekly value";
  if (value < 0 && !allowsNegativeWeeklyValue(stat)) return "Enter a weekly value of 0 or greater";
  if (stat.stat_type === "percentage" && value > 100) return "Percentage values cannot exceed 100";
  return null;
}
