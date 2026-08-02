import type { Stat } from "@/lib/types";

export const TOTAL_CREDIT_CARD_DEBT_STAT_NAME = "Total Credit Card Debt";

export type FinancialConnectionStatus =
  | "active"
  | "reconnect_required"
  | "error"
  | "disconnected";

export interface FinancialConnection {
  id: string;
  practice_id: string;
  provider: "plaid";
  provider_item_id: string;
  institution_id: string | null;
  institution_name: string | null;
  status: FinancialConnectionStatus;
  consent_expiration_time: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialAccount {
  id: string;
  practice_id: string;
  connection_id: string;
  provider_account_id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  account_type: string;
  account_subtype: string | null;
  currency_code: string;
  current_balance_cents: number | null;
  available_balance_cents: number | null;
  credit_limit_cents: number | null;
  minimum_payment_cents: number | null;
  next_payment_due_date: string | null;
  included_in_total: boolean;
  is_active: boolean;
  balance_updated_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialConnectionWithAccounts extends FinancialConnection {
  accounts: FinancialAccount[];
}

export interface FinancialConnectionsDashboardData {
  configured: boolean;
  environment: "sandbox" | "production";
  connections: FinancialConnectionWithAccounts[];
  totalDebtCents: number;
  includedAccountCount: number;
  lastSyncedAt: string | null;
}

export function dollarsToCents(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function calculateTotalCreditCardDebtCents(
  accounts: Pick<FinancialAccount, "current_balance_cents" | "included_in_total" | "is_active">[],
): number {
  return accounts.reduce((sum, account) => {
    if (!account.is_active || !account.included_in_total) return sum;
    return sum + Math.max(0, account.current_balance_cents ?? 0);
  }, 0);
}

export function isTotalCreditCardDebtStat(
  stat: Pick<Stat, "name" | "stat_type">,
): boolean {
  return (
    stat.stat_type === "dollar" &&
    stat.name.trim().toLowerCase() === TOTAL_CREDIT_CARD_DEBT_STAT_NAME.toLowerCase()
  );
}

