import type { HouseholdTransactionRow } from "./household-finance";

export interface SpendingChartAccount {
  id: string;
  account_number: string | null;
  name: string;
}

export function withSpendingCategories(transactions: HouseholdTransactionRow[], accounts: SpendingChartAccount[]): HouseholdTransactionRow[] {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  return transactions.map((txn) => ({
    ...txn,
    bookkeeping_category_label: (txn.bookkeeping_account_id && byId.get(txn.bookkeeping_account_id)?.name) || null,
  }));
}

export function categoryKeyOf(txn: Pick<HouseholdTransactionRow, "bookkeeping_account_id" | "bookkeeping_category_label">): string {
  return txn.bookkeeping_account_id && txn.bookkeeping_category_label ? txn.bookkeeping_account_id : "UNCATEGORIZED";
}

export function householdCategoryLabel(txn: HouseholdTransactionRow): string {
  return categoryKeyOf(txn) === "UNCATEGORIZED" ? "Uncategorized" : txn.bookkeeping_category_label!;
}
