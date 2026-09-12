"use server";

import { requireMemberModuleAccess } from "@/actions/member-module-access";
import {
  HOUSEHOLD_MONTH_COUNT,
  buildHouseholdFinanceData,
  shiftMonthKey,
  type HouseholdFinanceData,
} from "@/lib/household-finance";
import {
  MissingFinancialTablesError,
  getHouseholdAccounts,
  getHouseholdSnapshots,
  getHouseholdTransactions,
  toPhoenixDate,
} from "@/lib/household-finance-queries";

/**
 * Personal-finance overview for household workspaces. Reads every active
 * connected account (not just the bookkeeping allowlist) and the trailing
 * twelve months of transactions. Returns null when the financial migrations
 * have not been applied yet.
 */
export async function getHouseholdFinanceData(): Promise<HouseholdFinanceData | null> {
  const { supabase, practiceId } = await requireMemberModuleAccess("financial");
  const today = toPhoenixDate(new Date());
  const startDate = `${shiftMonthKey(today.slice(0, 7), -(HOUSEHOLD_MONTH_COUNT - 1))}-01`;

  let accounts;
  let connections;
  try {
    ({ accounts, connections } = await getHouseholdAccounts(supabase, practiceId));
  } catch (error) {
    if (error instanceof MissingFinancialTablesError) return null;
    throw error;
  }

  const [transactions, snapshots] = await Promise.all([
    getHouseholdTransactions(supabase, practiceId, startDate),
    getHouseholdSnapshots(supabase, practiceId, startDate),
  ]);

  const lastSyncedAt =
    connections
      .flatMap((connection) => [connection.transactions_last_synced_at, connection.last_synced_at])
      .filter((value): value is string => typeof value === "string")
      .sort()
      .at(-1) ?? null;

  return buildHouseholdFinanceData({
    accounts,
    transactions,
    snapshots,
    today,
    connectionCount: connections.filter((connection) => connection.status !== "disconnected").length,
    lastSyncedAt,
  });
}
