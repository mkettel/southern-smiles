import type { Transaction } from "plaid";

export type FinancialTransactionReviewStatus = "pending" | "reviewed" | "excluded";
export type FinancialRuleMatchType = "exact" | "contains";

export interface BookkeepingAccount {
  id: string;
  accountNumber: string | null;
  name: string;
  accountType: string;
  detailType: string | null;
  externalSource: "quickbooks" | "manual";
}

export interface FinancialTransaction {
  id: string;
  practice_id: string;
  connection_id: string;
  account_id: string | null;
  provider_account_id: string;
  provider_transaction_id: string;
  pending_transaction_id: string | null;
  transaction_date: string;
  authorized_date: string | null;
  transaction_datetime: string | null;
  authorized_datetime: string | null;
  name: string;
  merchant_name: string | null;
  original_description: string | null;
  amount_cents: number;
  currency_code: string;
  pending: boolean;
  payment_channel: string | null;
  website: string | null;
  logo_url: string | null;
  merchant_entity_id: string | null;
  counterparty_name: string | null;
  plaid_category_primary: string | null;
  plaid_category_detailed: string | null;
  plaid_category_confidence: string | null;
  bookkeeping_category: string | null;
  bookkeeping_account_id: string | null;
  category_source: "vendor_rule" | "manual" | null;
  review_status: FinancialTransactionReviewStatus;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  is_removed: boolean;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialTransactionAccountSummary {
  id: string;
  connectionId: string;
  name: string;
  nickname: string | null;
  mask: string | null;
  institutionName: string;
}

export interface FinancialTransactionDashboardData {
  transactions: FinancialTransaction[];
  accounts: FinancialTransactionAccountSummary[];
  bookkeepingAccounts: BookkeepingAccount[];
  suggestedBookkeepingAccountByTransaction: Record<string, string>;
  pendingCount: number;
  reviewedCount: number;
  currentMonthOutflowCents: number;
  currentMonthInflowCents: number;
  lastSyncedAt: string | null;
  connectionCount: number;
  connectionsNeedingConsent: number;
}

export interface FinancialTransactionUpsert {
  practice_id: string;
  connection_id: string;
  account_id: string | null;
  provider_account_id: string;
  provider_transaction_id: string;
  pending_transaction_id: string | null;
  transaction_date: string;
  authorized_date: string | null;
  transaction_datetime: string | null;
  authorized_datetime: string | null;
  name: string;
  merchant_name: string | null;
  original_description: string | null;
  amount_cents: number;
  currency_code: string;
  pending: boolean;
  payment_channel: string | null;
  website: string | null;
  logo_url: string | null;
  merchant_entity_id: string | null;
  counterparty_name: string | null;
  plaid_category_primary: string | null;
  plaid_category_detailed: string | null;
  plaid_category_confidence: string | null;
  is_removed: false;
  removed_at: null;
  updated_at: string;
}

export function mapPlaidTransaction({
  transaction,
  practiceId,
  connectionId,
  accountId,
  syncedAt,
}: {
  transaction: Transaction;
  practiceId: string;
  connectionId: string;
  accountId: string | null;
  syncedAt: string;
}): FinancialTransactionUpsert {
  const category =
    transaction.business_finance_category ?? transaction.personal_finance_category;
  const counterparty = transaction.counterparties?.[0];

  return {
    practice_id: practiceId,
    connection_id: connectionId,
    account_id: accountId,
    provider_account_id: transaction.account_id,
    provider_transaction_id: transaction.transaction_id,
    pending_transaction_id: transaction.pending_transaction_id,
    transaction_date: transaction.date,
    authorized_date: transaction.authorized_date,
    transaction_datetime: transaction.datetime,
    authorized_datetime: transaction.authorized_datetime,
    name: transaction.name.trim() || "Unlabeled transaction",
    merchant_name: transaction.merchant_name?.trim() || null,
    original_description: transaction.original_description?.trim() || null,
    amount_cents: Math.round(transaction.amount * 100),
    currency_code:
      transaction.iso_currency_code ?? transaction.unofficial_currency_code ?? "USD",
    pending: transaction.pending,
    payment_channel: transaction.payment_channel ?? null,
    website: transaction.website ?? counterparty?.website ?? null,
    logo_url: transaction.logo_url ?? counterparty?.logo_url ?? null,
    merchant_entity_id: transaction.merchant_entity_id ?? null,
    counterparty_name: counterparty?.name?.trim() || null,
    plaid_category_primary: category?.primary ?? null,
    plaid_category_detailed: category?.detailed ?? null,
    plaid_category_confidence: category?.confidence_level ?? null,
    is_removed: false,
    removed_at: null,
    updated_at: syncedAt,
  };
}

export function transactionDisplayName(
  transaction: Pick<FinancialTransaction, "merchant_name" | "counterparty_name" | "name">,
) {
  return transaction.merchant_name ?? transaction.counterparty_name ?? transaction.name;
}

export function normalizeVendorName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 300);
}

export function findMatchingBookkeepingAccountId(
  normalizedVendor: string,
  rules: Array<{
    normalizedVendor: string;
    bookkeepingAccountId: string;
    matchType: FinancialRuleMatchType;
  }>,
) {
  const exact = rules.find(
    (rule) => rule.matchType === "exact" && rule.normalizedVendor === normalizedVendor,
  );
  if (exact) return exact.bookkeepingAccountId;

  return rules
    .filter(
      (rule) =>
        rule.matchType === "contains" && normalizedVendor.includes(rule.normalizedVendor),
    )
    .sort((left, right) => right.normalizedVendor.length - left.normalizedVendor.length)[0]
    ?.bookkeepingAccountId;
}

export function calculateTransactionTotals(
  transactions: Pick<FinancialTransaction, "amount_cents" | "is_removed" | "pending">[],
) {
  return transactions.reduce(
    (totals, transaction) => {
      if (transaction.is_removed || transaction.pending) return totals;
      if (transaction.amount_cents >= 0) totals.outflowCents += transaction.amount_cents;
      else totals.inflowCents += Math.abs(transaction.amount_cents);
      return totals;
    },
    { outflowCents: 0, inflowCents: 0 },
  );
}
