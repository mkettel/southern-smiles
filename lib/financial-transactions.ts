import type { Transaction } from "plaid";

export const BOOKKEEPING_CATEGORIES = [
  { value: "advertising", label: "Advertising", kind: "expense" },
  { value: "bank-fees", label: "Bank & card fees", kind: "expense" },
  { value: "clinical-supplies", label: "Clinical supplies", kind: "expense" },
  { value: "office-supplies", label: "Office supplies", kind: "expense" },
  { value: "lab-fees", label: "Lab fees", kind: "expense" },
  { value: "rent", label: "Rent", kind: "expense" },
  { value: "utilities", label: "Utilities", kind: "expense" },
  { value: "payroll", label: "Payroll", kind: "expense" },
  { value: "insurance", label: "Insurance", kind: "expense" },
  { value: "software", label: "Software & subscriptions", kind: "expense" },
  { value: "repairs-maintenance", label: "Repairs & maintenance", kind: "expense" },
  { value: "professional-services", label: "Professional services", kind: "expense" },
  { value: "meals", label: "Meals", kind: "expense" },
  { value: "travel", label: "Travel", kind: "expense" },
  { value: "taxes", label: "Taxes", kind: "expense" },
  { value: "income", label: "Income", kind: "income" },
  { value: "refund", label: "Refund", kind: "income" },
  { value: "transfer", label: "Transfer", kind: "transfer" },
  { value: "credit-card-payment", label: "Credit card payment", kind: "transfer" },
  { value: "debt-payment", label: "Debt payment", kind: "transfer" },
  { value: "owner-contribution", label: "Owner contribution", kind: "equity" },
  { value: "owner-draw", label: "Owner draw", kind: "equity" },
  { value: "other-expense", label: "Other expense", kind: "expense" },
] as const;

export type BookkeepingCategory = (typeof BOOKKEEPING_CATEGORIES)[number]["value"];
export type FinancialTransactionReviewStatus = "pending" | "reviewed" | "excluded";

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
  bookkeeping_category: BookkeepingCategory | null;
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
  mask: string | null;
  institutionName: string;
}

export interface FinancialTransactionDashboardData {
  transactions: FinancialTransaction[];
  accounts: FinancialTransactionAccountSummary[];
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

export function isBookkeepingCategory(value: string): value is BookkeepingCategory {
  return BOOKKEEPING_CATEGORIES.some((category) => category.value === value);
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

export function suggestBookkeepingCategory(
  transaction: Pick<
    FinancialTransaction,
    "amount_cents" | "plaid_category_primary" | "plaid_category_detailed"
  >,
): BookkeepingCategory | null {
  const primary = transaction.plaid_category_primary ?? "";
  const detailed = transaction.plaid_category_detailed ?? "";

  if (detailed.includes("CREDIT_CARD_PAYMENT")) return "credit-card-payment";
  if (primary.includes("TRANSFER")) return "transfer";
  if (primary.includes("INCOME") || transaction.amount_cents < 0) return "income";
  if (primary.includes("LOAN_PAYMENTS")) return "debt-payment";
  if (primary.includes("BANK_FEES")) return "bank-fees";
  if (primary.includes("FOOD_AND_DRINK")) return "meals";
  if (primary.includes("TRAVEL")) return "travel";
  if (primary.includes("RENT_AND_UTILITIES")) {
    return detailed.includes("RENT") ? "rent" : "utilities";
  }
  if (detailed.includes("INSURANCE")) return "insurance";
  if (detailed.includes("TAX")) return "taxes";
  if (detailed.includes("OFFICE_SUPPLIES")) return "office-supplies";
  if (detailed.includes("ADVERTISING")) return "advertising";
  if (detailed.includes("ACCOUNTING") || detailed.includes("LEGAL")) {
    return "professional-services";
  }
  return null;
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
