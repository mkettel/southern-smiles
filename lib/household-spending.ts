// Pure spending breakdown for the household "Spending" explorer.
// Filters a set of posted outflows by time range and account, then groups
// by Plaid category, merchant, and month. No DB access.

import {
  accountKind,
  accountLabel,
  categoryLabel,
  isTransferTransaction,
  monthKeyOf,
  shiftMonthKey,
  type HouseholdAccountKind,
  type HouseholdAccountRow,
  type HouseholdTransactionRow,
} from "@/lib/household-finance";
import { addDays, recurringStreamKey } from "@/lib/recurring-detection";

export type SpendingRangeKey = "this_month" | "last_month" | "3_months" | "6_months" | "12_months" | "ytd";

export interface SpendingRange {
  key: SpendingRangeKey;
  label: string;
  start: string;
  end: string;
  /** Same-length window immediately before `start`, for deltas. */
  previousStart: string;
  previousEnd: string;
}

export interface SpendingAccountOption {
  id: string;
  label: string;
  kind: HouseholdAccountKind;
}

export interface SpendingMerchant {
  key: string;
  label: string;
  amountCents: number;
  transactionCount: number;
}

export interface SpendingCategory {
  key: string;
  label: string;
  amountCents: number;
  transactionCount: number;
  /** Share of total spending in tenths of a percent. */
  shareTenths: number;
  /** Amount in the previous window; null when the previous window is empty. */
  previousAmountCents: number | null;
  /** Per-month amounts aligned with `SpendingView.months`. */
  monthly: number[];
  merchants: SpendingMerchant[];
}

export interface SpendingTransaction {
  id: string;
  date: string;
  description: string;
  categoryKey: string;
  accountLabel: string;
  amountCents: number;
}

export interface SpendingView {
  range: SpendingRange;
  totalCents: number;
  previousTotalCents: number | null;
  transactionCount: number;
  months: { key: string; label: string }[];
  categories: SpendingCategory[];
  transactions: SpendingTransaction[];
}

export const SPENDING_RANGE_KEYS: SpendingRangeKey[] = ["this_month", "last_month", "3_months", "6_months", "12_months", "ytd"];

/**
 * Fixed hue slots for the categories almost every household has. The
 * remaining slots go to the largest other categories across the whole
 * dataset (see `assignCategorySlots`), so a filter never repaints a category.
 */
export const CATEGORY_COLOR_SLOTS: Record<string, number> = {
  FOOD_AND_DRINK: 0,
  GENERAL_MERCHANDISE: 1,
  TRANSPORTATION: 2,
  RENT_AND_UTILITIES: 3,
  LOAN_PAYMENTS: 4,
};

export const CATEGORY_SLOT_COUNT = 8;

/** Slot per category key for the whole dataset; categories past the palette get no slot. */
export function assignCategorySlots(transactions: HouseholdTransactionRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const txn of transactions) {
    if (!isSpendingTransaction(txn) || txn.amount_cents <= 0) continue;
    const key = categoryKeyOf(txn);
    totals.set(key, (totals.get(key) ?? 0) + txn.amount_cents);
  }
  const slots = new Map<string, number>(Object.entries(CATEGORY_COLOR_SLOTS));
  const used = new Set(slots.values());
  const remaining = [...totals.entries()]
    .filter(([key]) => !slots.has(key))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  let next = 0;
  for (const [key] of remaining) {
    while (next < CATEGORY_SLOT_COUNT && used.has(next)) next += 1;
    if (next >= CATEGORY_SLOT_COUNT) break;
    slots.set(key, next);
    used.add(next);
  }
  return slots;
}

export const MAX_CHART_SEGMENTS = 6;
export const MAX_STACK_SERIES = 8;
export const OTHER_CATEGORY_KEY = "__other";

