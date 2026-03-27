export type ConditionName =
  | "affluence"
  | "normal"
  | "emergency"
  | "danger"
  | "non_existence";

export type GoodDirection = "up" | "down";

export interface ConditionResult {
  condition: ConditionName;
  percentChange: number;
  direction: "up" | "down" | "flat";
}

/**
 * Calculate the condition for a stat based on week-over-week change.
 *
 * Thresholds (applied to "effective change" — inverted for good_direction='down'):
 *   > +20%        → Affluence
 *   > 0% to +20%  → Normal
 *   0% to -15%    → Emergency
 *   -15% to -40%  → Danger
 *   < -40%        → Non-Existence
 */
export function calculateCondition(
  currentValue: number,
  previousValue: number | null,
  goodDirection: GoodDirection = "up"
): ConditionResult {
  // First entry ever — stat has no history yet
  if (previousValue === null) {
    return {
      condition: "non_existence",
      percentChange: 0,
      direction: "flat",
    };
  }

  // Previous was 0: can't compute % change, but the direction is meaningful
  if (previousValue === 0) {
    if (currentValue === 0) {
      return { condition: "normal", percentChange: 0, direction: "flat" };
    }
    // Any move away from zero is treated as a large change
    const direction = currentValue > 0 ? "up" : "down";
    const isGood =
      (goodDirection === "up" && currentValue > 0) ||
      (goodDirection === "down" && currentValue < 0);
    return {
      condition: isGood ? "affluence" : "non_existence",
      percentChange: currentValue > 0 ? 100 : -100,
      direction,
    };
  }

  const rawChange = currentValue - previousValue;
  const percentChange = (rawChange / Math.abs(previousValue)) * 100;

  // For "down is good" stats (like A/R), invert the effective change
  // so that a decrease is treated as positive performance
  const effectiveChange =
    goodDirection === "down" ? -percentChange : percentChange;

  let condition: ConditionName;

  if (effectiveChange > 20) {
    condition = "affluence";
  } else if (effectiveChange > 0) {
    condition = "normal";
  } else if (effectiveChange >= -15) {
    condition = "emergency";
  } else if (effectiveChange >= -40) {
    condition = "danger";
  } else {
    condition = "non_existence";
  }

  const direction = rawChange > 0 ? "up" : rawChange < 0 ? "down" : "flat";

  return {
    condition,
    percentChange: Math.round(percentChange * 100) / 100,
    direction,
  };
}

export const CONDITION_CONFIG: Record<
  ConditionName,
  { label: string; color: string; bgClass: string; textClass: string }
> = {
  affluence: {
    label: "Affluence",
    color: "#22c55e",
    bgClass: "bg-green-100 dark:bg-green-950",
    textClass: "text-green-700 dark:text-green-400",
  },
  normal: {
    label: "Normal",
    color: "#3b82f6",
    bgClass: "bg-blue-100 dark:bg-blue-950",
    textClass: "text-blue-700 dark:text-blue-400",
  },
  emergency: {
    label: "Emergency",
    color: "#f59e0b",
    bgClass: "bg-amber-100 dark:bg-amber-950",
    textClass: "text-amber-700 dark:text-amber-400",
  },
  danger: {
    label: "Danger",
    color: "#f97316",
    bgClass: "bg-orange-100 dark:bg-orange-950",
    textClass: "text-orange-700 dark:text-orange-400",
  },
  non_existence: {
    label: "Non-Existence",
    color: "#ef4444",
    bgClass: "bg-red-100 dark:bg-red-950",
    textClass: "text-red-700 dark:text-red-400",
  },
};
