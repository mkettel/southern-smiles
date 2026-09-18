// Pure aggregation for the household (personal finance) overview.
// No DB calls here so it can run against fixtures in tests and previews.
import { categoryKeyOf, householdCategoryLabel } from "@/lib/household-categories";
import { CASH_ACCOUNT_ID } from "@/lib/household-cash";

export type HouseholdAccountKind = "checking" | "savings" | "credit" | "other";

export interface HouseholdAccountRow {
  id: string;
  name: string;
  nickname: string | null;
  mask: string | null;
  account_type: string;
  account_subtype: string | null;
  current_balance_cents: number | null;
  available_balance_cents: number | null;
  credit_limit_cents: number | null;
  minimum_payment_cents: number | null;
  next_payment_due_date: string | null;
  last_synced_at: string | null;
  institution_name: string | null;
}

export interface HouseholdTransactionRow {
  id: string;
  account_id: string | null;
  transaction_date: string;
  name: string;
  merchant_name: string | null;
  amount_cents: number;
  pending: boolean;
  plaid_category_primary: string | null;
  plaid_category_detailed?: string | null;
  bookkeeping_account_id?: string | null;
  bookkeeping_category_label?: string | null;
}

export interface HouseholdSnapshotRow {
  account_id: string;
  snapshot_date: string;
  balance_cents: number;
}

export interface HouseholdAccount {
  id: string;
  label: string;
  institution: string | null;
  mask: string | null;
  kind: HouseholdAccountKind;
  balanceCents: number;
  availableCents: number | null;
  limitCents: number | null;
  /** Credit utilization in tenths of a percent (0-1000+), null when no limit. */
  utilizationTenths: number | null;
  minimumPaymentCents: number | null;
  nextPaymentDueDate: string | null;
  /** Spending charged to this account in the current calendar month. */
  monthSpendCents: number;
  lastSyncedAt: string | null;
}

export interface HouseholdCategoryTotal {
  key: string;
  label: string;
  amountCents: number;
  transactionCount: number;
  /** Share of the month's spending in tenths of a percent. */
  shareTenths: number;
}

export interface HouseholdAccountSpend {
  accountId: string;
  label: string;
  kind: HouseholdAccountKind;
  amountCents: number;
}

export interface HouseholdMonth {
  key: string;
  label: string;
  longLabel: string;
  incomeCents: number;
  spendingCents: number;
  netCents: number;
  transactionCount: number;
  categories: HouseholdCategoryTotal[];
  spendingByAccount: HouseholdAccountSpend[];
}

export interface HouseholdBalancePoint {
  date: string;
  cashCents: number;
  creditCents: number;
  netCents: number;
}

export interface HouseholdTransaction {
  id: string;
  date: string;
  description: string;
  categoryKey: string;
  categoryLabel: string;
  accountLabel: string;
  accountKind: HouseholdAccountKind;
  amountCents: number;
  pending: boolean;
  isTransfer: boolean;
}

export interface HouseholdFinanceData {
  today: string;
  lastSyncedAt: string | null;
  connectionCount: number;
  pendingCount: number;
  totals: {
    cashCents: number;
    checkingCents: number;
    savingsCents: number;
    creditCents: number;
    creditLimitCents: number;
    netCents: number;
  };
  accounts: HouseholdAccount[];
  /** Oldest to newest, always `monthCount` entries ending with the current month. */
  months: HouseholdMonth[];
  balanceHistory: HouseholdBalancePoint[];
  recentTransactions: HouseholdTransaction[];
}

export const HOUSEHOLD_MONTH_COUNT = 12;
export const HOUSEHOLD_RECENT_LIMIT = 20;
export const HOUSEHOLD_CATEGORY_LIMIT = 8;

