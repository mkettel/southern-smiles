"use client";

import { useState } from "react";
import { AlertTriangle, CalendarCheck2, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CoverageState,
  PersonCoverage,
  StatCoverage,
  WeeklyCoverageResult,
} from "@/actions/dashboard";

const DOT_STYLES: Record<CoverageState, string> = {
  entered: "bg-emerald-500 border-emerald-500",
  today: "border-dashed border-muted-foreground/60",
  upcoming: "border-border",
  skipped: "bg-amber-100 border-amber-500 dark:bg-amber-950",
};

function DayDot({ day }: { day: StatCoverage["days"][number] }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className={cn(
          "h-4 w-4 rounded-full border-[1.5px]",
          DOT_STYLES[day.state],
        )}
        aria-label={`${day.label}: ${day.state}`}
      />
      <span className="text-[9px] text-muted-foreground">{day.label[0]}</span>
    </div>
  );
}

function StatRow({ stat }: { stat: StatCoverage }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span
        className={cn(
          "flex items-center gap-1.5 text-sm",
          stat.behind ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {stat.statName}
        {stat.behind && (
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
        )}
      </span>
      {stat.isManual ? (
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-xs",
            stat.weeklyEntered
              ? "bg-emerald-500/10 text-emerald-600"
              : stat.behind
                ? "bg-amber-500/10 text-amber-600"
                : "bg-muted text-muted-foreground",
          )}
        >
          {stat.weeklyEntered ? "Entered" : stat.behind ? "Missing" : "Weekly"}
        </span>
      ) : (
        <div className="flex gap-1.5">
          {stat.days.map((day) => (
            <DayDot key={day.date} day={day} />
          ))}
        </div>
      )}
    </div>
  );
}

function PersonBlock({ person }: { person: PersonCoverage }) {
  return (
    <div className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div className="mb-1 text-sm font-medium">
        {person.profile.full_name}
      </div>
      {person.stats.map((stat) => (
        <StatRow key={stat.statId} stat={stat} />
      ))}
    </div>
  );
}

function ProgressBar({ filled, total }: { filled: number; total: number }) {
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-28 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-muted-foreground">
        {filled} / {total} logged
      </span>
    </div>
  );
}

export function WeeklyCoverage({ coverage }: { coverage: WeeklyCoverageResult }) {
  if (coverage.setupRequired || coverage.people.length === 0) return null;

  // Caught up: collapse to a single positive line — no per-person grid, no nagging.
  if (!coverage.anyBehind) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CalendarCheck2 className="h-4 w-4 text-emerald-600" />
          This week&apos;s entries
          <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
            <Check className="h-3 w-3" /> on track
          </span>
        </div>
        <ProgressBar filled={coverage.filledSlots} total={coverage.totalSlots} />
      </div>
    );
  }

  // Behind: collapsed by default. The summary keeps the at-a-glance signal
  // (progress + how many stats are behind); the per-person grid expands on click.
  const behindPeople = coverage.people.filter((p) => p.behindCount > 0);
  const behindStatIds = new Set<string>();
  for (const person of behindPeople) {
    for (const stat of person.stats) {
      if (stat.behind) behindStatIds.add(stat.statId);
    }
  }

  return <BehindPanel coverage={coverage} behindPeople={behindPeople} behindCount={behindStatIds.size} />;
}

function BehindPanel({
  coverage,
  behindPeople,
  behindCount,
}: {
  coverage: WeeklyCoverageResult;
  behindPeople: PersonCoverage[];
  behindCount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full cursor-pointer flex-col gap-2 p-4 text-left sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          This week&apos;s entries
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-normal text-amber-600">
            {behindCount} behind
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ProgressBar
            filled={coverage.filledSlots}
            total={coverage.totalSlots}
          />
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-300",
              open && "rotate-180",
            )}
          />
        </div>
      </button>

      <div
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 300ms ease-in-out",
        }}
      >
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div className="border-t border-border p-4 pt-3">
            <div className="mb-3 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />{" "}
                Entered
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-dashed border-muted-foreground/60" />{" "}
                Today
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-border" />{" "}
                Upcoming
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-amber-500 bg-amber-100 dark:bg-amber-950" />{" "}
                Skipped
              </span>
            </div>

            <div className="space-y-3">
              {behindPeople.map((person) => (
                <PersonBlock key={person.profile.id} person={person} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
