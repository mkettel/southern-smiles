"use client";

import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip as ChartTooltip } from "chart.js";
import { Bar as ChartBar } from "react-chartjs-2";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FinancialWorkspaceData } from "@/lib/financial-workspace";

ChartJS.register(CategoryScale, LinearScale, BarElement, ChartTooltip, Legend);

export function FinancialReportsDashboard({ data }: { data: FinancialWorkspaceData }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
        <Metric label="Revenue" value={formatCurrency(data.revenueCents)} />
        <Metric label="Operating expenses" value={formatCurrency(data.expenseCents)} />
        <Metric label="Net operating income" value={formatCurrency(data.netIncomeCents)} accent={data.netIncomeCents >= 0} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border bg-card p-5">
          <div><h2 className="font-semibold">Six-month P&amp;L</h2><p className="mt-1 text-sm text-muted-foreground">Reviewed transactions grouped by chart-of-accounts type.</p></div>
          <ReportChart months={data.months} />
        </section>
        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b px-5 py-4"><h2 className="font-semibold">Top operating expenses</h2><p className="mt-1 text-sm text-muted-foreground">{data.monthLabel} by chart-of-accounts category.</p></div>
          {data.expenseBreakdown.length ? (
            <Table><TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead>Account</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Share</TableHead></TableRow></TableHeader><TableBody>
              {data.expenseBreakdown.map((item) => <TableRow key={item.name}><TableCell className="font-medium">{item.name}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(item.amountCents)}</TableCell><TableCell className="text-right text-muted-foreground tabular-nums">{data.expenseCents ? `${Math.round((item.amountCents / data.expenseCents) * 100)}%` : "0%"}</TableCell></TableRow>)}
            </TableBody></Table>
          ) : <div className="px-5 py-14 text-center text-sm text-muted-foreground">Review transactions to build the expense report.</div>}
        </section>
      </div>
      <p className="text-xs text-muted-foreground">This operational P&amp;L includes reviewed transactions from accounts enabled for bookkeeping. Confirm final financial statements with your accountant.</p>
    </div>
  );
}

function ReportChart({ months }: { months: FinancialWorkspaceData["months"] }) {
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

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) { return <div className="bg-card p-5"><p className="text-sm text-muted-foreground">{label}</p><p className={accent ? "mt-2 text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400" : "mt-2 text-2xl font-semibold tabular-nums"}>{value}</p></div>; }
function formatCurrency(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
function compactCurrency(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 0 }).format(cents / 100); }