const CATEGORY_LABELS: Record<string, string> = {
  INCOME: "Income",
  TRANSFER_IN: "Transfers in",
  TRANSFER_OUT: "Transfers out",
  LOAN_PAYMENTS: "Loan payments",
  LOAN_DISBURSEMENTS: "Loan disbursements",
  BANK_FEES: "Bank fees",
  ENTERTAINMENT: "Entertainment",
  FOOD_AND_DRINK: "Food & drink",
  GENERAL_MERCHANDISE: "Shopping",
  HOME_IMPROVEMENT: "Home improvement",
  MEDICAL: "Medical",
  PERSONAL_CARE: "Personal care",
  GENERAL_SERVICES: "Services",
  GOVERNMENT_AND_NON_PROFIT: "Government & non-profit",
  TRANSPORTATION: "Transportation",
  TRAVEL: "Travel",
  RENT_AND_UTILITIES: "Rent & utilities",
  OTHER: "Other",
  UNCATEGORIZED: "Uncategorized",
};

// Money moving between the household's own accounts, or borrowed money
// arriving, is not income or spending. Credit card payments live under
// TRANSFER_OUT, so excluding transfers also avoids counting card purchases
// twice (once on the card, once when the card is paid from checking).
const FLOW_EXCLUDED_CATEGORIES = new Set([
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "LOAN_DISBURSEMENTS",
]);

