"use server";

import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWeekStart,
  getPreviousWeekStart,
  getLastNWeeks,
  formatWeekLabel,
} from "@/lib/constants";
import {
  calculateCondition,
  type ConditionName,
  type GoodDirection,
} from "@/lib/conditions";
import { getPracticeSettings } from "@/actions/settings";
import type { Profile, StatType } from "@/lib/types";
import { format, addDays } from "date-fns";

// ============================================================
// Export presets
// ============================================================

export type ExportPreset = "last_week" | "30d" | "90d" | "all";

/** Number of trailing weeks each fixed-window preset covers. */
const PRESET_WEEKS: Record<Exclude<ExportPreset, "all">, number> = {
  last_week: 1,
  "30d": 4, // ~30 days
  "90d": 13, // ~90 days
};

const PRESET_LABELS: Record<ExportPreset, string> = {
  last_week: "Last week",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

// ============================================================
// Export shape — pure data, no formatting (see lib/export-format.ts)
// ============================================================

export interface ExportWeek {
  week_start: string;
  /** Aggregate value across all contributors for the week. */
  value: number;
  /** Week-over-week % change vs the prior week's aggregate (rounded). */
  percentChange: number | null;
  /** Condition auto-derived from the % change (respects good_direction). */
  condition: ConditionName | null;
  /** Per-employee split when more than one person submitted this week. */
  contributors: { name: string; value: number }[];
}

export interface ExportStatSummary {
  startValue: number;
  endValue: number;
  /** Total % change from the first to the last week in range. */
  totalPercentChange: number | null;
  avg: number;
  min: number;
  max: number;
  /** Raw direction of value movement over the range. */
  trend: "up" | "down" | "flat";
  /** How many weeks landed in each condition. */
  conditionCounts: Partial<Record<ConditionName, number>>;
}

export interface ExportStat {
  name: string;
  abbreviation: string | null;
  statType: StatType;
  goodDirection: GoodDirection;
  division: string;
  post: string;
  employee: string;
  weeks: ExportWeek[];
  summary: ExportStatSummary | null;
}

export interface ExportOicEntry {
  effective_date: string;
  area: string | null;
  post_affected: string | null;
  entry_text: string;
  author: string;
}

export interface StatsExport {
  practiceName: string;
  generatedAt: string;
  preset: ExportPreset;
  range: { start: string; end: string; weekCount: number; label: string };
  stats: ExportStat[];
  oicEntries: ExportOicEntry[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Resolve a preset to its inclusive [start, end] week_start window.
 * "all" walks back to the earliest stat entry on record.
 */
async function resolveRange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  preset: ExportPreset,
): Promise<{ start: string; end: string }> {
  const end = getCurrentWeekStart();

  if (preset === "all") {
    const { data } = await supabase
      .from("stat_entries")
      .select("week_start")
      .order("week_start", { ascending: true })
      .limit(1);
    const start = data?.[0]?.week_start ?? end;
    return { start, end };
  }

  const weeks = PRESET_WEEKS[preset];
  const range = getLastNWeeks(end, weeks);
  return { start: range[0], end };
}

/**
 * Build an analysis-ready export of every stat over a date range.
 * Admin-only. Returns structured data; formatting (Markdown / CSV) is done
 * in lib/export-format.ts so it can run client-side.
 */
export async function getStatsExport(
  preset: ExportPreset,
): Promise<StatsExport> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerProfile?.role !== "admin") {
    throw new Error("Admin access required");
  }

  const { start, end } = await resolveRange(supabase, preset);
  // Pull one extra prior week so the first in-range week gets a real baseline
  // for its % change instead of showing "no prior data".
  const queryStart = getPreviousWeekStart(start);
  // OIC entries are dated by effective_date, which can fall on any day of the
  // week — extend the upper bound to the Sunday of the final week so an entry
  // logged late in the last week still lands in range.
  const oicEnd = format(addDays(new Date(end + "T00:00:00"), 6), "yyyy-MM-dd");

  const [{ data: rawStats }, { data: entries }, settings, { data: oicRows }] =
    await Promise.all([
      supabase
        .from("stats")
        .select("*, post:posts(*, division:divisions(*))")
        .eq("is_active", true)
        .order("display_order"),
      supabase
        .from("stat_entries")
        .select("stat_id, week_start, value, profile:profiles(full_name)")
        .gte("week_start", queryStart)
        .lte("week_start", end)
        .order("week_start", { ascending: true }),
      getPracticeSettings(),
      // Query the OIC log directly, scoped to the range in the DB so nothing is
      // dropped by a row cap on a wide all-time export.
      supabase
        .from("oic_log")
        .select("effective_date, area, post_affected, entry_text, profile:profiles(full_name)")
        .gte("effective_date", start)
        .lte("effective_date", oicEnd)
        .order("effective_date", { ascending: false }),
    ]);

  // Map post_id → assigned employee profiles (a stat can have several owners).
  const postIds = [...new Set((rawStats ?? []).map((s) => s.post_id))];
  const { data: assignments } = await supabase
    .from("employee_posts")
    .select("post_id, profile:profiles(full_name)")
    .in("post_id", postIds.length ? postIds : ["__none__"]);

  const ownersByPost = new Map<string, string[]>();
  for (const a of assignments ?? []) {
    const name = (a.profile as unknown as Pick<Profile, "full_name">)
      ?.full_name;
    if (!name) continue;
    const list = ownersByPost.get(a.post_id) ?? [];
    list.push(name);
    ownersByPost.set(a.post_id, list);
  }

  const exportStats: ExportStat[] = (rawStats ?? []).map((stat) => {
    const goodDirection = stat.good_direction as GoodDirection;
    const statEntries = (entries ?? []).filter((e) => e.stat_id === stat.id);

    // Aggregate per week: sum across contributors, keep the per-person split.
    const byWeek = new Map<
      string,
      { total: number; contributors: { name: string; value: number }[] }
    >();
    for (const e of statEntries) {
      const bucket = byWeek.get(e.week_start) ?? { total: 0, contributors: [] };
      bucket.total += Number(e.value);
      bucket.contributors.push({
        name:
          (e.profile as unknown as Pick<Profile, "full_name">)?.full_name ??
          "Unknown",
        value: Number(e.value),
      });
      byWeek.set(e.week_start, bucket);
    }

    // Full ascending series including the extra baseline week.
    const series = [...byWeek.entries()]
      .map(([week_start, b]) => ({ week_start, ...b }))
      .sort((a, b) => a.week_start.localeCompare(b.week_start));

    const allWeeks: ExportWeek[] = series.map((w, i) => {
      const prev = i > 0 ? series[i - 1].total : null;
      const calc = calculateCondition(w.total, prev, goodDirection);
      return {
        week_start: w.week_start,
        value: round2(w.total),
        percentChange: prev === null ? null : calc.percentChange,
        condition: prev === null ? null : calc.condition,
        contributors:
          w.contributors.length > 1
            ? w.contributors.map((c) => ({
                name: c.name,
                value: round2(c.value),
              }))
            : [],
      };
    });

    // Display only weeks within the requested range (drop the baseline week).
    const weeks = allWeeks.filter((w) => w.week_start >= start);

    let summary: ExportStatSummary | null = null;
    if (weeks.length > 0) {
      const values = weeks.map((w) => w.value);
      const startValue = values[0];
      const endValue = values[values.length - 1];
      const totalPercentChange =
        weeks.length === 1
          ? weeks[0].percentChange
          : startValue === 0
            ? null
            : round2(((endValue - startValue) / Math.abs(startValue)) * 100);
      const conditionCounts: Partial<Record<ConditionName, number>> = {};
      for (const w of weeks) {
        if (w.condition)
          conditionCounts[w.condition] =
            (conditionCounts[w.condition] ?? 0) + 1;
      }
      summary = {
        startValue,
        endValue,
        totalPercentChange,
        avg: round2(values.reduce((s, v) => s + v, 0) / values.length),
        min: Math.min(...values),
        max: Math.max(...values),
        trend:
          endValue > startValue ? "up" : endValue < startValue ? "down" : "flat",
        conditionCounts,
      };
    }

    const owners = ownersByPost.get(stat.post_id) ?? [];

    return {
      name: stat.name,
      abbreviation: stat.abbreviation,
      statType: stat.stat_type as StatType,
      goodDirection,
      division: stat.post?.division?.name ?? "—",
      post: stat.post?.title ?? "—",
      employee: owners.length ? owners.join(", ") : "Unassigned",
      weeks,
      summary,
    };
  });

  // OIC entries are already scoped to the range by the DB query above.
  const oicEntries: ExportOicEntry[] = (oicRows ?? []).map((entry) => ({
    effective_date: entry.effective_date,
    area: entry.area,
    post_affected: entry.post_affected,
    entry_text: entry.entry_text,
    author:
      (entry.profile as unknown as Pick<Profile, "full_name">)?.full_name ??
      "Unknown",
  }));

  return {
    practiceName: settings.name,
    generatedAt: format(new Date(), "MMM d, yyyy 'at' h:mm a"),
    preset,
    range: {
      start,
      end,
      weekCount: weeksInRange(start, end),
      label: PRESET_LABELS[preset],
    },
    stats: exportStats,
    oicEntries,
  };
}

/** Inclusive count of weeks between two week_start Mondays. */
function weeksInRange(start: string, end: string): number {
  let count = 0;
  let cursor = end;
  while (cursor >= start) {
    count++;
    cursor = getPreviousWeekStart(cursor);
  }
  return count;
}
