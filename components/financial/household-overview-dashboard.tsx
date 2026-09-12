"use client";

import Link from "next/link";
import { useState } from "react";
import { useTheme } from "next-themes";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip as ChartTooltip,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  CreditCard,
  Landmark,
  PiggyBank,
  Plug,
  RefreshCw,
  Scale,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  HOUSEHOLD_CATEGORY_LIMIT,
  formatCents,
  formatCentsCompact,
  type HouseholdAccount,
  type HouseholdAccountKind,
  type HouseholdFinanceData,
  type HouseholdMonth,
} from "@/lib/household-finance";
import { cn } from "@/lib/utils";

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ChartTooltip, Legend);

// Validated categorical slots 1 (blue) and 2 (orange); dark steps are the
// same hues re-stepped for the dark surface.
const PALETTES = {
  light: { income: "#2a78d6", spending: "#eb6834", cash: "#2a78d6", cards: "#eb6834", grid: "#e1e0d9", tick: "#898781", legend: "#52514e" },
  dark: { income: "#3987e5", spending: "#d95926", cash: "#3987e5", cards: "#d95926", grid: "#2c2c2a", tick: "#898781", legend: "#c3c2b7" },
} as const;

type ChartPalette = (typeof PALETTES)[keyof typeof PALETTES];

function useChartPalette(): ChartPalette {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? PALETTES.dark : PALETTES.light;
}

