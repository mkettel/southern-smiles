"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { getCurrentWeekStart, getLastNWeeks, formatWeekLabel } from "@/lib/constants";

interface WeekSelectorProps {
  currentWeek: string;
}

export function WeekSelector({ currentWeek }: WeekSelectorProps) {
  const router = useRouter();

  // Always build the list relative to TODAY's week, so the current week
  // is always at the top and you can go back 12 weeks from now.
  const todayWeek = getCurrentWeekStart();
  const weeks = getLastNWeeks(todayWeek, 12);

  // If the selected week is older than our 12-week window, include it too
  if (!weeks.includes(currentWeek)) {
    weeks.unshift(currentWeek);
  }

  return (
    <Select
      value={currentWeek}
      onValueChange={(value) => {
        if (value) router.push(`?week=${value}`);
      }}
    >
      <SelectTrigger className="w-[250px]">
        <span>{formatWeekLabel(currentWeek)}</span>
      </SelectTrigger>
      <SelectContent>
        {[...weeks].reverse().map((week) => (
          <SelectItem key={week} value={week}>
            {formatWeekLabel(week)}
            {week === todayWeek ? " (current)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