export function categoryLabel(key: string | null | undefined): string {
  const normalized = (key ?? "").trim().toUpperCase() || "UNCATEGORIZED";
  if (CATEGORY_LABELS[normalized]) return CATEGORY_LABELS[normalized];
  return normalized
    .toLowerCase()
    .split("_")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export function isTransferCategory(key: string | null | undefined): boolean {
  return FLOW_EXCLUDED_CATEGORIES.has((key ?? "").toUpperCase());
}

// Some banks report a credit card payment as a loan payment rather than a
// transfer. It is still money moving between the household's own accounts,
// and the purchases it covers are already counted on the card.
const TRANSFER_DETAILED_CATEGORIES = new Set(["LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"]);

export function isTransferTransaction(
  txn: Pick<HouseholdTransactionRow, "plaid_category_primary" | "plaid_category_detailed">,
): boolean {
  if (isTransferCategory(txn.plaid_category_primary)) return true;
  return TRANSFER_DETAILED_CATEGORIES.has((txn.plaid_category_detailed ?? "").toUpperCase());
}

export function accountKind(row: Pick<HouseholdAccountRow, "account_type" | "account_subtype">): HouseholdAccountKind {
  const type = row.account_type.toLowerCase();
  const subtype = (row.account_subtype ?? "").toLowerCase();
  if (type === "credit") return "credit";
  if (type === "depository") {
    if (subtype.includes("saving") || subtype.includes("money market") || subtype === "cd") return "savings";
    return "checking";
  }
  return "other";
}

export function accountLabel(row: Pick<HouseholdAccountRow, "name" | "nickname">): string {
  return row.nickname?.trim() || row.name;
}

export function monthKeyOf(date: string): string {
  return date.slice(0, 7);
}

export function shiftMonthKey(key: string, delta: number): string {
  const [year, month] = key.split("-").map(Number);
  const index = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

function monthLabels(key: string): { label: string; longLabel: string } {
  const date = new Date(`${key}-01T12:00:00`);
  return {
    label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date),
    longLabel: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date),
  };
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function formatCentsCompact(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(cents / 100);
}

export function buildHouseholdFinanceData(input: {
  accounts: HouseholdAccountRow[];
  transactions: HouseholdTransactionRow[];
  snapshots: HouseholdSnapshotRow[];
  today: string;
  connectionCount: number;
  lastSyncedAt: string | null;
  monthCount?: number;
}): HouseholdFinanceData {
  const monthCount = input.monthCount ?? HOUSEHOLD_MONTH_COUNT;
  const currentMonthKey = monthKeyOf(input.today);
  const firstMonthKey = shiftMonthKey(currentMonthKey, -(monthCount - 1));

  const accountsById = new Map(input.accounts.map((row) => [row.id, row]));
  const kindById = new Map(input.accounts.map((row) => [row.id, accountKind(row)]));

  const monthSpendByAccount = new Map<string, number>();
  const monthBuckets = new Map<
    string,
    {
      incomeCents: number;
      spendingCents: number;
      transactionCount: number;
      categories: Map<string, { amountCents: number; transactionCount: number }>;
      byAccount: Map<string, number>;
    }
  >();
  for (let index = 0; index < monthCount; index += 1) {
    monthBuckets.set(shiftMonthKey(firstMonthKey, index), {
      incomeCents: 0,
      spendingCents: 0,
      transactionCount: 0,
      categories: new Map(),
      byAccount: new Map(),
    });
  }

  let pendingCount = 0;
  const categoryLabels = new Map(input.transactions.map((txn) => [categoryKeyOf(txn), householdCategoryLabel(txn)]));
  const sortedTransactions = [...input.transactions].sort((a, b) =>
    b.transaction_date.localeCompare(a.transaction_date) || b.id.localeCompare(a.id),
  );

  for (const txn of sortedTransactions) {
    if (txn.pending) {
      pendingCount += 1;
      continue;
    }
    const category = (txn.plaid_category_primary ?? "").toUpperCase();
    if (isTransferTransaction(txn)) continue;

    const bucket = monthBuckets.get(monthKeyOf(txn.transaction_date));
    if (!bucket) continue;
    bucket.transactionCount += 1;

    if (category === "INCOME") {
      if (txn.amount_cents < 0) bucket.incomeCents += -txn.amount_cents;
      continue;
    }

    // Spending, net of refunds in the same category.
    bucket.spendingCents += txn.amount_cents;
    const key = categoryKeyOf(txn);
    const entry = bucket.categories.get(key) ?? { amountCents: 0, transactionCount: 0 };
    entry.amountCents += txn.amount_cents;
    entry.transactionCount += 1;
    bucket.categories.set(key, entry);

    if (txn.account_id) {
      bucket.byAccount.set(txn.account_id, (bucket.byAccount.get(txn.account_id) ?? 0) + txn.amount_cents);
      if (monthKeyOf(txn.transaction_date) === currentMonthKey && txn.amount_cents > 0) {
        monthSpendByAccount.set(txn.account_id, (monthSpendByAccount.get(txn.account_id) ?? 0) + txn.amount_cents);
      }
    }
  }

  const months: HouseholdMonth[] = [...monthBuckets.entries()].map(([key, bucket]) => {
    const labels = monthLabels(key);
    const positiveTotal = [...bucket.categories.values()].reduce(
      (sum, entry) => sum + Math.max(0, entry.amountCents),
      0,
    );
    const categories = [...bucket.categories.entries()]
      .map(([categoryKey, entry]) => ({
        key: categoryKey,
        label: categoryLabels.get(categoryKey) ?? "Uncategorized",
        amountCents: entry.amountCents,
        transactionCount: entry.transactionCount,
        shareTenths: positiveTotal > 0 ? Math.round((Math.max(0, entry.amountCents) / positiveTotal) * 1000) : 0,
      }))
      .sort((a, b) => b.amountCents - a.amountCents);

    const spendingByAccount = [...bucket.byAccount.entries()]
      .map(([accountId, amountCents]) => {
        const row = accountsById.get(accountId);
        return {
          accountId,
          label: accountId === CASH_ACCOUNT_ID ? "Manual · Cash" : row ? accountLabel(row) : "Unknown account",
          kind: kindById.get(accountId) ?? "other",
          amountCents,
        };
      })
      .sort((a, b) => b.amountCents - a.amountCents);

    return {
      key,
      label: labels.label,
      longLabel: labels.longLabel,
      incomeCents: bucket.incomeCents,
      spendingCents: bucket.spendingCents,
      netCents: bucket.incomeCents - bucket.spendingCents,
      transactionCount: bucket.transactionCount,
      categories,
      spendingByAccount,
    };
  });

  const accounts: HouseholdAccount[] = input.accounts
    .map((row) => {
      const kind = accountKind(row);
      const balanceCents = row.current_balance_cents ?? 0;
      const limitCents = row.credit_limit_cents;
      return {
        id: row.id,
        label: accountLabel(row),
        institution: row.institution_name,
        mask: row.mask,
        kind,
        balanceCents,
        availableCents: row.available_balance_cents,
        limitCents,
        utilizationTenths:
          kind === "credit" && limitCents && limitCents > 0
            ? Math.round((Math.max(0, balanceCents) / limitCents) * 1000)
            : null,
        minimumPaymentCents: row.minimum_payment_cents,
        nextPaymentDueDate: row.next_payment_due_date,
        monthSpendCents: monthSpendByAccount.get(row.id) ?? 0,
        lastSyncedAt: row.last_synced_at,
      };
    })
    .sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind) || b.balanceCents - a.balanceCents);

  const checkingCents = sumBalances(accounts, "checking");
  const savingsCents = sumBalances(accounts, "savings");
  const creditCents = sumBalances(accounts, "credit");
  const creditLimitCents = accounts
    .filter((account) => account.kind === "credit")
    .reduce((sum, account) => sum + (account.limitCents ?? 0), 0);
  const cashCents = checkingCents + savingsCents;

  const balanceHistory = buildBalanceHistory(input.snapshots, kindById, input.today, {
    cashCents,
    creditCents,
  });

  const recentTransactions: HouseholdTransaction[] = sortedTransactions
    .slice(0, HOUSEHOLD_RECENT_LIMIT)
    .map((txn) => {
      const row = txn.account_id ? accountsById.get(txn.account_id) : undefined;
      const key = categoryKeyOf(txn);
      return {
        id: txn.id,
        date: txn.transaction_date,
        description: txn.merchant_name?.trim() || txn.name,
        categoryKey: key,
        categoryLabel: householdCategoryLabel(txn),
        accountLabel: txn.account_id === CASH_ACCOUNT_ID ? "Manual · Cash" : row ? accountLabel(row) : "Unknown account",
        accountKind: (txn.account_id && kindById.get(txn.account_id)) || "other",
        amountCents: txn.amount_cents,
        pending: txn.pending,
        isTransfer: isTransferTransaction(txn),
      };
    });

  return {
    today: input.today,
    lastSyncedAt: input.lastSyncedAt,
    connectionCount: input.connectionCount,
    pendingCount,
    totals: {
      cashCents,
      checkingCents,
      savingsCents,
      creditCents,
      creditLimitCents,
      netCents: cashCents - creditCents,
    },
    accounts,
    months,
    balanceHistory,
    recentTransactions,
  };
}

