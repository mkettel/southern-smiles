"use client";

import { useState, useTransition } from "react";
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip as ChartTooltip } from "chart.js";
import { Bar } from "react-chartjs-2";
import { ChevronLeft, ChevronRight, Download, Info, LoaderCircle } from "lucide-react";
import { getFinancialCashFlowData } from "@/actions/financial-cash-flow";
import { cashFlowCsv, cashFlowDateLabel, type CashFlowData } from "@/lib/financial-cash-flow";
import { cn } from "@/lib/utils";

ChartJS.register(CategoryScale, LinearScale, BarElement, ChartTooltip, Legend);
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const signed = (cents: number) => `${cents > 0 ? "+" : ""}${money(cents)}`;
const positive = "text-emerald-700 dark:text-emerald-400";
const negative = "text-rose-700 dark:text-rose-400";

export function FinancialCashFlowDashboard({ initialData, previewMonths }: { initialData: CashFlowData; previewMonths?: CashFlowData[] }) {
  const [data, setData] = useState(initialData);
  const [weekIndex, setWeekIndex] = useState(0);
  const [direction, setDirection] = useState<"payments" | "receipts">("payments");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const report = data.report;
  const week = report.weeks[Math.min(weekIndex, report.weeks.length - 1)];
  const monthIndex = data.months.findIndex((m) => m.key === report.month);
  const activity = week.activity.filter((a) => direction === "payments" ? a.amountCents < 0 : a.amountCents > 0);

  function changeMonth(month: string) {
    setError("");
    startTransition(async () => {
      try {
        const next = previewMonths ? previewMonths.find((m) => m.report.month === month) : await getFinancialCashFlowData(month);
        if (!next) throw new Error("Month unavailable");
        setData(next);
        setWeekIndex(0);
      } catch {
        setError("Cash-flow data could not be loaded. Please try again.");
      }
    });
  }

  function download() {
    const url = URL.createObjectURL(new Blob([cashFlowCsv(report)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `posted-cash-flow-${report.month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="min-w-0 space-y-5" aria-busy={pending}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Cash flow</h2><p className="mt-1 text-sm text-muted-foreground">Posted bank activity · Through {cashFlowDateLabel(report.through)}, {report.through.slice(0, 4)}{previewMonths ? " · Illustrative data" : ""}</p></div>
      <div className="flex max-w-full items-center gap-2">
        <button type="button" title="Previous month" aria-label="Previous month" disabled={pending || monthIndex >= data.months.length - 1} onClick={() => changeMonth(data.months[monthIndex + 1].key)} className="flex size-9 shrink-0 items-center justify-center rounded-md border hover:bg-accent disabled:opacity-30"><ChevronLeft className="size-4" /></button>
        <select aria-label="Cash-flow month" value={report.month} disabled={pending} onChange={(e) => changeMonth(e.target.value)} className="h-9 min-w-0 rounded-md border bg-background px-3 text-sm">{data.months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
        <button type="button" title="Next month" aria-label="Next month" disabled={pending || monthIndex <= 0} onClick={() => changeMonth(data.months[monthIndex - 1].key)} className="flex size-9 shrink-0 items-center justify-center rounded-md border hover:bg-accent disabled:opacity-30"><ChevronRight className="size-4" /></button>
        <button type="button" title="Download weekly CSV" aria-label="Download weekly CSV" disabled={pending} onClick={download} className="flex size-9 shrink-0 items-center justify-center rounded-md border hover:bg-accent"><Download className="size-4" /></button>
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {pending && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading cash flow…</p>}
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y py-3 text-xs text-muted-foreground">
      <span title={data.accountNames.join("\n")} className="flex items-center gap-1.5"><Info className="size-3.5" />{data.accountNames.length} included bank accounts · USD</span>
      <span>Internal bank transfers excluded</span>
      {(data.unpostedCount > 0 || data.settlingCount > 0) && <a href="/admin/financial-transactions" className="text-amber-700 underline underline-offset-4 dark:text-amber-400">{data.unpostedCount} awaiting posting · {data.settlingCount} waiting for settlement</a>}
      {data.unsupportedCurrencyCount > 0 && <span className="text-amber-700 dark:text-amber-400">{data.unsupportedCurrencyCount} non-USD accounts excluded</span>}
    </div>
    <div className="grid grid-cols-1 divide-y border-b sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {[{ label: "Cash in", value: money(report.inflowCents), color: positive }, { label: "Cash out", value: money(report.outflowCents), color: negative }, { label: "Net cash change", value: signed(report.netCents), color: report.netCents >= 0 ? positive : negative }].map((metric) => <div key={metric.label} className="py-4 sm:px-5 first:sm:pl-0"><p className="text-sm text-muted-foreground">{metric.label}</p><p className={cn("mt-2 break-words text-2xl font-semibold tabular-nums", metric.color)}>{metric.value}</p></div>)}
    </div>
    {!data.accountNames.length ? <p className="py-12 text-center text-sm text-muted-foreground">No USD bank accounts are included in bookkeeping.</p> : <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0" aria-label="Weekly cash flow">
        <div className="h-64 min-w-0 sm:h-80">
          <Bar aria-label="Weekly cash in and cash out" role="img" data={{ labels: report.weeks.map((w) => w.label), datasets: [
            { label: "Cash in", data: report.weeks.map((w) => w.inflowCents / 100), backgroundColor: "#10a88a", borderRadius: 3 },
            { label: "Cash out", data: report.weeks.map((w) => w.outflowCents / 100), backgroundColor: "#ed7066", borderRadius: 3 },
          ] }} options={{ responsive: true, maintainAspectRatio: false, animation: false, onClick: (_, elements) => { if (elements.length) setWeekIndex(elements[0].index); }, plugins: { legend: { position: "bottom", labels: { color: "#8b929d", usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${money(Number(ctx.raw) * 100)}` } } }, scales: { x: { grid: { display: false }, ticks: { color: "#8b929d", maxRotation: 0, autoSkip: true } }, y: { beginAtZero: true, ticks: { color: "#8b929d", callback: (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact" }).format(Number(v)) }, grid: { color: "#88888820" } } } }} />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm tabular-nums"><caption className="sr-only">Weekly cash-flow totals, USD</caption><thead><tr className="border-y text-left text-xs text-muted-foreground"><th className="py-3 pr-3 font-medium">Week</th><th className="px-2 text-right font-medium">Cash in</th><th className="px-2 text-right font-medium">Cash out</th><th className="pl-2 text-right font-medium">Net cash</th></tr></thead><tbody>
            {report.weeks.map((w, i) => <tr key={w.start} className={cn("border-b", week.start === w.start && "bg-emerald-500/10")}><th className="py-1 pr-3 text-left font-normal"><button type="button" aria-label={`Select week ${i + 1}: ${w.label}`} aria-pressed={week.start === w.start} onClick={() => setWeekIndex(i)} className="min-h-11 text-left hover:underline"><span className="block font-medium">Week {i + 1}</span><span className="block whitespace-nowrap text-xs text-muted-foreground">{w.label}</span></button></th><td className="whitespace-nowrap px-2 text-right">{money(w.inflowCents)}</td><td className="whitespace-nowrap px-2 text-right">{money(w.outflowCents)}</td><td className={cn("whitespace-nowrap pl-2 text-right font-medium", w.netCents >= 0 ? positive : negative)}>{signed(w.netCents)}</td></tr>)}
          </tbody><tfoot><tr className="font-semibold"><th className="py-4 text-left">Total</th><td className="px-2 text-right">{money(report.inflowCents)}</td><td className="px-2 text-right">{money(report.outflowCents)}</td><td className="pl-2 text-right">{signed(report.netCents)}</td></tr></tfoot></table>
        </div>
      </section>
      <section className="min-w-0 border-t pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0" aria-label="Selected week activity">
        <div className="flex items-start justify-between gap-2"><div><h3 className="font-semibold">Week {report.weeks.indexOf(week) + 1}</h3><p className="mt-1 text-sm text-muted-foreground">{week.label}, {report.month.slice(0, 4)}</p></div><div className="flex"><button aria-label="Previous week" title="Previous week" disabled={weekIndex <= 0} onClick={() => setWeekIndex(weekIndex - 1)} className="flex size-9 items-center justify-center rounded-md hover:bg-accent disabled:opacity-30"><ChevronLeft className="size-4" /></button><button aria-label="Next week" title="Next week" disabled={weekIndex >= report.weeks.length - 1} onClick={() => setWeekIndex(weekIndex + 1)} className="flex size-9 items-center justify-center rounded-md hover:bg-accent disabled:opacity-30"><ChevronRight className="size-4" /></button></div></div>
        <dl className="my-5 space-y-3 text-sm tabular-nums">{[{ label: "Cash in", value: week.inflowCents }, { label: "Cash out", value: -week.outflowCents }, { label: "Net cash", value: week.netCents }].map((v) => <div key={v.label} className="flex justify-between gap-2"><dt>{v.label}</dt><dd className={v.value >= 0 ? positive : negative}>{signed(v.value)}</dd></div>)}</dl>
        <div role="tablist" aria-label="Cash direction" className="flex border-b">{(["payments", "receipts"] as const).map((value) => <button key={value} role="tab" aria-selected={direction === value} onClick={() => setDirection(value)} className={cn("min-h-11 flex-1 border-b-2 text-sm capitalize", direction === value ? "border-emerald-600 font-medium" : "border-transparent text-muted-foreground")}>{value}</button>)}</div>
        <div role="tabpanel" aria-label={direction} className="max-h-[440px] overflow-y-auto">
          {activity.length ? activity.map((entry) => <div key={entry.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b py-3 text-sm"><div className="min-w-0"><p className="break-words font-medium [overflow-wrap:anywhere]">{entry.description}</p><p className="mt-1 text-xs text-muted-foreground">{cashFlowDateLabel(entry.date)} · {entry.account}</p></div><p className={cn("whitespace-nowrap tabular-nums", entry.amountCents > 0 ? positive : negative)}>{signed(entry.amountCents)}</p></div>) : <p className="py-10 text-center text-sm text-muted-foreground">No posted {direction} this week.</p>}
        </div>
      </section>
    </div>}
    <p className="border-t pt-4 text-xs text-muted-foreground">Board ledger · Posted entries only · Not a reconciled bank statement</p>
  </div>;
}
