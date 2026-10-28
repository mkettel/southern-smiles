"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { getFinancialCashFlowData } from "@/actions/financial-cash-flow";
import type { CashFlowData } from "@/lib/financial-cash-flow";
import type { FinancialReportsData, FinancialReportPeriod } from "@/lib/financial-reports";
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip as ChartTooltip,
} from "chart.js";
import { Line as ChartLine } from "react-chartjs-2";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ListChecks,
  ReceiptText,
  RefreshCw,
  Repeat2,
  Hourglass,
  History,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FinancialWorkspaceData } from "@/lib/financial-workspace";
import { cn } from "@/lib/utils";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ChartTooltip, Legend);

export function FinancialOverviewDashboard({ data, reports, initialCash, previewCash }: { data: FinancialWorkspaceData; reports: FinancialReportsData; initialCash: CashFlowData; previewCash?: CashFlowData[] }) {
  const [monthKey, setMonthKey] = useState(data.months.at(-1)?.key ?? "");
  const selectedIndex = Math.max(0, data.months.findIndex((month) => month.key === monthKey));
  const selectedMonth = data.months[selectedIndex] ?? data.months.at(-1)!;
  const earlierCount = data.months.slice(0, selectedIndex).reduce((sum, month) => sum + month.pendingCount, 0);
  const period = reports.periods.find((p) => p.key === `month:${selectedMonth.key}`);
  const [cash, setCash] = useState<CashFlowData | null>(initialCash);
  const [cashError, setCashError] = useState(false);
  const requestId = useRef(0);
  const incomplete = selectedMonth.pendingCount > 0 || selectedMonth.settlingCount > 0;
  const note = incomplete ? "Incomplete · transactions awaiting review" : "Recorded figures · not a reconciliation";
  async function selectMonth(key: string) {
    setMonthKey(key);
    setCash(null);
    setCashError(false);
    const id = ++requestId.current;
    try {
      const next = previewCash ? previewCash.find((item) => item.report.month === key) : await getFinancialCashFlowData(key);
      if (!next) throw new Error("Month unavailable");
      if (id === requestId.current) setCash(next);
    } catch {
      if (id === requestId.current) setCashError(true);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative block min-w-52">
          <span className="sr-only">Overview month</span>
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            aria-label="Overview month"
            value={selectedMonth.key}
            onChange={(event) => void selectMonth(event.target.value)}
            className="h-10 w-full appearance-none rounded-md border bg-background pl-9 pr-9 text-sm font-medium shadow-sm"
          >
            {[...data.months].reverse().map((month) => (
              <option key={month.key} value={month.key}>{month.longLabel}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </label>
        <Button nativeButton={false} size="lg" className="h-10 bg-emerald-700 px-4 text-white hover:bg-emerald-800" render={<Link href="/admin/financial-transactions" />}>
          <ListChecks />
          Review {selectedMonth.pendingCount.toLocaleString()} transactions
        </Button>
      </div>

      <section aria-labelledby="snapshot-heading">
        <h2 id="snapshot-heading" className="text-xl font-semibold">Monthly snapshot</h2>
        <p className="mt-1 text-sm text-muted-foreground">{period?.dateRange ?? selectedMonth.dateRange} · Board reports</p>
        <div className="mt-6 grid grid-cols-2 gap-y-6 xl:grid-cols-4">
          <SnapshotMetric label="Revenue" value={period?.revenueCents} note={period ? note : "No report for this month"} />
          <SnapshotMetric label="Total expenses" value={period?.expenseCents} note={period ? note : "No report for this month"} muted />
          <SnapshotMetric label="Net income" value={period?.netIncomeCents} note={period ? note : "No report for this month"} signed />
          <SnapshotMetric label="Net cash change" value={cash?.report.month === selectedMonth.key ? cash.report.netCents : undefined} signed note={cashError ? "Cash flow unavailable" : !cash ? "Loading cash flow…" : cash.unsupportedCurrencyCount ? "USD accounts only · other currencies excluded" : cash.unpostedCount || cash.settlingCount ? "Incomplete · bank activity awaiting posting" : "Posted bank activity"} />
        </div>
        {cashError && <button className="mt-3 text-sm text-emerald-700 underline dark:text-emerald-400" onClick={() => void selectMonth(selectedMonth.key)}>Retry cash flow</button>}
      </section>

      <div className="grid gap-8 border-t pt-6 lg:grid-cols-[1.35fr_0.9fr]">
        <section className="min-w-0" aria-labelledby="pnl-heading">
          <h2 id="pnl-heading" className="text-lg font-semibold">Revenue and expenses trend</h2>
          <p className="mt-1 text-xs text-muted-foreground">{selectedMonth.longLabel} · cumulative weekly totals</p>
          {period?.weeklyTrend?.length ? <TrendChart weeks={period.weeklyTrend} /> : <p className="py-20 text-center text-sm text-muted-foreground">No report activity for this month.</p>}
          <div className="flex flex-wrap gap-6 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <Link href="/admin/financial/reports" className="inline-flex items-center gap-1">View P&amp;L report <ArrowRight className="size-4" /></Link>
            <Link href="/admin/financial/cash-flow" className="inline-flex items-center gap-1">View weekly cash flow <ArrowRight className="size-4" /></Link>
          </div>
        </section>

        <section className="min-w-0" aria-labelledby="attention-heading">
          <div className="flex items-center gap-2">
            <h2 id="attention-heading" className="text-lg font-semibold">Items needing attention</h2>
            <Badge variant="secondary">{selectedMonth.pendingCount}</Badge>
          </div>
          <div className="mt-3 divide-y border-t">
            <QueueItem icon={ListChecks} label="Transactions needing review" detail={`${selectedMonth.longLabel} · settled, excluding possible transfers`} value={selectedMonth.pendingCount - selectedMonth.possibleTransferCount} href="/admin/financial-transactions" tone="orange" />
            <QueueItem icon={Repeat2} label="Possible transfers" detail={`${selectedMonth.longLabel} · bank-feed suggestions, not verified matches`} value={selectedMonth.possibleTransferCount} href="/admin/financial-transactions" tone="violet" />
            <div className="flex items-center gap-4 py-3 text-sm"><Hourglass className="mx-2 size-5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1">Waiting for bank settlement<span className="block text-xs text-muted-foreground">{selectedMonth.longLabel} · not included in review count</span></span><span className="text-lg font-semibold tabular-nums">{selectedMonth.settlingCount.toLocaleString()}</span></div>
            <QueueItem icon={ReceiptText} label="Overdue bills" detail="As of today · separate from transaction review" value={data.overdueBillCount} href="/admin/bills" tone="red" />
          </div>
          {earlierCount > 0 && <div className="flex items-center gap-4 border-t py-3 text-sm text-muted-foreground"><History className="mx-2 size-5 shrink-0" /><span className="flex-1">Earlier months<span className="block text-xs">Settled transactions still needing review</span></span><span className="text-lg tabular-nums">{earlierCount.toLocaleString()}</span></div>}
        </section>
      </div>

      <section className="min-w-0 overflow-hidden border-t pt-2" aria-labelledby="activity-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b py-4">
          <div>
            <h2 id="activity-heading" className="text-lg font-semibold">Recent activity</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Most recent imported activity for {selectedMonth.longLabel}</p>
          </div>
          <Link href="/admin/financial-transactions" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400">
            View all activity <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {selectedMonth.recentActivity.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Bank account</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedMonth.recentActivity.map((activity) => (
                  <TableRow key={activity.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(activity.date)}</TableCell>
                    <TableCell className="max-w-72 truncate font-medium">{activity.description}</TableCell>
                    <TableCell>{activity.bankAccount ?? "Bank account"}</TableCell>
                    <TableCell className="max-w-64 truncate text-muted-foreground">{activity.account}</TableCell>
                    <TableCell className={cn("text-right font-semibold tabular-nums", activity.amountCents < 0 && "text-emerald-700 dark:text-emerald-400")}>
                      {activity.amountCents < 0 ? "+" : "-"}{formatCurrency(Math.abs(activity.amountCents))}
                    </TableCell>
                    <TableCell><StatusBadge status={activity.reviewStatus} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="px-5 py-14 text-center text-sm text-muted-foreground">No bookkeeping activity is available for {selectedMonth.longLabel}.</div>
        )}
        <div className="flex items-center gap-2 border-t px-5 py-3 text-xs text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5" />
          Last synced {data.lastSyncedAt ? formatDateTime(data.lastSyncedAt) : "not yet"}
        </div>
      </section>
    </div>
  );
}

function TrendChart({ weeks }: { weeks: NonNullable<FinancialReportPeriod["weeklyTrend"]> }) {
  return (
    <div className="my-4 h-[230px] min-w-0" role="img" aria-label="Cumulative weekly revenue and expenses">
      <ChartLine
        data={{
          labels: weeks.map((week) => week.label.replace(/, \d{4}/g, "")),
          datasets: [
            { label: "Revenue", data: weeks.map((week) => week.revenueCents / 100), borderColor: "#34b99c", backgroundColor: "#34b99c", borderWidth: 2, pointRadius: 3, tension: 0 },
            { label: "Expenses", data: weeks.map((week) => week.expenseCents / 100), borderColor: "#929292", backgroundColor: "#929292", borderWidth: 2, pointRadius: 3, tension: 0 },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { intersect: false, mode: "index" },
          plugins: { legend: { position: "bottom", labels: { boxWidth: 18, boxHeight: 2, usePointStyle: false, color: "#606060" } }, tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${formatCurrency(Number(context.raw) * 100)}` } } },
          scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: "#737373" } }, y: { beginAtZero: true, border: { display: false }, grid: { color: "rgba(115,115,115,0.16)" }, ticks: { color: "#737373", callback: (value) => compactCurrency(Number(value) * 100) } } },
        }}
      />
    </div>
  );
}

function SnapshotMetric({ label, value, note, muted, signed }: { label: string; value?: number; note: string; muted?: boolean; signed?: boolean }) {
  return (
    <div className="min-w-0 border-l pl-3 odd:border-l-0 odd:pl-0 sm:pl-5 xl:odd:border-l xl:odd:pl-5 xl:first:border-l-0 xl:first:pl-0">
      <div className={cn("mb-2 h-0.5 w-8", muted ? "bg-neutral-400" : "bg-emerald-500")} />
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1 break-words text-xl font-semibold tabular-nums sm:text-2xl", signed && value !== undefined && value < 0 && "text-destructive")}>{value === undefined ? "—" : `${signed && value > 0 ? "+" : ""}${formatCurrency(value)}`}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{note}</p>
    </div>
  );
}

const queueTones = {
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  red: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

function QueueItem({ icon: Icon, label, detail, value, href, tone }: { icon: typeof AlertCircle; label: string; detail: string; value: number; href: string; tone: keyof typeof queueTones }) {
  return (
    <Link href={href} className="group flex items-center gap-4 py-3 first:pt-2 last:pb-2">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", queueTones[tone])}><Icon className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function StatusBadge({ status }: { status: FinancialWorkspaceData["recentActivity"][number]["reviewStatus"] }) {
  if (status === "reviewed") return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300" variant="outline">Categorized</Badge>;
  if (status === "excluded") return <Badge variant="secondary">Excluded</Badge>;
  return <Badge className="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300" variant="outline">Needs review</Badge>;
}

function formatCurrency(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
function compactCurrency(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 0 }).format(cents / 100); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
