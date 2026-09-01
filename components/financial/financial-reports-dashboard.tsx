"use client";

import { useMemo, useState } from "react";
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip as ChartTooltip } from "chart.js";
import { CalendarDays, ChevronDown, Search } from "lucide-react";
import { Bar as ChartBar } from "react-chartjs-2";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FinancialReportPeriodKey, FinancialReportsData } from "@/lib/financial-reports";
import { cn } from "@/lib/utils";

ChartJS.register(CategoryScale, LinearScale, BarElement, ChartTooltip, Legend);

export function FinancialReportsDashboard({ data }: { data: FinancialReportsData }) {
  const monthPeriods = data.periods.filter((entry) => entry.key.startsWith("month:"));
  const aggregatePeriods = data.periods.filter((entry) => !entry.key.startsWith("month:"));
  const [periodKey, setPeriodKey] = useState<FinancialReportPeriodKey>(monthPeriods[0]?.key ?? "six_months");
  const [query, setQuery] = useState("");
  const [showZero, setShowZero] = useState(true);
  const period = data.periods.find((entry) => entry.key === periodKey) ?? data.periods[0];
  const filteredCategories = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return period.categories.filter((category) => {
      if (!showZero && category.amountCents === 0) return false;
      if (!normalized) return true;
      return [category.accountNumber, category.name, category.detailType]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized));
    });
  }, [period.categories, query, showZero]);
  const categoriesWithSpending = period.categories.filter((category) => category.amountCents > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Financial reports</h2>
          <p className="mt-1 text-sm text-muted-foreground">Posted and reviewed activity from accounts enabled for bookkeeping.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <label className="relative block min-w-48">
            <span className="sr-only">Report month</span>
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <select
              aria-label="Report month"
              value={period.key.startsWith("month:") ? period.key : ""}
              onChange={(event) => setPeriodKey(event.target.value as FinancialReportPeriodKey)}
              className={cn(
                "h-9 w-full appearance-none rounded-md border bg-background pl-9 pr-8 text-sm font-medium",
                !period.key.startsWith("month:") && "text-muted-foreground",
              )}
            >
              {!period.key.startsWith("month:") && <option value="">Select month</option>}
              {monthPeriods.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </label>
          <div className="grid grid-cols-3 rounded-lg border bg-muted/35 p-0.5" role="tablist" aria-label="Reporting period">
            {aggregatePeriods.map((entry) => (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={period.key === entry.key}
                className={cn(
                  "h-8 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors",
                  period.key === entry.key && "bg-background text-foreground shadow-sm",
                )}
                onClick={() => setPeriodKey(entry.key)}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">{period.dateRange}</p>
        <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
          <Metric label="Revenue" value={formatCurrency(period.revenueCents)} />
          <Metric label="Operating expenses" value={formatCurrency(period.expenseCents)} />
          <Metric label="Net operating income" value={formatCurrency(period.netIncomeCents)} accent={period.netIncomeCents >= 0} />
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="font-semibold">Spending by category</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {categoriesWithSpending} of {period.categories.length} expense categories have reviewed spending in this period.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showZero}
                  onChange={(event) => setShowZero(event.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                Show $0 categories
              </label>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search categories"
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </div>

        {filteredCategories.length ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Category</TableHead>
                <TableHead>Group</TableHead>
                <TableHead className="text-right">Purchases</TableHead>
                <TableHead className="text-right">Spent</TableHead>
                <TableHead className="text-right">Spending share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCategories.map((category) => (
                <TableRow key={category.id} className={category.amountCents === 0 ? "text-muted-foreground" : undefined}>
                  <TableCell>
                    <div className={cn("font-medium", category.amountCents > 0 && "text-foreground")}>{category.name}</div>
                    {category.accountNumber && <div className="mt-0.5 font-mono text-xs text-muted-foreground">{category.accountNumber}</div>}
                  </TableCell>
                  <TableCell>{category.detailType ?? "Expense"}</TableCell>
                  <TableCell className="text-right tabular-nums">{category.transactionCount}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", category.amountCents > 0 && "font-medium text-foreground")}>
                    {formatCurrency(category.amountCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatSpendingShare(category.amountCents, category.spendingShareTenths)}
                  </TableCell>
                </TableRow>
              ))}
              {period.expenseCreditsCents < 0 && (
                <>
                  <TableRow className="bg-muted/15 hover:bg-muted/15">
                    <TableCell colSpan={3}>Spending before credits</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(period.grossExpenseCents)}</TableCell>
                    <TableCell className="text-right tabular-nums">{period.grossExpenseCents ? "100.0%" : "0%"}</TableCell>
                  </TableRow>
                  <TableRow className="bg-muted/15 text-muted-foreground hover:bg-muted/15">
                    <TableCell colSpan={3}>Credits and refunds</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(period.expenseCreditsCents)}</TableCell>
                    <TableCell className="text-right">Excluded</TableCell>
                  </TableRow>
                </>
              )}
              <TableRow className="bg-muted/25 font-semibold hover:bg-muted/25">
                <TableCell colSpan={3}>Net reviewed spending</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(period.expenseCents)}</TableCell>
                <TableCell className="text-right text-muted-foreground">—</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        ) : (
          <div className="px-5 py-14 text-center text-sm text-muted-foreground">No categories match these filters.</div>
        )}
      </section>

      <section className="rounded-lg border bg-card p-5">
        <div>
          <h2 className="font-semibold">Six-month P&amp;L</h2>
          <p className="mt-1 text-sm text-muted-foreground">Monthly reviewed income and expenses through the current month.</p>
        </div>
        <ReportChart months={data.months} />
      </section>

      <p className="text-xs text-muted-foreground">This operational report excludes pending and unreviewed transactions. Confirm final financial statements with your accountant.</p>
    </div>
  );
}

function ReportChart({ months }: { months: FinancialReportsData["months"] }) {
  return (
    <div className="mt-5 h-72 min-w-0">
      <ChartBar
        data={{ labels: months.map((month) => month.label), datasets: [
          { label: "Revenue", data: months.map((month) => month.revenueCents / 100), backgroundColor: "#0f8f78", borderRadius: 3 },
          { label: "Expenses", data: months.map((month) => month.expenseCents / 100), backgroundColor: "#8a8a8a", borderRadius: 3 },
        ] }}
        options={{ responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${formatCurrency(Number(context.raw) * 100)}` } } }, scales: { x: { grid: { display: false }, border: { display: false } }, y: { beginAtZero: true, border: { display: false }, ticks: { callback: (value) => compactCurrency(Number(value) * 100) } } } }}
      />
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <div className="bg-card p-5"><p className="text-sm text-muted-foreground">{label}</p><p className={accent ? "mt-2 text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400" : "mt-2 text-2xl font-semibold tabular-nums"}>{value}</p></div>;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatSpendingShare(amountCents: number, spendingShareTenths: number) {
  if (amountCents < 0) return "Credit";
  if (!amountCents) return "0%";
  return `${(spendingShareTenths / 10).toFixed(1)}%`;
}

function compactCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 0 }).format(cents / 100);
}