function kindOrder(kind: HouseholdAccountKind): number {
  return { checking: 0, savings: 1, credit: 2, other: 3 }[kind];
}

function sumBalances(accounts: HouseholdAccount[], kind: HouseholdAccountKind): number {
  return accounts
    .filter((account) => account.kind === kind)
    .reduce((sum, account) => sum + account.balanceCents, 0);
}

function buildBalanceHistory(
  snapshots: HouseholdSnapshotRow[],
  kindById: Map<string, HouseholdAccountKind>,
  today: string,
  current: { cashCents: number; creditCents: number },
): HouseholdBalancePoint[] {
  const byDate = new Map<string, { cashCents: number; creditCents: number }>();
  for (const snapshot of snapshots) {
    const kind = kindById.get(snapshot.account_id);
    if (!kind) continue;
    const point = byDate.get(snapshot.snapshot_date) ?? { cashCents: 0, creditCents: 0 };
    if (kind === "credit") point.creditCents += snapshot.balance_cents;
    else if (kind === "checking" || kind === "savings") point.cashCents += snapshot.balance_cents;
    byDate.set(snapshot.snapshot_date, point);
  }
  if (!byDate.has(today)) {
    byDate.set(today, { cashCents: current.cashCents, creditCents: current.creditCents });
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, point]) => ({
      date,
      cashCents: point.cashCents,
      creditCents: point.creditCents,
      netCents: point.cashCents - point.creditCents,
    }));
}
