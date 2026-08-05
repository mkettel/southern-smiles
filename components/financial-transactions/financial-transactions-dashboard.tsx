"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CircleDollarSign,
  EyeOff,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  refreshFinancialTransactions,
  reviewFinancialTransaction,
} from "@/actions/financial-transactions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BOOKKEEPING_CATEGORIES,
  suggestBookkeepingCategory,
  transactionDisplayName,
  type BookkeepingCategory,
  type FinancialTransaction,
  type FinancialTransactionDashboardData,
} from "@/lib/financial-transactions";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "pending" | "reviewed" | "excluded";

export function FinancialTransactionsDashboard({
  initialData,
  previewMode = false,
}: {
  initialData: FinancialTransactionDashboardData;
  previewMode?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [accountId, setAccountId] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState(initialData.transactions);
  const [categories, setCategories] = useState<Record<string, BookkeepingCategory | "">>(
    () => Object.fromEntries(
      transactions.map((transaction) => [
        transaction.id,
        transaction.bookkeeping_category ?? suggestBookkeepingCategory(transaction) ?? "",
      ]),
    ),
  );

  const accountById = useMemo(
    () => new Map(initialData.accounts.map((account) => [account.id, account])),
    [initialData.accounts],
  );
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return transactions.filter((transaction) => {
      if (status !== "all" && transaction.review_status !== status) return false;
      if (accountId !== "all" && transaction.account_id !== accountId) return false;
      if (!normalizedQuery) return true;
      const account = transaction.account_id
        ? accountById.get(transaction.account_id)
        : null;
      return [
        transactionDisplayName(transaction),
        transaction.original_description,
        transaction.plaid_category_detailed,
        account?.name,
        account?.institutionName,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
    });
  }, [accountById, accountId, query, status, transactions]);

  async function refresh() {
    if (previewMode) {
      toast.success("Sample transactions are current");
      return;
    }
    setBusyId("refresh");
    const result = await refreshFinancialTransactions();
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.failed) {
      toast.warning(`${result.failed} institution sync${result.failed === 1 ? "" : "s"} could not finish`);
    } else if (result.needsConsent) {
      toast.info("One or more institutions need transaction access enabled.");
    } else {
      toast.success(
        result.imported ? `${result.imported} transaction changes imported` : "Transactions are current",
      );
    }
    startTransition(() => router.refresh());
  }

  async function review(transaction: FinancialTransaction, excluded = false) {
    const category = categories[transaction.id] || null;
    if (!excluded && !category) {
      toast.error("Choose a category before approving");
      return;
    }
    if (previewMode) {
      setTransactions((current) =>
        current.map((item) =>
          item.id === transaction.id
            ? {
                ...item,
                bookkeeping_category: excluded ? null : category,
                review_status: excluded ? "excluded" : "reviewed",
              }
            : item,
        ),
      );
      toast.success(excluded ? "Sample transaction excluded" : "Sample transaction reviewed");
      return;
    }

    setBusyId(transaction.id);
    const result = await reviewFinancialTransaction({
      transactionId: transaction.id,
      category,
      status: excluded ? "excluded" : "reviewed",
    });
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(excluded ? "Transaction excluded" : "Transaction reviewed");
    startTransition(() => router.refresh());
  }

  const disabled = isPending || busyId !== null;

  return (
    <div className="space-y-5">
      {initialData.connectionsNeedingConsent > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <p>
            {initialData.connectionsNeedingConsent} connected institution
            {initialData.connectionsNeedingConsent === 1 ? " needs" : "s need"} transaction access enabled.
          </p>
          <Button size="sm" variant="outline" render={<Link href="/admin/financial-connections" />}>
            Enable access
          </Button>
        </div>
      )}

      <div className="grid border-y sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Month outflow"
          value={formatCurrency(initialData.currentMonthOutflowCents)}
          icon={ArrowUpRight}
        />
        <Metric
          label="Month inflow"
          value={formatCurrency(initialData.currentMonthInflowCents)}
          icon={ArrowDownRight}
        />
        <Metric label="Needs review" value={String(initialData.pendingCount)} icon={CircleDollarSign} />
        <Metric
          label="Last import"
          value={initialData.lastSyncedAt ? formatShortDate(initialData.lastSyncedAt) : "Not yet"}
          icon={RefreshCw}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search merchant, description, or account"
          />
        </div>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          aria-label="Review status"
        >
          <option value="pending">Needs review ({initialData.pendingCount})</option>
          <option value="reviewed">Reviewed ({initialData.reviewedCount})</option>
          <option value="excluded">Excluded</option>
          <option value="all">All transactions</option>
        </select>
        <select
          className="h-9 max-w-64 rounded-md border bg-background px-3 text-sm"
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          aria-label="Account"
        >
          <option value="all">All accounts</option>
          {initialData.accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.institutionName} - {account.name}{account.mask ? ` ${account.mask}` : ""}
            </option>
          ))}
        </select>
        <Button
          size="icon"
          variant="outline"
          title="Import latest transactions"
          aria-label="Import latest transactions"
          onClick={refresh}
          disabled={disabled || initialData.connectionCount === 0}
        >
          {busyId === "refresh" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="border-y py-14 text-center">
          <Check className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 font-medium">No transactions in this view</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Change the filters or import the latest activity.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-28">Date</TableHead>
                <TableHead>Transaction</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="w-60">Bookkeeping category</TableHead>
                <TableHead className="w-32 text-right">Amount</TableHead>
                <TableHead className="w-24 text-right">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((transaction) => {
                const account = transaction.account_id
                  ? accountById.get(transaction.account_id)
                  : null;
                const rowBusy = busyId === transaction.id;
                return (
                  <TableRow key={transaction.id}>
                    <TableCell className="text-muted-foreground">
                      {formatDateOnly(transaction.transaction_date)}
                    </TableCell>
                    <TableCell className="max-w-[360px] whitespace-normal">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{transactionDisplayName(transaction)}</p>
                        {transaction.pending && <Badge variant="outline">Pending</Badge>}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {formatPlaidCategory(transaction.plaid_category_detailed) ||
                          transaction.original_description ||
                          "Uncategorized bank activity"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{account?.institutionName ?? "Institution"}</p>
                      <p className="text-xs text-muted-foreground">
                        {account?.name ?? "Account"}{account?.mask ? ` ${account.mask}` : ""}
                      </p>
                    </TableCell>
                    <TableCell>
                      <select
                        className="h-8 w-full rounded-md border bg-background px-2 text-sm"
                        value={categories[transaction.id] ?? ""}
                        onChange={(event) =>
                          setCategories((current) => ({
                            ...current,
                            [transaction.id]: event.target.value as BookkeepingCategory | "",
                          }))
                        }
                        disabled={rowBusy}
                        aria-label={`Category for ${transactionDisplayName(transaction)}`}
                      >
                        <option value="">Choose category</option>
                        {BOOKKEEPING_CATEGORIES.map((category) => (
                          <option key={category.value} value={category.value}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-semibold tabular-nums",
                        transaction.amount_cents < 0 && "text-emerald-700 dark:text-emerald-400",
                      )}
                    >
                      {transaction.amount_cents < 0 ? "+" : "-"}
                      {formatCurrency(Math.abs(transaction.amount_cents))}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title="Exclude from bookkeeping"
                          aria-label={`Exclude ${transactionDisplayName(transaction)}`}
                          onClick={() => review(transaction, true)}
                          disabled={disabled}
                        >
                          <EyeOff />
                        </Button>
                        <Button
                          size="icon-sm"
                          title="Approve category"
                          aria-label={`Approve ${transactionDisplayName(transaction)}`}
                          onClick={() => review(transaction)}
                          disabled={disabled || !categories[transaction.id]}
                        >
                          {rowBusy ? <Loader2 className="animate-spin" /> : <Check />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Showing up to 500 recent transactions. Imported amounts are read-only; only your review category and status are editable.
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof ArrowUpRight;
}) {
  return (
    <div className="border-b p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{label}</span>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPlaidCategory(value: string | null) {
  if (!value) return null;
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
