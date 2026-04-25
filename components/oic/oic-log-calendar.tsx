"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OicEntryCard } from "@/components/oic/oic-entry-card";
import type { OicLogEntry, Division, Post } from "@/lib/types";
import { cn } from "@/lib/utils";

interface OicLogCalendarProps {
  entries: OicLogEntry[];
  isAdmin: boolean;
  divisions: Division[];
  posts: Post[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function OicLogCalendar({
  entries,
  isAdmin,
  divisions,
  posts,
}: OicLogCalendarProps) {
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const entriesByDay = useMemo(() => {
    const map = new Map<string, OicLogEntry[]>();
    for (const e of entries) {
      const key = e.effective_date;
      const existing = map.get(key);
      if (existing) existing.push(e);
      else map.set(key, [e]);
    }
    return map;
  }, [entries]);

  const days = useMemo(() => {
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const out: Date[] = [];
    const d = new Date(gridStart);
    while (d <= gridEnd) {
      out.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [cursor]);

  const today = new Date();
  const selectedKey = selectedDay ? format(selectedDay, "yyyy-MM-dd") : null;
  const selectedEntries = selectedKey ? (entriesByDay.get(selectedKey) ?? []) : [];

  return (
    <Card>
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{format(cursor, "MMMM yyyy")}</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCursor(subMonths(cursor, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCursor(new Date())}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCursor(addMonths(cursor, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden border">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="bg-muted text-xs font-medium text-muted-foreground px-2 py-1 text-center"
            >
              {d}
            </div>
          ))}
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEntries = entriesByDay.get(key) ?? [];
            const inMonth = isSameMonth(day, cursor);
            const isToday = isSameDay(day, today);
            const hasEntries = dayEntries.length > 0;

            return (
              <button
                key={key}
                type="button"
                onClick={() => hasEntries && setSelectedDay(day)}
                disabled={!hasEntries}
                className={cn(
                  "bg-background text-left p-1.5 min-h-[88px] flex flex-col gap-1 transition-colors",
                  !inMonth && "bg-muted/40 text-muted-foreground",
                  hasEntries && "hover:bg-accent cursor-pointer",
                  !hasEntries && "cursor-default",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-xs font-medium inline-flex items-center justify-center h-6 w-6 rounded-full",
                      isToday && "bg-primary text-primary-foreground",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {hasEntries && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1">
                      {dayEntries.length}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {dayEntries.slice(0, 2).map((e) => (
                    <span
                      key={e.id}
                      className="text-[11px] leading-tight truncate text-foreground/80"
                      title={e.entry_text}
                    >
                      {e.entry_text}
                    </span>
                  ))}
                  {dayEntries.length > 2 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{dayEntries.length - 2} more
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>

      <Dialog
        open={selectedDay !== null}
        onOpenChange={(open) => !open && setSelectedDay(null)}
      >
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedDay ? format(selectedDay, "EEEE, MMMM d, yyyy") : ""}
            </DialogTitle>
            <DialogDescription>
              {selectedEntries.length}{" "}
              {selectedEntries.length === 1 ? "entry" : "entries"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {selectedEntries.map((entry) => (
              <OicEntryCard
                key={entry.id}
                entry={entry}
                isAdmin={isAdmin}
                divisions={divisions}
                posts={posts}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
