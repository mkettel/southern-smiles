"use server";

import { requireMemberModuleAccess } from "@/actions/member-module-access";
import { shiftMonthKey, type HouseholdAccountRow, type HouseholdTransactionRow } from "@/lib/household-finance";
import {
  MissingFinancialTablesError,
  getHouseholdAccounts,
  getHouseholdTransactions,
  toPhoenixDate,
} from "@/lib/household-finance-queries";
import { isSpendingTransaction } from "@/lib/household-spending";

// Two years so every preset range has a same-length previous window to
// compare against (12 months back needs 24 months of history).
const LOOKBACK_MONTHS = 24;

export interface HouseholdSpendingData {
  today: string;
  accounts: HouseholdAccountRow[];
  transactions: HouseholdTransactionRow[];
}

export async function getHouseholdSpendingData(): Promise<HouseholdSpendingData | null> {
  const { supabase, practiceId } = await requireMemberModuleAccess("financial");
  const today = toPhoenixDate(new Date());
  const startDate = `${shiftMonthKey(today.slice(0, 7), -(LOOKBACK_MONTHS - 1))}-01`;

  let accounts: HouseholdAccountRow[];
  try {
    ({ accounts } = await getHouseholdAccounts(supabase, practiceId));
  } catch (error) {
    if (error instanceof MissingFinancialTablesError) return null;
    throw error;
  }

  const transactions = (await getHouseholdTransactions(supabase, practiceId, startDate)).filter(isSpendingTransaction);
  return { today, accounts, transactions };
}
