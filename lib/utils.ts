import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { StatType } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
      return `${value.toFixed(1)}%`;
    case "count":
      return new Intl.NumberFormat("en-US").format(Math.round(value));
  }
}

export function formatPercentChange(change: number): string {
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

export function formatDelta(delta: number, statType: StatType): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  const abs = Math.abs(delta);
  switch (statType) {
    case "dollar":
      return `${sign}${formatStatValue(abs, "dollar")}`;
    case "percentage":
      return `${sign}${abs.toFixed(1)}pp`;
    case "count":
      return `${sign}${Math.round(abs)}`;
  }
}