export function resolveSpendingRange(key: SpendingRangeKey, today: string): SpendingRange {
  const monthKey = monthKeyOf(today);
  const startOfMonth = (month: string) => `${month}-01`;
  const endOfMonth = (month: string) => addDays(startOfMonth(shiftMonthKey(month, 1)), -1);

  let start: string;
  let end: string;
  let label: string;
  switch (key) {
    case "this_month":
      start = startOfMonth(monthKey);
      end = today;
      label = "This month";
      break;
    case "last_month": {
      const last = shiftMonthKey(monthKey, -1);
      start = startOfMonth(last);
      end = endOfMonth(last);
      label = "Last month";
      break;
    }
    case "3_months":
      start = startOfMonth(shiftMonthKey(monthKey, -2));
      end = today;
      label = "Last 3 months";
      break;
    case "6_months":
      start = startOfMonth(shiftMonthKey(monthKey, -5));
      end = today;
      label = "Last 6 months";
      break;
    case "12_months":
      start = startOfMonth(shiftMonthKey(monthKey, -11));
      end = today;
      label = "Last 12 months";
      break;
    case "ytd":
      start = `${today.slice(0, 4)}-01-01`;
      end = today;
      label = "Year to date";
      break;
  }

  const lengthDays = daysInclusive(start, end);
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -(lengthDays - 1));
  return { key, label, start, end, previousStart, previousEnd };
}

export function spendingAccountOptions(accounts: HouseholdAccountRow[]): SpendingAccountOption[] {
  return accounts.map((row) => ({ id: row.id, label: accountLabel(row), kind: accountKind(row) }));
}

export function isSpendingTransaction(txn: HouseholdTransactionRow): boolean {
  if (txn.pending || txn.amount_cents === 0) return false;
  const category = (txn.plaid_category_primary ?? "").toUpperCase();
  if (category === "INCOME" || isTransferTransaction(txn)) return false;
  return true;
}

