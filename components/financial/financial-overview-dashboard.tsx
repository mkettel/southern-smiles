"use client";

import Link from "next/link";
import { useState } from "react";
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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FinancialWorkspaceData } from "@/lib/financial-workspace";
import { cn } from "@/lib/utils";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ChartTooltip, Legend);

export function FinancialOverviewDashboard({ data }: { data: FinancialWorkspaceData }) {
  const [monthKey, setMonthKey] = useState(data.months.at(-1)?.key ?? "");
  const selectedIndex = Math.max(0, data.months.findIndex((month) => month.key === monthKey));
  const selectedMonth = data.months[selectedIndex] ?? data.months.at(-1)!;
  const trendMonths = data.months.slice(Math.max(0, selectedIndex - 5), selectedIndex + 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative block min-w-52">
          <span className="sr-only">Overview month</span>
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            aria-label="Overview month"
            value={selectedMonth.key}
            onChange={(event) => setMonthKey(event.target.value)}
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
          Review {data.pendingCount.toLocaleString()} transactions
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.9fr]">
        <section className="rounded-lg border bg-card p-5" aria-labelledby="pnl-heading">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="pnl-heading" className="font-semibold">P&amp;L snapshot</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{selectedMonth.dateRange} · reviewed transactions</p>
            </div>
            <Badge variant="outline">Live</Badge>
          </div>
          <div className="mt-5 grid gap-6 lg:grid-cols-[260px_1fr]">
            <div className="space-y-3">
              <FinancialLine label="Revenue" value={selectedMonth.revenueCents} />
              <FinancialLine label="Operating expenses" value={selectedMonth.expenseCents} negative />
              <div className="border-t pt-4">
                <FinancialLine label="Net operating income" value={selectedMonth.revenueCents - selectedMonth.expenseCents} emphasized />
              </div>
              <Link href="/admin/financial/reports" className="inline-flex items-center gap-1 pt-3 text-sm font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400">
                View full P&amp;L report <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <TrendChart months={trendMonths} />
          </div>
        </section>

        <section className="rounded-lg border bg-card p-5" aria-labelledby="attention-heading">
          <div className="flex items-center gap-2">
            <h2 id="attention-heading" className="font-semibold">Attention queue</h2>
            <Badge variant="secondary">{data.pendingCount + data.overdueBillCount}</Badge>
          </div>
          <div className="mt-4 divide-y">
            <QueueItem icon={ListChecks} label="Uncategorized transactions" detail="Needs review and categorization" value={Math.max(0, data.pendingCount - data.unmatchedTransferCount)} href="/admin/financial-transactions" tone="orange" />
            <QueueItem icon={Repeat2} label="Unmatched transfers" detail="Review possible internal transfers" value={data.unmatchedTransferCount} href="/admin/financial-transactions" tone="violet" />
            <QueueItem icon={ReceiptText} label="Overdue bills" detail="Past due and needs attention" value={data.overdueBillCount} href="/admin/bills" tone="red" />
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-lg border bg-card" aria-labelledby="activity-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 id="activity-heading" className="font-semibold">Recent bookkeeping activity</h2>
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
                  <TableHead>Category</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedMonth.recentActivity.map((activity) => (
                  <TableRow key={activity.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(activity.date)}</TableCell>
                    <TableCell className="max-w-72 truncate font-medium">{activity.description}</TableCell>
                    <TableCell>{activity.category}</TableCell>
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

function TrendChart({ months }: { months: FinancialWorkspaceData["months"] }) {
  return (
    <div className="h-[190px] min-w-0">
      <ChartLine
        data={{
          labels: months.map((month) => month.label),
          datasets: [
            { label: "Revenue", data: months.map((month) => month.revenueCents / 100), borderColor: "#0f8f78", backgroundColor: "#0f8f78", borderWidth: 2, pointRadius: 3, tension: 0 },
            { label: "Expenses", data: months.map((month) => month.expenseCents / 100), borderColor: "#737373", backgroundColor: "#737373", borderWidth: 2, pointRadius: 3, tension: 0 },
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

function FinancialLine({ label, value, negative, emphasized }: { label: string; value: number; negative?: boolean; emphasized?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 text-sm", emphasized && "font-semibold")}>
      <span className="whitespace-nowrap">{label}</span>
      <span className={cn("tabular-nums", emphasized && (value >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"))}>
        {negative ? `(${formatCurrency(value)})` : formatCurrency(value)}
      </span>
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
    <Link href={href} className="group flex items-center gap-4 py-4 first:pt-2 last:pb-2">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", queueTones[tone])}><Icon className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function StatusBadge({ status }: { status: FinancialWorkspaceData["recentActivity"][number]["reviewStatus"] }) {
  if (status === "reviewed") return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300" variant="outline">Categorized</Badge>;
  if (status === "excluded") return <Badge variant="secondary">Excluded</Badge>;
  return <Badge className="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300" variant="outline">Uncategorized</Badge>;
}

function formatCurrency(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
function compactCurrency(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 0 }).format(cents / 100); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
