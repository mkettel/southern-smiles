import type { BookkeepingAccount, FinancialTransaction } from "@/lib/financial-transactions";

export type FinancialReportPeriodKey =
  | `month:${string}`
  | "six_months"
  | "year"
  | "all_time";

export interface FinancialReportCategory {
  id: string;
  accountNumber: string | null;
  name: string;
  detailType: string | null;
  amountCents: number;
  transactionCount: number;
  spendingShareTenths: number;
}

export interface FinancialReportPeriod {
  key: FinancialReportPeriodKey;
  label: string;
  dateRange: string;
  revenueCents: number;
  expenseCents: number;
  grossExpenseCents: number;
  expenseCreditsCents: number;
  netIncomeCents: number;
  categories: FinancialReportCategory[];
}

export interface FinancialReportsData {
  periods: FinancialReportPeriod[];
  months: Array<{
    key: string;
    label: string;
    revenueCents: number;
    expenseCents: number;
  }>;
}

type ReportTransaction = Pick<
  FinancialTransaction,
  "transaction_date" | "amount_cents" | "bookkeeping_account_id"
>;

export function buildFinancialReportsData({
  accounts,
  transactions,
  now,
}: {
  accounts: BookkeepingAccount[];
  transactions: ReportTransaction[];
  now: Date;
}): FinancialReportsData {
  const today = toPhoenixDate(now);
  const [year, month] = today.split("-").map(Number);
  const tomorrow = shiftDate(today, 1);
  const monthStart = isoDate(year, month, 1);
  const sixMonthStartDate = new Date(Date.UTC(year, month - 6, 1));
  const sixMonthStart = isoDate(
    sixMonthStartDate.getUTCFullYear(),
    sixMonthStartDate.getUTCMonth() + 1,
    1,
  );
  const yearStart = isoDate(year, 1, 1);
  const earliestTransaction = transactions
    .map((transaction) => transaction.transaction_date)
    .sort()[0] ?? monthStart;
  const allTimeStart = earliestTransaction < monthStart ? earliestTransaction : monthStart;
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  const monthPeriods = buildMonthStarts(allTimeStart, monthStart)
    .map((start) => {
      const end = start === monthStart ? tomorrow : nextMonthStart(start);
      return createPeriod(
        `month:${start.slice(0, 7)}`,
        formatMonthLabel(start),
        start,
        end,
      );
    })
    .reverse();
  const periods: FinancialReportPeriod[] = [
    ...monthPeriods,
    createPeriod("six_months", "Last 6 months", sixMonthStart, tomorrow),
    createPeriod("year", "This year", yearStart, tomorrow),
    createPeriod("all_time", "All time", allTimeStart, tomorrow),
  ];

  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 6 + index, 1));
    const start = isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
    const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    const end = isoDate(next.getUTCFullYear(), next.getUTCMonth() + 1, 1);
    const summary = summarize(start, end);
    return {
      key: start.slice(0, 7),
      label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date),
      revenueCents: summary.revenueCents,
      expenseCents: summary.expenseCents,
    };
  });

  return { periods, months };

  function createPeriod(
    key: FinancialReportPeriodKey,
    label: string,
    start: string,
    end: string,
  ): FinancialReportPeriod {
    const summary = summarize(start, end);
    return {
      key,
      label,
      dateRange: formatDateRange(start, shiftDate(end, -1)),
      revenueCents: summary.revenueCents,
      expenseCents: summary.expenseCents,
      grossExpenseCents: summary.grossExpenseCents,
      expenseCreditsCents: summary.expenseCreditsCents,
      netIncomeCents: summary.revenueCents - summary.expenseCents,
      categories: summary.categories,
    };
  }

  function summarize(start: string, end: string) {
    const expenseAccounts = accounts.filter((account) => isExpenseType(account.accountType));
    const categoryById = new Map(
      expenseAccounts.map((account) => [
        account.id,
        {
          id: account.id,
          accountNumber: account.accountNumber,
          name: account.name,
          detailType: account.detailType,
          amountCents: 0,
          transactionCount: 0,
          spendingShareTenths: 0,
        } satisfies FinancialReportCategory,
      ]),
    );
    let revenueCents = 0;
    let expenseCents = 0;

    for (const transaction of transactions) {
      if (
        transaction.transaction_date < start ||
        transaction.transaction_date >= end ||
        !transaction.bookkeeping_account_id
      ) continue;
      const account = accountById.get(transaction.bookkeeping_account_id);
      if (!account) continue;
      if (isIncomeType(account.accountType)) {
        revenueCents -= transaction.amount_cents;
      }
      if (isExpenseType(account.accountType)) {
        expenseCents += transaction.amount_cents;
        const category = categoryById.get(account.id);
        if (category) {
          category.amountCents += transaction.amount_cents;
          category.transactionCount += 1;
        }
      }
    }

    const sortedCategories = [...categoryById.values()].sort(
      (left, right) =>
        right.amountCents - left.amountCents ||
        compareAccountNumbers(left.accountNumber, right.accountNumber) ||
        left.name.localeCompare(right.name),
    );
    const grossExpenseCents = sortedCategories.reduce(
      (total, category) => total + Math.max(category.amountCents, 0),
      0,
    );
    const expenseCreditsCents = sortedCategories.reduce(
      (total, category) => total + Math.min(category.amountCents, 0),
      0,
    );
    const categories = assignSpendingShares(sortedCategories, grossExpenseCents);

    return {
      revenueCents,
      expenseCents,
      grossExpenseCents,
      expenseCreditsCents,
      categories,
    };
  }
}