export function buildSpendingView(input: {
  transactions: HouseholdTransactionRow[];
  accounts: HouseholdAccountRow[];
  today: string;
  rangeKey: SpendingRangeKey;
  accountId?: string | null;
}): SpendingView {
  const range = resolveSpendingRange(input.rangeKey, input.today);
  const labelsById = new Map(input.accounts.map((row) => [row.id, accountLabel(row)]));

  const months: { key: string; label: string }[] = [];
  for (let key = monthKeyOf(range.start); key <= monthKeyOf(range.end); key = shiftMonthKey(key, 1)) {
    months.push({ key, label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(`${key}-01T12:00:00`)) });
  }
  const monthIndex = new Map(months.map((month, index) => [month.key, index]));

  const inAccount = (txn: HouseholdTransactionRow) => !input.accountId || txn.account_id === input.accountId;
  const eligible = input.transactions.filter((txn) => isSpendingTransaction(txn) && inAccount(txn));
  const current = eligible.filter((txn) => txn.transaction_date >= range.start && txn.transaction_date <= range.end);
  const previous = eligible.filter((txn) => txn.transaction_date >= range.previousStart && txn.transaction_date <= range.previousEnd);

  const previousByCategory = new Map<string, number>();
  for (const txn of previous) {
    const key = categoryKeyOf(txn);
    previousByCategory.set(key, (previousByCategory.get(key) ?? 0) + txn.amount_cents);
  }

  const buckets = new Map<
    string,
    { amountCents: number; transactionCount: number; monthly: number[]; merchants: Map<string, { labels: Map<string, number>; amountCents: number; transactionCount: number }> }
  >();
  for (const txn of current) {
    const key = categoryKeyOf(txn);
    const bucket = buckets.get(key) ?? { amountCents: 0, transactionCount: 0, monthly: months.map(() => 0), merchants: new Map() };
    bucket.amountCents += txn.amount_cents;
    bucket.transactionCount += 1;
    const index = monthIndex.get(monthKeyOf(txn.transaction_date));
    if (index !== undefined) bucket.monthly[index] += txn.amount_cents;

    const merchantKey = recurringStreamKey(txn) || "unknown";
    const merchant = bucket.merchants.get(merchantKey) ?? { labels: new Map(), amountCents: 0, transactionCount: 0 };
    merchant.amountCents += txn.amount_cents;
    merchant.transactionCount += 1;
    const display = txn.merchant_name?.trim() || txn.name;
    merchant.labels.set(display, (merchant.labels.get(display) ?? 0) + 1);
    bucket.merchants.set(merchantKey, merchant);
    buckets.set(key, bucket);
  }

  const totalCents = current.reduce((sum, txn) => sum + txn.amount_cents, 0);
  const positiveTotal = [...buckets.values()].reduce((sum, bucket) => sum + Math.max(0, bucket.amountCents), 0);

  const categories: SpendingCategory[] = [...buckets.entries()]
    .map(([key, bucket]) => ({
      key,
      label: categoryLabel(key),
      amountCents: bucket.amountCents,
      transactionCount: bucket.transactionCount,
      shareTenths: positiveTotal > 0 ? Math.round((Math.max(0, bucket.amountCents) / positiveTotal) * 1000) : 0,
      previousAmountCents: previous.length ? previousByCategory.get(key) ?? 0 : null,
      monthly: bucket.monthly,
      merchants: [...bucket.merchants.entries()]
        .map(([merchantKey, merchant]) => ({
          key: merchantKey,
          label: [...merchant.labels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? merchantKey,
          amountCents: merchant.amountCents,
          transactionCount: merchant.transactionCount,
        }))
        .sort((a, b) => b.amountCents - a.amountCents),
    }))
    .sort((a, b) => b.amountCents - a.amountCents);

  const transactions: SpendingTransaction[] = [...current]
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.id.localeCompare(a.id))
    .map((txn) => ({
      id: txn.id,
      date: txn.transaction_date,
      description: txn.merchant_name?.trim() || txn.name,
      categoryKey: categoryKeyOf(txn),
      accountLabel: (txn.account_id && labelsById.get(txn.account_id)) || "Unknown account",
      amountCents: txn.amount_cents,
    }));

  return {
    range,
    totalCents,
    previousTotalCents: previous.length ? previous.reduce((sum, txn) => sum + txn.amount_cents, 0) : null,
    transactionCount: current.length,
    months,
    categories,
    transactions,
  };
}

/** Top N categories plus an "Other" fold, for charts with a segment cap. */
export function foldCategories(categories: SpendingCategory[], limit: number): SpendingCategory[] {
  const positive = categories.filter((category) => category.amountCents > 0);
  if (positive.length <= limit) return positive;
  const shown = positive.slice(0, limit);
  const rest = positive.slice(limit);
  const monthly = rest[0]?.monthly.map((_, index) => rest.reduce((sum, category) => sum + category.monthly[index], 0)) ?? [];
  return [
    ...shown,
    {
      key: OTHER_CATEGORY_KEY,
      label: `Other (${rest.length})`,
      amountCents: rest.reduce((sum, category) => sum + category.amountCents, 0),
      transactionCount: rest.reduce((sum, category) => sum + category.transactionCount, 0),
      shareTenths: rest.reduce((sum, category) => sum + category.shareTenths, 0),
      previousAmountCents: rest.every((category) => category.previousAmountCents === null)
        ? null
        : rest.reduce((sum, category) => sum + (category.previousAmountCents ?? 0), 0),
      monthly,
      merchants: [],
    },
  ];
}

export function categoryKeyOf(txn: Pick<HouseholdTransactionRow, "plaid_category_primary">): string {
  return (txn.plaid_category_primary ?? "").toUpperCase() || "UNCATEGORIZED";
}

function daysInclusive(start: string, end: string): number {
  const toUtc = (date: string) => {
    const [year, month, day] = date.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(end) - toUtc(start)) / 86_400_000) + 1;
}
