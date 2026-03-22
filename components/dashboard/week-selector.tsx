"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getLastNWeeks, formatWeekLabel } from "@/lib/constants";

interface WeekSelectorProps {
  currentWeek: string;
}

export function WeekSelector({ currentWeek }: WeekSelectorProps) {
  const router = useRouter();
  const weeks = getLastNWeeks(currentWeek, 12);

  return (
    <Select
      value={currentWeek}
      onValueChange={(value) => {
        router.push(`?week=${value}`);
      }}
    >
      <SelectTrigger className="w-[220px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {weeks.reverse().map((week) => (
          <SelectItem key={week} value={week}>
            {formatWeekLabel(week)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
