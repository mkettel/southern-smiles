import type { BookkeepingAccount, FinancialRuleMatchType, FinancialTransaction } from "@/lib/financial-transactions";

export interface FinancialWorkspaceRule {
  id: string;
  normalizedVendor: string;
  matchType: FinancialRuleMatchType;
  bookkeepingAccountId: string;
  source: "quickbooks_history" | "review";
  sampleCount: number;
  confidence: number;
  updatedAt: string;
}

export interface FinancialWorkspaceMonth {
  key: string;
  label: string;
  longLabel: string;
  dateRange: string;
  revenueCents: number;
  expenseCents: number;
  recentActivity: FinancialWorkspaceActivity[];
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

export interface FinancialWorkspaceMonthFrame {
  key: string;
  start: string;
  end: string;
  shortLabel: string;
  longLabel: string;
  dateRange: string;
}

export function getFinancialWorkspaceMonthFrames(now: Date, count: number): FinancialWorkspaceMonthFrame[] {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "numeric",
  });
  const parts = formatter.formatToParts(now);
  const currentYear = Number(parts.find((part) => part.type === "year")?.value);
  const currentMonthIndex = Number(parts.find((part) => part.type === "month")?.value) - 1;
  return Array.from({ length: Math.max(1, count) }, (_, index) => {
    const date = new Date(Date.UTC(currentYear, currentMonthIndex - (Math.max(1, count) - 1 - index), 1));
    const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      key: `${year}-${String(month).padStart(2, "0")}`,
      start: `${year}-${String(month).padStart(2, "0")}-01`,
      end: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`,
      shortLabel: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date),
      longLabel: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(date),
      dateRange: `${new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(date)} 1–${days}, ${year}`,
    };
  });
}

export function financialWorkspaceMonthCount(firstTransactionDate: string | undefined, now: Date) {
  if (!firstTransactionDate) return 1;
  const current = getFinancialWorkspaceMonthFrames(now, 1)[0];
  const [currentYear, currentMonth] = current.key.split("-").map(Number);
  const [firstYear, firstMonth] = firstTransactionDate.slice(0, 7).split("-").map(Number);
  return Math.max(1, (currentYear - firstYear) * 12 + currentMonth - firstMonth + 1);
}
