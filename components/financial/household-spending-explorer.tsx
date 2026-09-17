"use client";

import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip as ChartTooltip,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import { ArrowDownRight, ArrowUpRight, BarChart3, CalendarRange, ChevronDown, Layers, PieChart, X } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCents, formatCentsCompact, type HouseholdAccountRow, type HouseholdTransactionRow } from "@/lib/household-finance";
import {
  MAX_CHART_SEGMENTS,
  MAX_STACK_SERIES,
  OTHER_CATEGORY_KEY,
  SPENDING_RANGE_KEYS,
  assignCategorySlots,
  buildSpendingView,
  foldCategories,
  resolveSpendingRange,
  spendingAccountOptions,
  type SpendingCategory,
  type SpendingRangeKey,
  type SpendingView,
} from "@/lib/household-spending";
import { cn } from "@/lib/utils";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, ChartTooltip, Legend);

type ChartType = "donut" | "bars" | "months";

// Reference categorical palette, slots in validated order; the dark column
// is the same hues re-stepped for the dark surface.
const SERIES = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
} as const;
const CHROME = {
  light: { unslotted: "#898781", other: "#c3c2b7", surface: "#ffffff", grid: "#e1e0d9", tick: "#898781", legend: "#52514e" },
  dark: { unslotted: "#898781", other: "#5b5a56", surface: "#2b2a28", grid: "#2c2c2a", tick: "#898781", legend: "#c3c2b7" },
} as const;

const CHART_TYPES: { id: ChartType; label: string; icon: typeof PieChart }[] = [
  { id: "donut", label: "Donut", icon: PieChart },
  { id: "bars", label: "Ranked", icon: BarChart3 },
  { id: "months", label: "By month", icon: Layers },
];

