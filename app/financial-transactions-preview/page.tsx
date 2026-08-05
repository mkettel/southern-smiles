import { notFound } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { FinancialTransactionsDashboard } from "@/components/financial-transactions/financial-transactions-dashboard";
import type {
  FinancialTransaction,
  FinancialTransactionDashboardData,
} from "@/lib/financial-transactions";

const baseTransaction: Omit<FinancialTransaction, "id" | "provider_transaction_id"> = {
  practice_id: "00000000-0000-4000-8000-000000000001",
  connection_id: "00000000-0000-4000-8000-000000000010",
  account_id: "00000000-0000-4000-8000-000000000020",
  provider_account_id: "sample-account",
  pending_transaction_id: null,
  transaction_date: "2026-08-04",
  authorized_date: "2026-08-04",
  transaction_datetime: null,
  authorized_datetime: null,
  name: "Sample transaction",
  merchant_name: null,
  original_description: null,
  amount_cents: 0,
  currency_code: "USD",
  pending: false,
  payment_channel: "online",
  website: null,
  logo_url: null,
  merchant_entity_id: null,
  counterparty_name: null,
  plaid_category_primary: null,
  plaid_category_detailed: null,
  plaid_category_confidence: "VERY_HIGH",
  bookkeeping_category: null,
  bookkeeping_account_id: null,
  category_source: null,
  review_status: "pending",
  review_note: null,
  reviewed_by: null,
  reviewed_at: null,
  is_removed: false,
  removed_at: null,
  created_at: "2026-08-04T12:00:00.000Z",
  updated_at: "2026-08-04T12:00:00.000Z",
};

const transactions: FinancialTransaction[] = [
  {
    ...baseTransaction,
    id: "00000000-0000-4000-8000-000000000101",
    provider_transaction_id: "sample-101",
    merchant_name: "Net32 Dental Supplies",
    name: "NET32 DENTAL SUPPLIES",
    original_description: "NET32 ORDER 65047872",
    amount_cents: 68432,
    plaid_category_primary: "GENERAL_MERCHANDISE",
    plaid_category_detailed: "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE",
  },
  {
    ...baseTransaction,
    id: "00000000-0000-4000-8000-000000000102",
    provider_transaction_id: "sample-102",
    transaction_date: "2026-08-03",
    merchant_name: "Google Ads",
    name: "GOOGLE ADS SOUTHERN SMILES",
    amount_cents: 125000,
    plaid_category_primary: "GENERAL_SERVICES",
    plaid_category_detailed: "GENERAL_SERVICES_ADVERTISING",
  },
  {
    ...baseTransaction,
    id: "00000000-0000-4000-8000-000000000103",
    provider_transaction_id: "sample-103",
    transaction_date: "2026-08-02",
    account_id: "00000000-0000-4000-8000-000000000021",
    provider_account_id: "sample-checking",
    merchant_name: "QuickBooks Payroll",
    name: "INTUIT PAYROLL",
    amount_cents: 817200,
    plaid_category_primary: "TRANSFER_OUT",
    plaid_category_detailed: "TRANSFER_OUT_PAYROLL",
  },
  {
    ...baseTransaction,
    id: "00000000-0000-4000-8000-000000000104",
    provider_transaction_id: "sample-104",
    transaction_date: "2026-08-01",
    account_id: "00000000-0000-4000-8000-000000000021",
    provider_account_id: "sample-checking",
    merchant_name: "Dentrix Payments",
    name: "DENTRIX MERCHANT DEPOSIT",
    amount_cents: -1438200,
    plaid_category_primary: "INCOME",
    plaid_category_detailed: "INCOME_OTHER_INCOME",
  },
  {
    ...baseTransaction,
    id: "00000000-0000-4000-8000-000000000105",
    provider_transaction_id: "sample-105",
    transaction_date: "2026-07-31",
    merchant_name: "Capital One",
    name: "CAPITAL ONE MOBILE PAYMENT",
    amount_cents: 250000,
    plaid_category_primary: "TRANSFER_OUT",
    plaid_category_detailed: "TRANSFER_OUT_CREDIT_CARD_PAYMENT",
  },
];

const previewData: FinancialTransactionDashboardData = {
  transactions,
  accounts: [
    {
      id: "00000000-0000-4000-8000-000000000020",
      connectionId: "00000000-0000-4000-8000-000000000010",
      name: "Business Card",
      nickname: "Practice Card",
      mask: "7672",
      institutionName: "Capital One",
    },
    {
      id: "00000000-0000-4000-8000-000000000021",
      connectionId: "00000000-0000-4000-8000-000000000011",
      name: "Business Checking",
      nickname: "Operating Checking",
      mask: "9777",
      institutionName: "BMO",
    },
  ],
  bookkeepingAccounts: [
    {
      id: "00000000-0000-4000-8000-000000000201",
      accountNumber: "5005",
      name: "Dental Supplies",
      accountType: "Expenses",
      detailType: "Supplies & materials",
      externalSource: "quickbooks",
    },
    {
      id: "00000000-0000-4000-8000-000000000202",
      accountNumber: "5015",
      name: "Implant/Grafts Supplies",
      accountType: "Expenses",
      detailType: "Supplies & materials",
      externalSource: "quickbooks",
    },
    {
      id: "00000000-0000-4000-8000-000000000203",
      accountNumber: "6300",
      name: "Marketing Expenses",
      accountType: "Expenses",
      detailType: "Advertising",
      externalSource: "quickbooks",
    },
    {
      id: "00000000-0000-4000-8000-000000000204",
      accountNumber: "6415",
      name: "Computer and Software Expenses",
      accountType: "Expenses",
      detailType: "Software",
      externalSource: "quickbooks",
    },
    {
      id: "00000000-0000-4000-8000-000000000205",
      accountNumber: null,
      name: "Fee for Service Income",
      accountType: "Income",
      detailType: "Service income",
      externalSource: "quickbooks",
    },
  ],
  suggestedBookkeepingAccountByTransaction: {
    "00000000-0000-4000-8000-000000000101":
      "00000000-0000-4000-8000-000000000201",
    "00000000-0000-4000-8000-000000000102":
      "00000000-0000-4000-8000-000000000203",
    "00000000-0000-4000-8000-000000000104":
      "00000000-0000-4000-8000-000000000205",
  },
  pendingCount: 5,
  reviewedCount: 0,
  currentMonthOutflowCents: 1006532,
  currentMonthInflowCents: 1438200,
  lastSyncedAt: "2026-08-04T18:42:00.000Z",
  connectionCount: 2,
  connectionsNeedingConsent: 0,
};

export default function FinancialTransactionsPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar role="admin" practiceName="Southern Smiles" />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 sm:px-6">
          <p className="text-sm text-muted-foreground">Southern Smiles</p>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
              Sample data
            </span>
            <span className="hidden text-muted-foreground sm:inline">Dr. Monzer Shakally</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              MS
            </span>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1500px] space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Bookkeeping</h1>
              <p className="text-sm text-muted-foreground">
                Reconcile each connected account and review imported activity before it becomes trusted bookkeeping data.
              </p>
            </div>
            <FinancialTransactionsDashboard initialData={previewData} previewMode />
          </div>
        </main>
      </div>
    </div>
  );
}
