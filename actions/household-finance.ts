"use server";

import { requireMemberModuleAccess } from "@/actions/member-module-access";
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  HOUSEHOLD_MONTH_COUNT,
  buildHouseholdFinanceData,
  shiftMonthKey,
  type HouseholdFinanceData,
  type HouseholdSnapshotRow,
  type HouseholdTransactionRow,
} from "@/lib/household-finance";

type AdminClient = ReturnType<typeof createAdminClient>;

const MISSING_TABLE = "42P01";

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

  const [accountsResult, connectionsResult] = await Promise.all([
    supabase
      .from("financial_accounts")
      .select(
        "id, connection_id, name, nickname, mask, account_type, account_subtype, current_balance_cents, available_balance_cents, credit_limit_cents, minimum_payment_cents, next_payment_due_date, last_synced_at",
      )
      .eq("practice_id", practiceId)
      .eq("is_active", true),
    supabase
      .from("financial_connections")
      .select("id, institution_name, status, last_synced_at, transactions_last_synced_at")
      .eq("practice_id", practiceId),
  ]);

  if (accountsResult.error?.code === MISSING_TABLE || connectionsResult.error?.code === MISSING_TABLE) {
    return null;
  }
  if (accountsResult.error) throw new Error(accountsResult.error.message);
  if (connectionsResult.error) throw new Error(connectionsResult.error.message);

  const connections = connectionsResult.data ?? [];
  const institutionByConnection = new Map(
    connections.map((connection) => [connection.id as string, connection.institution_name as string | null]),
  );

  const accounts = (accountsResult.data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    nickname: (row.nickname as string | null) ?? null,
    mask: (row.mask as string | null) ?? null,
    account_type: row.account_type as string,
    account_subtype: (row.account_subtype as string | null) ?? null,
    current_balance_cents: toNumber(row.current_balance_cents),
    available_balance_cents: toNumber(row.available_balance_cents),
    credit_limit_cents: toNumber(row.credit_limit_cents),
    minimum_payment_cents: toNumber(row.minimum_payment_cents),
    next_payment_due_date: (row.next_payment_due_date as string | null) ?? null,
    last_synced_at: (row.last_synced_at as string | null) ?? null,
    institution_name: institutionByConnection.get(row.connection_id as string) ?? null,
  }));

  const [transactions, snapshots] = await Promise.all([
    getTransactions(supabase, practiceId, startDate),
    getSnapshots(supabase, practiceId, startDate),
  ]);

  const lastSyncedAt = connections
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

async function getTransactions(
  supabase: AdminClient,
  practiceId: string,
  startDate: string,
): Promise<HouseholdTransactionRow[]> {
  const rows: HouseholdTransactionRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("financial_transactions")
      .select("id, account_id, transaction_date, name, merchant_name, amount_cents, pending, plaid_category_primary")
      .eq("practice_id", practiceId)
      .eq("is_removed", false)
      .gte("transaction_date", startDate)
      .order("transaction_date", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) {
      if (error.code === MISSING_TABLE) return rows;
      throw new Error(error.message);
    }
    for (const row of data ?? []) {
      rows.push({
        id: row.id as string,
        account_id: (row.account_id as string | null) ?? null,
        transaction_date: row.transaction_date as string,
        name: row.name as string,
        merchant_name: (row.merchant_name as string | null) ?? null,
        amount_cents: toNumber(row.amount_cents) ?? 0,
        pending: Boolean(row.pending),
        plaid_category_primary: (row.plaid_category_primary as string | null) ?? null,
      });
    }
    if ((data?.length ?? 0) < pageSize) return rows;
  }
}

async function getSnapshots(
  supabase: AdminClient,
  practiceId: string,
  startDate: string,
): Promise<HouseholdSnapshotRow[]> {
  const { data, error } = await supabase
    .from("financial_balance_snapshots")
    .select("account_id, snapshot_date, balance_cents")
    .eq("practice_id", practiceId)
    .gte("snapshot_date", startDate)
    .order("snapshot_date", { ascending: true });
  if (error) {
    if (error.code === MISSING_TABLE) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => ({
    account_id: row.account_id as string,
    snapshot_date: row.snapshot_date as string,
    balance_cents: toNumber(row.balance_cents) ?? 0,
  }));
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPhoenixDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
