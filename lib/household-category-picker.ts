import type { BookkeepingAccount, FinancialTransaction } from "./financial-transactions";

export function householdCategoryName(account: BookkeepingAccount) {
  return account.name.replace(/^\d{3,}\s+/, "");
}

export function householdCategoryOptions(accounts: BookkeepingAccount[], transactions: FinancialTransaction[], selected: string, showAll: boolean, search: string) {
  const counts = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.review_status !== "reviewed" || transaction.pending || transaction.is_removed || !transaction.bookkeeping_account_id) continue;
    counts.set(transaction.bookkeeping_account_id, (counts.get(transaction.bookkeeping_account_id) ?? 0) + 1);
  }
  const sorted = [...accounts].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || householdCategoryName(a).localeCompare(householdCategoryName(b)));
  const query = search.trim().toLowerCase();
  const frequent = sorted.filter(a => counts.has(a.id)).slice(0, 12);
  const visible = showAll || query || !frequent.length ? sorted : sorted.filter(a => frequent.includes(a) || a.id === selected);
  return visible.filter(a => a.id === selected || householdCategoryName(a).toLowerCase().includes(query));
}
