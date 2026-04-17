"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { ChevronDown } from "lucide-react";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
import { ConditionDisplay } from "@/components/stats/condition-display";
import { CONDITION_CONFIG, type ConditionName } from "@/lib/conditions";
import { setStatOverallCondition } from "@/actions/admin";
import { cn, formatStatValue, formatPercentChange } from "@/lib/utils";
import type { StatType } from "@/lib/types";

interface OverallConditionPickerProps {
  statId: string;
  /** The admin-assigned overall condition, if any. */
  overallCondition: ConditionName | null;
  /** Fallback condition to display when no overall is set (e.g. latest week's). */
  fallbackCondition?: ConditionName | null;
  /** Math behind the auto-calculated condition, shown inside the dropdown so admins can see *why*. */
  autoBreakdown?: {
    condition: ConditionName;
    latest: number;
    baseline: number;
    percentChange: number;
    baselineWeeks: number;
  } | null;
  /** Required to format latest/baseline values appropriately (dollar/%/count). */
  statType?: StatType;
  size?: "sm" | "md";
  /** Stops link navigation when the picker (rendered inside a Link) is interacted with. */
  stopPropagation?: boolean;
}

const CLEAR_VALUE = "__clear__";
const ORDER: ConditionName[] = [
  "affluence",
  "normal",
  "emergency",
  "danger",
  "non_existence",
];

export function OverallConditionPicker({
  statId,
  overallCondition,
  fallbackCondition,
  autoBreakdown,
  statType = "count",
  size = "sm",
  stopPropagation = true,
}: OverallConditionPickerProps) {
  const [isPending, startTransition] = useTransition();
  const displayed = overallCondition ?? fallbackCondition ?? null;

  function handleChange(value: string | null) {
    if (!value) return;
    const next = value === CLEAR_VALUE ? null : (value as ConditionName);
    startTransition(async () => {
      const result = await setStatOverallCondition(statId, next);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(next ? "Overall condition set" : "Overall cleared");
      }
    });
  }

  return (
    <span
      onClick={(e) => stopPropagation && e.preventDefault()}
      onPointerDown={(e) => stopPropagation && e.stopPropagation()}
      className="inline-flex"
    >
      <Select
        value={overallCondition ?? CLEAR_VALUE}
        onValueChange={handleChange}
      >
        <SelectPrimitive.Trigger
          data-slot="select-trigger"
          disabled={isPending}
          className={cn(
            "inline-flex items-center gap-0.5 rounded-md outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/40",
            isPending && "opacity-50",
          )}
        >
          {displayed ? (
            <ConditionDisplay condition={displayed} size={size} />
          ) : (
            <span className="rounded border border-dashed border-muted-foreground/40 px-1.5 py-0 text-[10px] text-muted-foreground">
              set condition
            </span>
          )}
          <ChevronDown
            className="h-3 w-3 text-muted-foreground/60"
            aria-hidden
          />
        </SelectPrimitive.Trigger>
        <SelectContent className="!w-56">
          {/* Calculation breakdown — non-interactive header that shows admins
              exactly how the auto condition was derived. */}
          {autoBreakdown && (
            <div className="border-b px-3 py-2 text-[11px] text-muted-foreground space-y-1">
              <div className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-[9px] text-muted-foreground/70">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor:
                      CONDITION_CONFIG[autoBreakdown.condition].color,
                  }}
                />
                Auto: {CONDITION_CONFIG[autoBreakdown.condition].label}
              </div>
              <div className="flex items-baseline justify-between gap-3 tabular-nums">
                <span>
                  This week{" "}
                  <span className="font-medium text-foreground">
                    {formatStatValue(autoBreakdown.latest, statType)}
                  </span>
                </span>
                <span
                  className={cn(
                    "font-semibold",
                    autoBreakdown.percentChange > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : autoBreakdown.percentChange < 0
                        ? "text-rose-600 dark:text-rose-400"
                        : "",
                  )}
                >
                  {formatPercentChange(autoBreakdown.percentChange)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3 tabular-nums">
                <span>
                  All-time avg{" "}
                  <span className="font-medium text-foreground">
                    {formatStatValue(autoBreakdown.baseline, statType)}
                  </span>
                </span>
                <span className="text-[10px] text-muted-foreground/70">
                  {autoBreakdown.baselineWeeks} wk
                  {autoBreakdown.baselineWeeks !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          )}
          <SelectItem value={CLEAR_VALUE}>
            <span className="flex items-center gap-2 text-muted-foreground">
              Use auto
              {fallbackCondition && (
                <span className="text-[10px]">
                  ({CONDITION_CONFIG[fallbackCondition].label})
                </span>
              )}
            </span>
          </SelectItem>
          {ORDER.map((c) => (
            <SelectItem key={c} value={c}>
              <span className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: CONDITION_CONFIG[c].color }}
                />
                {CONDITION_CONFIG[c].label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </span>
  );
}
