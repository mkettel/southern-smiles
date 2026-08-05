import type { BookkeepingAccount, FinancialTransaction } from "@/lib/financial-transactions";

export interface FinancialWorkspaceRule {
  id: string;
  normalizedVendor: string;
  bookkeepingAccountId: string;
  source: "quickbooks_history" | "review";
  sampleCount: number;
  confidence: number;
  updatedAt: string;
}

export interface FinancialWorkspaceMonth {
  key: string;
  label: string;
  revenueCents: number;
  expenseCents: number;
}

export interface FinancialWorkspaceActivity {
  id: string;
  date: string;
  description: string;
  category: string;
  account: string;
  amountCents: number;
  reviewStatus: FinancialTransaction["review_status"];
  categorySource: FinancialTransaction["category_source"];
}

export interface FinancialWorkspaceData {
  monthLabel: string;
  monthDateRange: string;
  revenueCents: number;
  expenseCents: number;
  netIncomeCents: number;
  pendingCount: number;
  unmatchedTransferCount: number;
  overdueBillCount: number;
  connectedInstitutionCount: number;
  includedBankAccountCount: number;
  lastSyncedAt: string | null;
  months: FinancialWorkspaceMonth[];
  recentActivity: FinancialWorkspaceActivity[];
  expenseBreakdown: Array<{ name: string; amountCents: number }>;
  accounts: BookkeepingAccount[];
  rules: FinancialWorkspaceRule[];
}
