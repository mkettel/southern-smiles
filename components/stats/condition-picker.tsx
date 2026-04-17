"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { ConditionDisplay } from "@/components/stats/condition-display";
import { CONDITION_CONFIG, type ConditionName } from "@/lib/conditions";
import { setEntryCondition } from "@/actions/stat-entries";
import { cn } from "@/lib/utils";

interface ConditionPickerProps {
  entryId: string;
  /** What's currently shown — final override if set, otherwise auto. */
  condition: ConditionName | null;
  /** The auto-calculated condition (shown as a hint inside "Use auto"). */
  autoCondition: ConditionName | null;
  hasOverride: boolean;
  size?: "sm" | "md";
}

const AUTO_VALUE = "__auto__";
const ORDER: ConditionName[] = [
  "affluence",
  "normal",
  "emergency",
  "danger",
  "non_existence",
];

export function ConditionPicker({
  entryId,
  condition,
  autoCondition,
  hasOverride,
  size = "sm",
}: ConditionPickerProps) {
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string | null) {
    if (!value) return;
    const next = value === AUTO_VALUE ? null : (value as ConditionName);
    startTransition(async () => {
      const result = await setEntryCondition(entryId, next);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(next ? "Condition overridden" : "Reverted to auto");
      }
    });
  }

  return (
    <Select
      value={hasOverride ? (condition ?? AUTO_VALUE) : AUTO_VALUE}
      onValueChange={handleChange}
    >
      <SelectTrigger
        disabled={isPending}
        className={cn(
          "h-auto w-auto gap-1 border-0 bg-transparent p-0 shadow-none hover:bg-muted/40 focus:ring-0",
          isPending && "opacity-50",
        )}
      >
        <span className="flex items-center gap-1">
          {condition ? (
            <ConditionDisplay condition={condition} size={size} />
          ) : (
            <span className="text-xs text-muted-foreground">— set —</span>
          )}
          {hasOverride && (
            <span
              className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground"
              title="Manually overridden"
            >
              ✎
            </span>
          )}
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={AUTO_VALUE}>
          <span className="flex items-center gap-2">
            <span>Use auto</span>
            {autoCondition && (
              <span className="text-[10px] text-muted-foreground">
                ({CONDITION_CONFIG[autoCondition].label})
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
  );
}