export function HouseholdSpendingExplorer({
  accounts,
  transactions,
  today,
}: {
  accounts: HouseholdAccountRow[];
  transactions: HouseholdTransactionRow[];
  today: string;
}) {
  const [rangeKey, setRangeKey] = useState<SpendingRangeKey>("this_month");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [chartType, setChartType] = useState<ChartType>("donut");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();
  const mode = resolvedTheme === "dark" ? "dark" : "light";

  const view = useMemo(
    () => buildSpendingView({ transactions, accounts, today, rangeKey, accountId }),
    [transactions, accounts, today, rangeKey, accountId],
  );
  const accountOptions = useMemo(() => spendingAccountOptions(accounts), [accounts]);
  const slots = useMemo(() => assignCategorySlots(transactions), [transactions]);
  const colorFor = useMemo(() => makeColorResolver(slots, mode), [slots, mode]);
  const selected = view.categories.find((category) => category.key === selectedKey) ?? null;
  const monthCount = view.months.length;
  const activeChartType = chartType === "months" && monthCount < 2 ? "donut" : chartType;
  const delta = deltaOf(view.totalCents, view.previousTotalCents);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Time range" className="flex flex-wrap gap-1 rounded-md border bg-background p-1">
            {SPENDING_RANGE_KEYS.map((key) => {
              const label = resolveSpendingRange(key, today).label;
              const active = key === rangeKey;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setRangeKey(key);
                    const range = resolveSpendingRange(key, today);
                    if (range.start.slice(0, 7) === range.end.slice(0, 7)) {
                      setChartType((current) => current === "months" ? "donut" : current);
                    }
                  }}
                  className={cn(
                    "rounded px-2.5 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <label className="relative block min-w-48">
            <span className="sr-only">Account</span>
            <select
              aria-label="Account"
              value={accountId ?? ""}
              onChange={(event) => setAccountId(event.target.value || null)}
              className="h-9 w-full appearance-none rounded-md border bg-background pl-3 pr-9 text-sm shadow-sm"
            >
              <option value="">All accounts</option>
              {accountOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </label>
        </div>
        <div role="group" aria-label="Chart type" className="flex gap-1 rounded-md border bg-background p-1">
          {CHART_TYPES.filter(({ id }) => id !== "months" || monthCount > 1).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={activeChartType === id}
              onClick={() => setChartType(id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm transition-colors",
                activeChartType === id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-5">
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarRange className="h-4 w-4" aria-hidden />{view.range.label}</p>
          <p className="mt-2 text-2xl font-semibold">{formatCents(view.totalCents)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{formatDateRange(view.range.start, view.range.end)}</p>
        </div>
        <div className="rounded-lg border bg-card p-5">
          <p className="text-sm text-muted-foreground">vs. previous {view.range.key === "this_month" || view.range.key === "last_month" ? "month" : "period"}</p>
          {delta ? (
            <p className={cn("mt-2 flex items-center gap-1 text-2xl font-semibold", delta.direction === "up" ? "text-destructive" : "text-emerald-700 dark:text-emerald-400")}>
              {delta.direction === "up" ? <ArrowUpRight className="h-5 w-5" aria-hidden /> : <ArrowDownRight className="h-5 w-5" aria-hidden />}
              {delta.label}
            </p>
          ) : (
            <p className="mt-2 text-2xl font-semibold text-muted-foreground">—</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {view.previousTotalCents === null ? "No earlier activity to compare" : `${formatCents(view.previousTotalCents)} in ${formatDateRange(view.range.previousStart, view.range.previousEnd)}`}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-5">
          <p className="text-sm text-muted-foreground">{monthCount > 1 ? "Average per month" : "Transactions"}</p>
          <p className="mt-2 text-2xl font-semibold">{monthCount > 1 ? formatCents(Math.round(view.totalCents / monthCount)) : view.transactionCount.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {monthCount > 1 ? `${view.transactionCount.toLocaleString()} transactions across ${monthCount} months` : `${view.categories.length} categories`}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.9fr]">
        <section className="rounded-lg border bg-card p-5" aria-labelledby="chart-heading">
          <h2 id="chart-heading" className="font-semibold">{chartTitle(activeChartType)}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{chartHint(activeChartType)}</p>
          {view.categories.length === 0 ? (
            <p className="mt-10 pb-6 text-center text-sm text-muted-foreground">No spending in this range.</p>
          ) : activeChartType === "donut" ? (
            <DonutChart view={view} colorFor={colorFor} mode={mode} selectedKey={selectedKey} onSelect={setSelectedKey} />
          ) : activeChartType === "bars" ? (
            <RankedBars view={view} color={SERIES[mode][0]} selectedKey={selectedKey} onSelect={setSelectedKey} />
          ) : (
            <MonthlyStack view={view} colorFor={colorFor} mode={mode} />
          )}
        </section>

        <section className="overflow-hidden rounded-lg border bg-card" aria-labelledby="table-heading">
          <div className="border-b px-5 py-4">
            <h2 id="table-heading" className="font-semibold">Categories</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Click a row to see merchants and transactions</p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.categories.map((category) => {
                  const categoryDelta = deltaOf(category.amountCents, category.previousAmountCents);
                  const isSelected = category.key === selectedKey;
                  return (
                    <TableRow
                      key={category.key}
                      tabIndex={0}
                      role="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedKey(isSelected ? null : category.key)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedKey(isSelected ? null : category.key);
                        }
                      }}
                      className={cn("cursor-pointer", isSelected && "bg-accent/60 hover:bg-accent/60")}
                    >
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorFor(category.key) }} aria-hidden />
                          <span className="truncate font-medium">{category.label}</span>
                          <span className="text-xs text-muted-foreground">{category.transactionCount}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatCents(category.amountCents)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatTenths(category.shareTenths)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums text-xs", categoryDelta?.direction === "up" ? "text-destructive" : categoryDelta ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
                        {categoryDelta ? categoryDelta.label : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>

      {selected && (
        <CategoryDetail category={selected} view={view} color={colorFor(selected.key)} onClose={() => setSelectedKey(null)} />
      )}
    </div>
  );
}

function DonutChart({
  view,
  colorFor,
  mode,
  selectedKey,
  onSelect,
}: {
  view: SpendingView;
  colorFor: (key: string) => string;
  mode: "light" | "dark";
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  const segments = foldCategories(view.categories, MAX_CHART_SEGMENTS);
  const total = segments.reduce((sum, segment) => sum + segment.amountCents, 0);
  return (
    <div className="mt-5 grid gap-6 md:grid-cols-[260px_1fr] md:items-center">
      <div className="relative mx-auto h-[260px] w-[260px]">
        <Doughnut
          data={{
            labels: segments.map((segment) => segment.label),
            datasets: [
              {
                data: segments.map((segment) => segment.amountCents / 100),
                backgroundColor: segments.map((segment) => colorFor(segment.key)),
                borderColor: CHROME[mode].surface,
                borderWidth: 2,
                hoverOffset: 6,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            cutout: "68%",
            onClick: (_event, elements) => {
              const index = elements[0]?.index;
              const segment = index === undefined ? undefined : segments[index];
              if (!segment || segment.key === OTHER_CATEGORY_KEY) return;
              onSelect(segment.key === selectedKey ? null : segment.key);
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (context) => {
                    const segment = segments[context.dataIndex];
                    return `${segment.label}: ${formatCents(segment.amountCents)} (${formatTenths(segment.shareTenths)})`;
                  },
                },
              },
            },
          }}
        />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="text-xl font-semibold">{formatCentsCompact(total)}</span>
        </div>
      </div>
      <ul className="space-y-2">
        {segments.map((segment) => {
          const selectable = segment.key !== OTHER_CATEGORY_KEY;
          const isSelected = segment.key === selectedKey;
          return (
            <li key={segment.key}>
              <button
                type="button"
                disabled={!selectable}
                onClick={() => onSelect(isSelected ? null : segment.key)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm",
                  selectable && "hover:bg-accent",
                  isSelected && "bg-accent/60",
                )}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorFor(segment.key) }} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{segment.label}</span>
                <span className="tabular-nums">{formatCents(segment.amountCents)}</span>
                <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{formatTenths(segment.shareTenths)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RankedBars({
  view,
  color,
  selectedKey,
  onSelect,
}: {
  view: SpendingView;
  color: string;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  const rows = view.categories.filter((category) => category.amountCents > 0);
  const max = rows[0]?.amountCents ?? 1;
  return (
    <ul className="mt-5 space-y-2.5">
      {rows.map((category) => {
        const isSelected = category.key === selectedKey;
        return (
          <li key={category.key}>
            <button
              type="button"
              onClick={() => onSelect(isSelected ? null : category.key)}
              aria-pressed={isSelected}
              className={cn("block w-full rounded-md px-2 py-1.5 text-left hover:bg-accent", isSelected && "bg-accent/60")}
            >
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-medium">{category.label}</span>
                <span className="shrink-0 tabular-nums">
                  {formatCents(category.amountCents)} <span className="text-xs text-muted-foreground">{formatTenths(category.shareTenths)}</span>
                </span>
              </span>
              <span className="mt-1 block h-2 rounded-full bg-muted/60">
                <span className="block h-2 rounded-full" style={{ width: `${Math.max(2, (category.amountCents / max) * 100)}%`, backgroundColor: color }} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function MonthlyStack({ view, colorFor, mode }: { view: SpendingView; colorFor: (key: string) => string; mode: "light" | "dark" }) {
  const series = foldCategories(view.categories, MAX_STACK_SERIES);
  return (
    <div className="mt-5 h-[300px] min-w-0">
      <Bar
        data={{
          labels: view.months.map((month) => month.label),
          datasets: series.map((category) => ({
            label: category.label,
            data: category.monthly.map((value) => Math.max(0, value) / 100),
            backgroundColor: colorFor(category.key),
            borderColor: CHROME[mode].surface,
            borderWidth: 1,
            borderSkipped: false,
            barPercentage: 0.6,
            categoryPercentage: 0.8,
          })),
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { intersect: false, mode: "index" },
          plugins: {
            legend: { position: "bottom", labels: { boxWidth: 12, boxHeight: 12, color: CHROME[mode].legend } },
            tooltip: {
              callbacks: {
                label: (context) => `${context.dataset.label}: ${formatCents(Number(context.raw) * 100)}`,
                footer: (items) => {
                  const total = items.reduce((sum, item) => sum + Number(item.raw), 0);
                  return `Total ${formatCents(total * 100)}`;
                },
              },
            },
          },
          scales: {
            x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { color: CHROME[mode].tick } },
            y: { stacked: true, beginAtZero: true, border: { display: false }, grid: { color: CHROME[mode].grid }, ticks: { color: CHROME[mode].tick, callback: (value) => formatCentsCompact(Number(value) * 100) } },
          },
        }}
      />
    </div>
  );
}

function CategoryDetail({
  category,
  view,
  color,
  onClose,
}: {
  category: SpendingCategory;
  view: SpendingView;
  color: string;
  onClose: () => void;
}) {
  const rows = view.transactions.filter((txn) => txn.categoryKey === category.key);
  const shown = rows.slice(0, 50);
  const merchants = category.merchants.filter((merchant) => merchant.amountCents > 0).slice(0, 10);
  const max = merchants[0]?.amountCents ?? 1;
  return (
    <section className="overflow-hidden rounded-lg border bg-card" aria-labelledby="detail-heading">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 id="detail-heading" className="flex items-center gap-2 font-semibold">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
            {category.label}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatCents(category.amountCents)} · {category.transactionCount} transactions · {view.range.label}
          </p>
        </div>
        <button type="button" onClick={onClose} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close category detail">
          <X className="h-4 w-4" /> Close
        </button>
      </div>
      <div className="grid gap-0 lg:grid-cols-[0.9fr_1.35fr]">
        <div className="border-b p-5 lg:border-b-0 lg:border-r">
          <h3 className="text-sm font-medium">Top merchants</h3>
          <ul className="mt-3 space-y-2.5">
            {merchants.map((merchant) => (
              <li key={merchant.key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{merchant.label} <span className="text-xs text-muted-foreground">{merchant.transactionCount}×</span></span>
                  <span className="shrink-0 tabular-nums">{formatCents(merchant.amountCents)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/60">
                  <div className="h-1.5 rounded-full" style={{ width: `${Math.max(2, (merchant.amountCents / max) * 100)}%`, backgroundColor: color }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((txn) => (
                <TableRow key={txn.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(txn.date)}</TableCell>
                  <TableCell className="max-w-72 truncate font-medium">{txn.description}</TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground">{txn.accountLabel}</TableCell>
                  <TableCell className={cn("whitespace-nowrap text-right font-semibold tabular-nums", txn.amountCents < 0 && "text-emerald-700 dark:text-emerald-400")}>
                    {txn.amountCents < 0 ? "+" : "-"}{formatCents(Math.abs(txn.amountCents))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length > shown.length && (
            <p className="border-t px-5 py-3 text-xs text-muted-foreground">Showing the latest {shown.length} of {rows.length} transactions.</p>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Color follows the category, never its rank. Slots are assigned once over
 * the whole dataset, so changing the range or account never repaints a
 * category. Categories past the palette are a mid gray; the Other fold is a
 * lighter gray so the two never read as the same thing.
 */
function makeColorResolver(slots: Map<string, number>, mode: "light" | "dark") {
  const palette = SERIES[mode];
  return (key: string) => {
    if (key === OTHER_CATEGORY_KEY) return CHROME[mode].other;
    const slot = slots.get(key);
    return slot === undefined ? CHROME[mode].unslotted : palette[slot];
  };
}

function deltaOf(current: number, previous: number | null): { direction: "up" | "down" | "flat"; label: string } | null {
  if (previous === null || previous <= 0) return null;
  const change = current - previous;
  const pct = Math.round((change / previous) * 100);
  if (pct === 0) return { direction: "flat", label: "0%" };
  return { direction: pct > 0 ? "up" : "down", label: `${pct > 0 ? "+" : ""}${pct}%` };
}

function chartTitle(type: ChartType) {
  return {
    donut: "Share of spending",
    bars: "Categories ranked",
    months: "Spending by month",
  }[type];
}

function chartHint(type: ChartType) {
  return {
    donut: "Top categories with the rest folded into Other · click a slice to drill in",
    bars: "Every category, largest first · click to drill in",
    months: "Stacked by category so you can see which months ran hot",
  }[type];
}

function formatTenths(tenths: number) {
  return `${(tenths / 10).toFixed(tenths % 10 === 0 ? 0 : 1)}%`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function formatDateRange(start: string, end: string) {
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  return `${fmt.format(new Date(`${start}T12:00:00`))} – ${fmt.format(new Date(`${end}T12:00:00`))}`;
}
