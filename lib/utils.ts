import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { StatType } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Show up to N decimals, but drop trailing zeros so clean values stay clean.
// e.g. 80 → "80", 92.5 → "92.5", 18.421052... → "18.42"
function trimDecimals(value: number, maxDecimals: number): string {
  return Number(value.toFixed(maxDecimals)).toString();
}

export function formatStatValue(value: number, statType: StatType): string {
  switch (statType) {
    case "dollar":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value);
    case "percentage":
      // Values stored as 0-100, display with % sign
      return `${trimDecimals(value, 2)}%`;
    case "count":
      return new Intl.NumberFormat("en-US").format(value);
  }
}

export function formatPercentChange(change: number): string {
  const sign = change > 0 ? "+" : "";
  return `${sign}${trimDecimals(change, 2)}%`;
}

export function formatDelta(delta: number, statType: StatType): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  const abs = Math.abs(delta);
  switch (statType) {
    case "dollar":
      return `${sign}${formatStatValue(abs, "dollar")}`;
    case "percentage":
      return `${sign}${trimDecimals(abs, 2)}pp`;
    case "count":
      return `${sign}${abs}`;
  }
}