export function HouseholdOverviewDashboard({ data }: { data: HouseholdFinanceData }) {
  const [monthKey, setMonthKey] = useState(data.months.at(-1)?.key ?? "");
  const selectedIndex = Math.max(0, data.months.findIndex((month) => month.key === monthKey));
  const month = data.months[selectedIndex] ?? data.months.at(-1)!;
  const palette = useChartPalette();

  const cashAccounts = data.accounts.filter((account) => account.kind !== "credit");
  const cardAccounts = data.accounts.filter((account) => account.kind === "credit");
  const utilizationTenths =
    data.totals.creditLimitCents > 0
      ? Math.round((Math.max(0, data.totals.creditCents) / data.totals.creditLimitCents) * 1000)
      : null;

  if (data.accounts.length === 0) {
    return (
      <section className="rounded-lg border bg-card px-6 py-14 text-center">
        <Plug className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="mt-4 font-semibold">No accounts connected yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Connect a bank or credit card and this page fills in with balances, spending by category, and monthly cash flow.
        </p>
        <Link href="/admin/financial-connections" className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400">
          Connect an account <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative block min-w-52">
          <span className="sr-only">Month</span>
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            aria-label="Month"
            value={month.key}
            onChange={(event) => setMonthKey(event.target.value)}
            className="h-10 w-full appearance-none rounded-md border bg-background pl-9 pr-9 text-sm font-medium shadow-sm"
          >
            {[...data.months].reverse().map((option) => (
              <option key={option.key} value={option.key}>{option.longLabel}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </label>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Synced {data.lastSyncedAt ? formatDateTime(data.lastSyncedAt) : "not yet"}
          </span>
          <Link href="/admin/financial-connections" className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400">
            {data.connectionCount} {data.connectionCount === 1 ? "connection" : "connections"} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={Wallet}
          label="Cash on hand"
          value={formatCents(data.totals.cashCents)}
          detail={`Checking ${formatCents(data.totals.checkingCents)} · Savings ${formatCents(data.totals.savingsCents)}`}
        />
        <StatTile
          icon={CreditCard}
          label="Credit card balances"
          value={formatCents(data.totals.creditCents)}
          detail={
            utilizationTenths === null
              ? `${cardAccounts.length} ${cardAccounts.length === 1 ? "card" : "cards"}`
              : `${formatTenths(utilizationTenths)} of ${formatCentsCompact(data.totals.creditLimitCents)} limit`
          }
        />
        <StatTile
          icon={Scale}
          label="Net cash"
          value={formatCents(data.totals.netCents)}
          detail="Cash minus card balances"
          tone={data.totals.netCents < 0 ? "negative" : "default"}
        />
        <StatTile
          icon={Landmark}
          label={`${month.label} spending`}
          value={formatCents(month.spendingCents)}
          detail={`Income ${formatCents(month.incomeCents)} · Net ${formatSigned(month.netCents)}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.9fr]">
        <section className="rounded-lg border bg-card p-5" aria-labelledby="cashflow-heading">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="cashflow-heading" className="font-semibold">Cash flow</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">Income vs spending, last {data.months.length} months · click a month to focus it</p>
            </div>
            <Badge variant="outline">Excludes transfers</Badge>
          </div>
          <CashFlowChart months={data.months} selectedIndex={selectedIndex} palette={palette} onSelect={(key) => setMonthKey(key)} />
        </section>

        <section className="rounded-lg border bg-card p-5" aria-labelledby="category-heading">
          <h2 id="category-heading" className="font-semibold">Where {month.label} went</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{formatCents(month.spendingCents)} across {month.transactionCount.toLocaleString()} transactions</p>
          <CategoryBars month={month} color={palette.spending} />
        </section>
      </div>

      <section className="overflow-hidden rounded-lg border bg-card" aria-labelledby="accounts-heading">
        <div className="border-b px-5 py-4">
          <h2 id="accounts-heading" className="font-semibold">Accounts</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Balances as of the last sync for every active connection</p>
        </div>
        {cashAccounts.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Bank account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Synced</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cashAccounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell><AccountName account={account} /></TableCell>
                    <TableCell><KindBadge kind={account.kind} /></TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatCents(account.balanceCents)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{account.availableCents === null ? "—" : formatCents(account.availableCents)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">{account.lastSyncedAt ? formatDateTime(account.lastSyncedAt) : "—"}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/20 hover:bg-muted/20">
                  <TableCell className="font-medium" colSpan={2}>Total cash</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatCents(data.totals.cashCents)}</TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
        {cardAccounts.length > 0 && (
          <div className="overflow-x-auto border-t">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Credit card</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="min-w-44">Utilization</TableHead>
                  <TableHead className="text-right">Next payment</TableHead>
                  <TableHead className="text-right">This month</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cardAccounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell><AccountName account={account} /></TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatCents(account.balanceCents)}</TableCell>
                    <TableCell><UtilizationBar account={account} color={palette.cards} /></TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm">
                      {account.minimumPaymentCents ? <span className="tabular-nums">{formatCents(account.minimumPaymentCents)}</span> : <span className="text-muted-foreground">—</span>}
                      {account.nextPaymentDueDate && <span className="block text-xs text-muted-foreground">due {formatDate(account.nextPaymentDueDate)}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(account.monthSpendCents)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/20 hover:bg-muted/20">
                  <TableCell className="font-medium">Total card balances</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatCents(data.totals.creditCents)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{utilizationTenths === null ? "" : `${formatTenths(utilizationTenths)} of ${formatCents(data.totals.creditLimitCents)}`}</TableCell>
                  <TableCell />
                  <TableCell className="text-right tabular-nums">{formatCents(cardAccounts.reduce((sum, account) => sum + account.monthSpendCents, 0))}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.9fr]">
        <section className="rounded-lg border bg-card p-5" aria-labelledby="history-heading">
          <h2 id="history-heading" className="font-semibold">Balance history</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Daily snapshots of total cash and total card balances</p>
          {data.balanceHistory.length >= 2 ? (
            <BalanceHistoryChart points={data.balanceHistory} palette={palette} />
          ) : (
            <p className="mt-6 rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              Balances are snapshotted once a day. The trend line appears after the second snapshot.
            </p>
          )}
        </section>

        <section className="rounded-lg border bg-card p-5" aria-labelledby="by-account-heading">
          <h2 id="by-account-heading" className="font-semibold">{month.label} spending by account</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Which card or account the money left from</p>
          <AccountBars month={month} color={palette.spending} />
        </section>
      </div>

      <section className="overflow-hidden rounded-lg border bg-card" aria-labelledby="recent-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 id="recent-heading" className="font-semibold">Recent transactions</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Latest activity across every account{data.pendingCount > 0 ? ` · ${data.pendingCount} pending` : ""}
            </p>
          </div>
          <Link href="/admin/financial-transactions" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400">
            All transactions <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {data.recentTransactions.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentTransactions.map((txn) => (
                  <TableRow key={txn.id} className={cn(txn.isTransfer && "text-muted-foreground")}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(txn.date)}</TableCell>
                    <TableCell className="max-w-72 truncate font-medium">
                      {txn.description}
                      {txn.pending && <Badge variant="secondary" className="ml-2 align-middle">Pending</Badge>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{txn.categoryLabel}</TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground">{txn.accountLabel}</TableCell>
                    <TableCell className={cn("whitespace-nowrap text-right font-semibold tabular-nums", txn.amountCents < 0 && !txn.isTransfer && "text-emerald-700 dark:text-emerald-400")}>
                      {txn.amountCents < 0 ? "+" : "-"}{formatCents(Math.abs(txn.amountCents))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="px-5 py-14 text-center text-sm text-muted-foreground">No transactions have synced yet.</div>
        )}
      </section>
    </div>
  );
}

function CashFlowChart({
  months,
  selectedIndex,
  palette,
  onSelect,
}: {
  months: HouseholdMonth[];
  selectedIndex: number;
  palette: ChartPalette;
  onSelect: (key: string) => void;
}) {
  const emphasize = (color: string) => months.map((_, index) => (index === selectedIndex ? color : `${color}8c`));
  return (
    <div className="mt-5 h-[260px] min-w-0">
      <Bar
        data={{
          labels: months.map((month) => month.label),
          datasets: [
            { label: "Income", data: months.map((month) => month.incomeCents / 100), backgroundColor: emphasize(palette.income), borderRadius: 4, borderSkipped: "bottom", barPercentage: 0.7, categoryPercentage: 0.6 },
            { label: "Spending", data: months.map((month) => month.spendingCents / 100), backgroundColor: emphasize(palette.spending), borderRadius: 4, borderSkipped: "bottom", barPercentage: 0.7, categoryPercentage: 0.6 },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { intersect: false, mode: "index" },
          onClick: (_event, elements) => {
            const index = elements[0]?.index;
            if (index !== undefined && months[index]) onSelect(months[index].key);
          },
          plugins: {
            legend: { position: "bottom", labels: { boxWidth: 12, boxHeight: 12, color: palette.legend } },
            tooltip: {
              callbacks: {
                title: (items) => months[items[0]?.dataIndex ?? 0]?.longLabel ?? "",
                label: (context) => `${context.dataset.label}: ${formatCents(Number(context.raw) * 100)}`,
                footer: (items) => {
                  const month = months[items[0]?.dataIndex ?? 0];
                  return month ? `Net ${formatSigned(month.netCents)}` : "";
                },
              },
            },
          },
          scales: {
            x: { grid: { display: false }, border: { display: false }, ticks: { color: palette.tick } },
            y: { beginAtZero: true, border: { display: false }, grid: { color: palette.grid }, ticks: { color: palette.tick, callback: (value) => formatCentsCompact(Number(value) * 100) } },
          },
        }}
      />
    </div>
  );
}

function BalanceHistoryChart({ points, palette }: { points: HouseholdFinanceData["balanceHistory"]; palette: ChartPalette }) {
  return (
    <div className="mt-5 h-[240px] min-w-0">
      <Line
        data={{
          labels: points.map((point) => formatDate(point.date)),
          datasets: [
            { label: "Cash", data: points.map((point) => point.cashCents / 100), borderColor: palette.cash, backgroundColor: palette.cash, borderWidth: 2, pointRadius: points.length > 40 ? 0 : 4, pointHoverRadius: 5, tension: 0 },
            { label: "Card balances", data: points.map((point) => point.creditCents / 100), borderColor: palette.cards, backgroundColor: palette.cards, borderWidth: 2, pointRadius: points.length > 40 ? 0 : 4, pointHoverRadius: 5, tension: 0 },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { intersect: false, mode: "index" },
          plugins: {
            legend: { position: "bottom", labels: { boxWidth: 18, boxHeight: 2, color: palette.legend } },
            tooltip: {
              callbacks: {
                label: (context) => `${context.dataset.label}: ${formatCents(Number(context.raw) * 100)}`,
                footer: (items) => {
                  const point = points[items[0]?.dataIndex ?? 0];
                  return point ? `Net cash ${formatSigned(point.netCents)}` : "";
                },
              },
            },
          },
          scales: {
            x: { grid: { display: false }, border: { display: false }, ticks: { color: palette.tick, maxTicksLimit: 8, maxRotation: 0 } },
            y: { beginAtZero: true, border: { display: false }, grid: { color: palette.grid }, ticks: { color: palette.tick, callback: (value) => formatCentsCompact(Number(value) * 100) } },
          },
        }}
      />
    </div>
  );
}

function CategoryBars({ month, color }: { month: HouseholdMonth; color: string }) {
  const positive = month.categories.filter((category) => category.amountCents > 0);
  const shown = positive.slice(0, HOUSEHOLD_CATEGORY_LIMIT);
  const rest = positive.slice(HOUSEHOLD_CATEGORY_LIMIT);
  const rows = rest.length
    ? [
        ...shown,
        {
          key: "__other",
          label: `Other (${rest.length})`,
          amountCents: rest.reduce((sum, category) => sum + category.amountCents, 0),
          transactionCount: rest.reduce((sum, category) => sum + category.transactionCount, 0),
          shareTenths: rest.reduce((sum, category) => sum + category.shareTenths, 0),
        },
      ]
    : shown;
  if (rows.length === 0) {
    return <p className="mt-6 text-sm text-muted-foreground">No spending recorded for {month.longLabel}.</p>;
  }
  const max = rows[0].amountCents;
  return (
    <ul className="mt-5 space-y-3">
      {rows.map((row) => (
        <li key={row.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium">{row.label}</span>
            <span className="shrink-0 tabular-nums">
              {formatCents(row.amountCents)} <span className="text-xs text-muted-foreground">{formatTenths(row.shareTenths)}</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted/60" role="img" aria-label={`${row.label}: ${formatCents(row.amountCents)}, ${formatTenths(row.shareTenths)} of spending`}>
            <div className="h-2 rounded-full" style={{ width: `${Math.max(2, (row.amountCents / max) * 100)}%`, backgroundColor: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function AccountBars({ month, color }: { month: HouseholdMonth; color: string }) {
  const rows = month.spendingByAccount.filter((row) => row.amountCents > 0);
  if (rows.length === 0) {
    return <p className="mt-6 text-sm text-muted-foreground">No spending recorded for {month.longLabel}.</p>;
  }
  const total = rows.reduce((sum, row) => sum + row.amountCents, 0);
  const max = rows[0].amountCents;
  return (
    <ul className="mt-5 space-y-3">
      {rows.map((row) => (
        <li key={row.accountId} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">{row.label}</span>
              <KindBadge kind={row.kind} />
            </span>
            <span className="shrink-0 tabular-nums">
              {formatCents(row.amountCents)} <span className="text-xs text-muted-foreground">{formatTenths(Math.round((row.amountCents / total) * 1000))}</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted/60" role="img" aria-label={`${row.label}: ${formatCents(row.amountCents)}`}>
            <div className="h-2 rounded-full" style={{ width: `${Math.max(2, (row.amountCents / max) * 100)}%`, backgroundColor: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function UtilizationBar({ account, color }: { account: HouseholdAccount; color: string }) {
  if (account.utilizationTenths === null) {
    return <span className="text-xs text-muted-foreground">No limit reported</span>;
  }
  const percent = Math.min(100, account.utilizationTenths / 10);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatTenths(account.utilizationTenths)}</span>
        <span className="tabular-nums">of {formatCentsCompact(account.limitCents ?? 0)}</span>
      </div>
      <div className="h-2 rounded-full bg-muted/60" role="img" aria-label={`${formatTenths(account.utilizationTenths)} of limit used`}>
        <div className="h-2 rounded-full" style={{ width: `${Math.max(percent > 0 ? 2 : 0, percent)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "negative";
}) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden />
        {label}
      </p>
      <p className={cn("mt-2 text-2xl font-semibold", tone === "negative" && "text-destructive")}>{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground" title={detail}>{detail}</p>
    </div>
  );
}

function AccountName({ account }: { account: HouseholdAccount }) {
  return (
    <span className="block min-w-0">
      <span className="block truncate font-medium">{account.label}</span>
      <span className="block truncate text-xs text-muted-foreground">
        {[account.institution, account.mask ? `••${account.mask}` : null].filter(Boolean).join(" · ")}
      </span>
    </span>
  );
}

const KIND_LABELS: Record<HouseholdAccountKind, string> = {
  checking: "Checking",
  savings: "Savings",
  credit: "Card",
  other: "Other",
};

function KindBadge({ kind }: { kind: HouseholdAccountKind }) {
  const Icon = kind === "savings" ? PiggyBank : kind === "credit" ? CreditCard : Wallet;
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <Icon className="h-3 w-3" aria-hidden />
      {KIND_LABELS[kind]}
    </Badge>
  );
}

function formatTenths(tenths: number) {
  return `${(tenths / 10).toFixed(tenths % 10 === 0 ? 0 : 1)}%`;
}

function formatSigned(cents: number) {
  return `${cents < 0 ? "-" : "+"}${formatCents(Math.abs(cents))}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