function buildMonthStarts(firstDate: string, currentMonthStart: string) {
  const starts: string[] = [];
  let cursor = firstDate.slice(0, 7) + "-01";
  while (cursor <= currentMonthStart) {
    starts.push(cursor);
    cursor = nextMonthStart(cursor);
  }
  return starts;
}

function nextMonthStart(value: string) {
  const [year, month] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  return isoDate(next.getUTCFullYear(), next.getUTCMonth() + 1, 1);
}

function formatMonthLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function assignSpendingShares(
  categories: FinancialReportCategory[],
  grossExpenseCents: number,
) {
  if (!grossExpenseCents) return categories;

  const allocations = categories
    .filter((category) => category.amountCents > 0)
    .map((category) => {
      const exactTenths = (category.amountCents / grossExpenseCents) * 1000;
      return {
        id: category.id,
        tenths: Math.floor(exactTenths),
        remainder: exactTenths - Math.floor(exactTenths),
      };
    });
  let tenthsRemaining = 1000 - allocations.reduce((total, allocation) => total + allocation.tenths, 0);
  allocations.sort((left, right) => right.remainder - left.remainder || left.id.localeCompare(right.id));
  for (const allocation of allocations) {
    if (!tenthsRemaining) break;
    allocation.tenths += 1;
    tenthsRemaining -= 1;
  }
  const shareById = new Map(allocations.map((allocation) => [allocation.id, allocation.tenths]));
  return categories.map((category) => ({
    ...category,
    spendingShareTenths: shareById.get(category.id) ?? 0,
  }));
}

function isIncomeType(value: string) {
  return /(income|revenue)/i.test(value) && !/other current/i.test(value);
}

function isExpenseType(value: string) {
  return /(expense|cost of goods|cogs)/i.test(value);
}

function compareAccountNumbers(left: string | null, right: string | null) {
  if (left === right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right, undefined, { numeric: true });
}

function formatDateRange(start: string, end: string) {
  const startDate = new Date(`${start}T12:00:00Z`);
  const endDate = new Date(`${end}T12:00:00Z`);
  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();
  const startLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" as const }),
    timeZone: "UTC",
  }).format(startDate);
  const endLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(endDate);
  return `${startLabel} – ${endLabel}`;
}

function toPhoenixDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
