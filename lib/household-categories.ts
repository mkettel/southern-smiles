import type { HouseholdTransactionRow } from "./household-finance";

// Category resolution for household views. A transaction assigned to a chart
// account (through the bookkeeping review flow) groups under that account;
// everything else groups under the bank's Plaid category, so a household
// that never categorizes by hand still gets a useful breakdown, and one that
// does sees its own names win.

export interface SpendingChartAccount {
  id: string;
  account_number: string | null;
  name: string;
}

export const UNCATEGORIZED_KEY = "UNCATEGORIZED";

const PLAID_CATEGORY_LABELS: Record<string, string> = {
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

/** Human label for a Plaid primary category key, with a title-case fallback. */
export function categoryLabel(key: string | null | undefined): string {
  const normalized = (key ?? "").trim().toUpperCase() || UNCATEGORIZED_KEY;
  if (PLAID_CATEGORY_LABELS[normalized]) return PLAID_CATEGORY_LABELS[normalized];
  return normalized
    .toLowerCase()
    .split("_")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export function withSpendingCategories(transactions: HouseholdTransactionRow[], accounts: SpendingChartAccount[]): HouseholdTransactionRow[] {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  return transactions.map((txn) => ({
    ...txn,
    bookkeeping_category_label: (txn.bookkeeping_account_id && byId.get(txn.bookkeeping_account_id)?.name) || null,
  }));
}

export function isAssignedTransaction(
  txn: Pick<HouseholdTransactionRow, "bookkeeping_account_id" | "bookkeeping_category_label">,
): boolean {
  return Boolean(txn.bookkeeping_account_id && txn.bookkeeping_category_label);
}

/** Chart account id when assigned, otherwise the Plaid primary category key. */
export function categoryKeyOf(
  txn: Pick<HouseholdTransactionRow, "bookkeeping_account_id" | "bookkeeping_category_label" | "plaid_category_primary">,
): string {
  if (isAssignedTransaction(txn)) return txn.bookkeeping_account_id!;
  return (txn.plaid_category_primary ?? "").trim().toUpperCase() || UNCATEGORIZED_KEY;
}

export function householdCategoryLabel(
  txn: Pick<HouseholdTransactionRow, "bookkeeping_account_id" | "bookkeeping_category_label" | "plaid_category_primary">,
): string {
  if (isAssignedTransaction(txn)) return txn.bookkeeping_category_label!;
  return categoryLabel(txn.plaid_category_primary);
}
