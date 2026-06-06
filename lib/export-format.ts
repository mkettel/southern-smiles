import type {
  StatsExport,
  ExportStat,
  ExportWeek,
} from "@/actions/export";
import { CONDITION_CONFIG, type ConditionName } from "@/lib/conditions";
import { formatStatValue, formatPercentChange } from "@/lib/utils";
import { formatWeekLabel } from "@/lib/constants";

// ============================================================
// Markdown — optimized for pasting into Claude / ChatGPT
// ============================================================

const CONDITION_REFERENCE = [
  "Power (>+50%)",
  "Affluence (+20% to +50%)",
  "Normal (0% to +20%)",
  "Emergency (0% to -15%)",
  "Danger (-15% to -40%)",
  "Non-Existence (<-40%)",
].join(", ");

function conditionLabel(c: ConditionName | null): string {
  return c ? CONDITION_CONFIG[c].label : "—";
}

function pct(change: number | null): string {
  return change === null ? "—" : formatPercentChange(change);
}

function statHeading(stat: ExportStat): string {
  const abbr = stat.abbreviation ? ` (${stat.abbreviation})` : "";
  const dir = stat.goodDirection === "up" ? "higher is better" : "lower is better";
  return `### ${stat.name}${abbr}\n${stat.division} · ${stat.post} · ${stat.employee} · ${dir}`;
}

function statSummaryLine(stat: ExportStat): string {
  const s = stat.summary;
  if (!s) return "_No data in this range._";
  const t = stat.statType;
  return [
    `**Start:** ${formatStatValue(s.startValue, t)}`,
    `**End:** ${formatStatValue(s.endValue, t)}`,
    `**Total change:** ${pct(s.totalPercentChange)}`,
    `**Avg:** ${formatStatValue(s.avg, t)}`,
    `**Min:** ${formatStatValue(s.min, t)}`,
    `**Max:** ${formatStatValue(s.max, t)}`,
  ].join(" · ");
}

function weeklyTable(stat: ExportStat): string {
  const rows = stat.weeks.map((w: ExportWeek) => {
    return `| ${w.week_start} (${formatWeekLabel(w.week_start)}) | ${formatStatValue(
      w.value,
      stat.statType,
    )} | ${pct(w.percentChange)} | ${conditionLabel(w.condition)} |`;
  });
  return [
    "| Week | Value | Δ% | Condition |",
    "| --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function contributorBlock(stat: ExportStat): string | null {
  const weeksWithSplit = stat.weeks.filter((w) => w.contributors.length > 0);
  if (weeksWithSplit.length === 0) return null;
  const lines = weeksWithSplit.map((w) => {
    const parts = w.contributors
      .map((c) => `${c.name}: ${formatStatValue(c.value, stat.statType)}`)
      .join(", ");
    return `- ${w.week_start}: ${parts}`;
  });
  return `**Contributor breakdown:**\n${lines.join("\n")}`;
}

export function toMarkdown(data: StatsExport): string {
  const lines: string[] = [];

  lines.push(`# ${data.practiceName} — Stats Export`);
  lines.push("");
  lines.push(
    `**Range:** ${data.range.label} (${data.range.start} → ${data.range.end}, ${data.range.weekCount} week${data.range.weekCount === 1 ? "" : "s"})`,
  );
  lines.push(`**Generated:** ${data.generatedAt}`);
  lines.push("");

  lines.push("## How to read this data");
  lines.push(
    "- Each stat is a weekly performance metric. Weeks start on Monday; the date shown is that Monday.",
  );
  lines.push(
    "- **Δ%** is the week-over-week change vs. the prior week's total.",
  );
  lines.push(
    "- **Condition** is auto-derived from Δ% (and inverted for \"lower is better\" stats so an improvement always reads as a positive condition):",
  );
  lines.push(`  ${CONDITION_REFERENCE}.`);
  lines.push(
    "- **Total change** in each summary compares the first and last week of the range.",
  );
  lines.push("");

  // Cross-stat summary table
  lines.push("## Summary");
  lines.push(
    "| Stat | Division | Owner | Start | End | Total Δ% | Avg | Min | Max | Trend |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const stat of data.stats) {
    const s = stat.summary;
    const t = stat.statType;
    if (!s) {
      lines.push(
        `| ${stat.name} | ${stat.division} | ${stat.employee} | — | — | — | — | — | — | — |`,
      );
      continue;
    }
    const trendArrow =
      s.trend === "up" ? "↑" : s.trend === "down" ? "↓" : "→";
    lines.push(
      `| ${stat.name} | ${stat.division} | ${stat.employee} | ${formatStatValue(s.startValue, t)} | ${formatStatValue(s.endValue, t)} | ${pct(s.totalPercentChange)} | ${formatStatValue(s.avg, t)} | ${formatStatValue(s.min, t)} | ${formatStatValue(s.max, t)} | ${trendArrow} |`,
    );
  }
  lines.push("");

  // Per-stat detail
  lines.push("## Detail by stat");
  lines.push("");
  for (const stat of data.stats) {
    lines.push(statHeading(stat));
    lines.push("");
    lines.push(statSummaryLine(stat));
    lines.push("");
    if (stat.weeks.length > 0) {
      lines.push(weeklyTable(stat));
      const contrib = contributorBlock(stat);
      if (contrib) {
        lines.push("");
        lines.push(contrib);
      }
    }
    lines.push("");
  }

  // OIC log
  if (data.oicEntries.length > 0) {
    lines.push("## Operational changes (OIC log)");
    lines.push("| Date | Area | Post affected | Note | Author |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const e of data.oicEntries) {
      const note = e.entry_text.replace(/\n+/g, " ").replace(/\|/g, "\\|");
      lines.push(
        `| ${e.effective_date} | ${e.area ?? "—"} | ${e.post_affected ?? "—"} | ${note} | ${e.author} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ============================================================
// CSV — long format, one row per stat per week (pivot-friendly)
// ============================================================

function csvField(value: string | number | null): string {
  if (value === null) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(data: StatsExport): string {
  const header = [
    "Division",
    "Post",
    "Owner",
    "Stat",
    "Abbreviation",
    "Type",
    "Good Direction",
    "Week Start",
    "Value",
    "Percent Change",
    "Condition",
  ];
  const rows: string[] = [header.map(csvField).join(",")];

  for (const stat of data.stats) {
    for (const w of stat.weeks) {
      rows.push(
        [
          stat.division,
          stat.post,
          stat.employee,
          stat.name,
          stat.abbreviation,
          stat.statType,
          stat.goodDirection,
          w.week_start,
          w.value,
          w.percentChange,
          w.condition ? CONDITION_CONFIG[w.condition].label : null,
        ]
          .map(csvField)
          .join(","),
      );
    }
  }

  return rows.join("\n");
}
