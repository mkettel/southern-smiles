import {
  PersonalFinanceCategoryVersion,
  type AccountBase,
  type CreditCardLiability,
  type Transaction,
} from "plaid";
import { calculateCondition } from "@/lib/conditions";
import { getCurrentWeekStart } from "@/lib/constants";
import {
  calculateTotalCreditCardDebtCents,
  dollarsToCents,
  type FinancialAccount,
} from "@/lib/financial-connections";
import { decryptFinancialToken } from "@/lib/financial-token-crypto";
import { mapPlaidTransaction } from "@/lib/financial-transactions";
import { getPlaidApiErrorDetails, getPlaidClient } from "@/lib/plaid-client";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

interface FinancialConnectionSecret {
  id: string;
  practice_id: string;
  access_token_ciphertext: string;
  transactions_cursor?: string | null;
}

export interface FinancialAccountUpsert {
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
  balance_updated_at: string;
  last_synced_at: string;
  updated_at: string;
}

export function mapPlaidCreditCardAccount({
  account,
  liability,
  practiceId,
  connectionId,
  includedInTotal,
  syncedAt,
}: {
  account: AccountBase;
  liability: CreditCardLiability | null;
  practiceId: string;
  connectionId: string;
  includedInTotal: boolean;
  syncedAt: string;
}): FinancialAccountUpsert {
  return {
    practice_id: practiceId,
    connection_id: connectionId,
    provider_account_id: account.account_id,
    name: account.name,
    official_name: account.official_name ?? null,
    mask: account.mask ?? null,
    account_type: account.type,
    account_subtype: account.subtype ?? null,
    currency_code:
      account.balances.iso_currency_code ??
      account.balances.unofficial_currency_code ??
      "USD",
    current_balance_cents: dollarsToCents(account.balances.current),
    available_balance_cents: dollarsToCents(account.balances.available),
    credit_limit_cents: dollarsToCents(account.balances.limit),
    minimum_payment_cents: dollarsToCents(liability?.minimum_payment_amount),
    next_payment_due_date: liability?.next_payment_due_date ?? null,
    included_in_total: includedInTotal,
    is_active: true,
    balance_updated_at: account.balances.last_updated_datetime ?? syncedAt,
    last_synced_at: syncedAt,
    updated_at: syncedAt,
  };
}

export async function syncFinancialConnection({
  supabase,
  connectionId,
  practiceId,
  actorId,
}: {
  supabase: AdminClient;
  connectionId: string;
  practiceId: string;
  actorId: string | null;
}): Promise<{
  accountCount: number;
  totalDebtCents: number;
  transactionChanges: number;
}> {
  const { data: connection, error: connectionError } = await supabase
    .from("financial_connections")
    .select("id, practice_id, access_token_ciphertext")
    .eq("id", connectionId)
    .eq("practice_id", practiceId)
    .neq("status", "disconnected")
    .maybeSingle();

  if (connectionError) throw new Error(connectionError.message);
  if (!connection) throw new Error("Financial connection not found");

  const typedConnection = connection as FinancialConnectionSecret;
  const accessToken = decryptFinancialToken(typedConnection.access_token_ciphertext);
  const syncedAt = new Date().toISOString();

  try {
    const accountsResponse = await getPlaidClient().accountsGet({
      access_token: accessToken,
    });
    const creditLiabilities = await getCreditLiabilities(accessToken);
    const returnedAccounts = accountsResponse.data.accounts;

    const { data: existingRows, error: existingError } = await supabase
      .from("financial_accounts")
      .select("id, provider_account_id, included_in_total, account_type, account_subtype")
      .eq("practice_id", practiceId)
      .eq("connection_id", connectionId);
    if (existingError) throw new Error(existingError.message);

    const existingByProviderId = new Map(
      (existingRows ?? []).map((row) => [row.provider_account_id as string, row]),
    );
    const upserts = returnedAccounts.map((account) =>
      mapPlaidCreditCardAccount({
        account,
        liability: creditLiabilities.get(account.account_id) ?? null,
        practiceId,
        connectionId,
        includedInTotal:
          (existingByProviderId.get(account.account_id)?.included_in_total as boolean | undefined) ??
          isCreditCard(account),
        syncedAt,
      }),
    );

    if (upserts.length) {
      const { error: upsertError } = await supabase
        .from("financial_accounts")
        .upsert(upserts, { onConflict: "connection_id,provider_account_id" });
      if (upsertError) throw new Error(upsertError.message);
    }

    const returnedIds = new Set(returnedAccounts.map((account) => account.account_id));
    const missingIds = (existingRows ?? [])
      .filter((row) => !returnedIds.has(row.provider_account_id as string))
      .map((row) => row.id as string);
    if (missingIds.length) {
      const { error: inactiveError } = await supabase
        .from("financial_accounts")
        .update({ is_active: false, updated_at: syncedAt })
        .in("id", missingIds)
        .eq("practice_id", practiceId);
      if (inactiveError) throw new Error(inactiveError.message);
    }

    const { data: storedAccounts, error: storedError } = await supabase
      .from("financial_accounts")
      .select("*")
      .eq("practice_id", practiceId)
      .eq("connection_id", connectionId)
      .eq("is_active", true);
    if (storedError) throw new Error(storedError.message);

    const snapshotDate = syncedAt.slice(0, 10);
    const snapshots = ((storedAccounts ?? []) as FinancialAccount[])
      .filter((account) => account.current_balance_cents !== null)
      .map((account) => ({
        practice_id: practiceId,
        account_id: account.id,
        snapshot_date: snapshotDate,
        balance_cents: account.current_balance_cents as number,
        synced_at: syncedAt,
      }));
    if (snapshots.length) {
      const { error: snapshotError } = await supabase
        .from("financial_balance_snapshots")
        .upsert(snapshots, { onConflict: "account_id,snapshot_date" });
      if (snapshotError) throw new Error(snapshotError.message);
    }

    const { error: updateError } = await supabase
      .from("financial_connections")
      .update({
        status: "active",
        consent_expiration_time: accountsResponse.data.item.consent_expiration_time,
        last_synced_at: syncedAt,
        last_error: null,
        updated_at: syncedAt,
      })
      .eq("id", connectionId)
      .eq("practice_id", practiceId);
    if (updateError) throw new Error(updateError.message);

    let transactionChanges = 0;
    try {
      const transactionSync = await syncFinancialTransactions({
        supabase,
        connectionId,
        practiceId,
      });
      transactionChanges = transactionSync.changeCount;
    } catch {
      // Balance and liability sync remains useful even if Transactions needs
      // additional consent or a later retry. The transaction status stores it.
    }

    const totalDebtCents = await syncTotalCreditCardDebtStat(
      supabase,
      practiceId,
      actorId,
    );
    return {
      accountCount: returnedAccounts.length,
      totalDebtCents,
      transactionChanges,
    };
  } catch (error) {
    const details = getPlaidApiErrorDetails(error);
    await supabase
      .from("financial_connections")
      .update({
        status: details.reconnectRequired ? "reconnect_required" : "error",
        last_error: details.message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
      .eq("practice_id", practiceId);
    throw new Error(details.message);
  }
}

function isCreditCard(account: AccountBase) {
  return account.type === "credit" && account.subtype === "credit card";
}

async function getCreditLiabilities(accessToken: string) {
  try {
    const response = await getPlaidClient().liabilitiesGet({ access_token: accessToken });
    return new Map(
      (response.data.liabilities.credit ?? [])
        .filter((liability) => liability.account_id)
        .map((liability) => [liability.account_id as string, liability]),
    );
  } catch (error) {
    const details = getPlaidApiErrorDetails(error);
    if (isUnavailableProductCode(details.code)) {
      return new Map<string, CreditCardLiability>();
    }
    throw error;
  }
}

function isUnavailableProductCode(code: string | null) {
  return (
    code === "PRODUCT_NOT_READY" ||
    code === "PRODUCTS_NOT_SUPPORTED" ||
    code === "NO_PRODUCT_PERMISSIONS" ||
    code === "PRODUCT_NOT_ENABLED" ||
    code === "ADDITIONAL_CONSENT_REQUIRED" ||
    code === "CONSENT_NOT_GRANTED" ||
    code === "SANDBOX_PRODUCT_NOT_ENABLED"
  );
}

export interface FinancialTransactionSyncResult {
  changeCount: number;
  status: "not_enabled" | "pending" | "ready";
}

export async function syncFinancialTransactions({
  supabase,
  connectionId,
  practiceId,
}: {
  supabase: AdminClient;
  connectionId: string;
  practiceId: string;
}): Promise<FinancialTransactionSyncResult> {
  const { data: connection, error: connectionError } = await supabase
    .from("financial_connections")
    .select("id, practice_id, access_token_ciphertext, transactions_cursor")
    .eq("id", connectionId)
    .eq("practice_id", practiceId)
    .neq("status", "disconnected")
    .maybeSingle();
  if (connectionError) throw new Error(connectionError.message);
  if (!connection) throw new Error("Financial connection not found");

  const typedConnection = connection as FinancialConnectionSecret;
  const accessToken = decryptFinancialToken(typedConnection.access_token_ciphertext);
  const originalCursor = typedConnection.transactions_cursor ?? null;
  const syncedAt = new Date().toISOString();

  try {
    const batch = await fetchTransactionBatch(accessToken, originalCursor);
    await upsertTransactionAccounts({
      supabase,
      practiceId,
      connectionId,
      accounts: batch.accounts,
      syncedAt,
    });

    const { data: storedAccounts, error: accountsError } = await supabase
      .from("financial_accounts")
      .select("id, provider_account_id")
      .eq("practice_id", practiceId)
      .eq("connection_id", connectionId);
    if (accountsError) throw new Error(accountsError.message);
    const accountIds = new Map(
      (storedAccounts ?? []).map((account) => [
        account.provider_account_id as string,
        account.id as string,
      ]),
    );

    const changedTransactions = [...batch.added, ...batch.modified];
    if (changedTransactions.length) {
      const rows = changedTransactions.map((transaction) =>
        mapPlaidTransaction({
          transaction,
          practiceId,
          connectionId,
          accountId: accountIds.get(transaction.account_id) ?? null,
          syncedAt,
        }),
      );
      const { error: upsertError } = await supabase
        .from("financial_transactions")
        .upsert(rows, { onConflict: "connection_id,provider_transaction_id" });
      if (upsertError) throw new Error(upsertError.message);
    }

    const removedIds = [...new Set(batch.removedIds)];
    if (removedIds.length) {
      const { error: removedError } = await supabase
        .from("financial_transactions")
        .update({ is_removed: true, removed_at: syncedAt, updated_at: syncedAt })
        .eq("practice_id", practiceId)
        .eq("connection_id", connectionId)
        .in("provider_transaction_id", removedIds);
      if (removedError) throw new Error(removedError.message);
    }

    const status = batch.updateStatus === "NOT_READY" ? "pending" : "ready";
    const { error: updateError } = await supabase
      .from("financial_connections")
      .update({
        transactions_cursor: batch.nextCursor || originalCursor,
        transactions_status: status,
        transactions_last_synced_at: syncedAt,
        transactions_last_error: null,
        updated_at: syncedAt,
      })
      .eq("id", connectionId)
      .eq("practice_id", practiceId);
    if (updateError) throw new Error(updateError.message);

    return {
      changeCount: changedTransactions.length + removedIds.length,
      status,
    };
  } catch (error) {
    const details = getPlaidApiErrorDetails(error);
    const consentRequired = isUnavailableProductCode(details.code);
    await supabase
      .from("financial_connections")
      .update({
        transactions_status: consentRequired ? "not_enabled" : "error",
        transactions_last_error: details.message,
        updated_at: syncedAt,
      })
      .eq("id", connectionId)
      .eq("practice_id", practiceId);
    if (consentRequired) return { changeCount: 0, status: "not_enabled" };
    throw new Error(details.message);
  }
}

async function fetchTransactionBatch(accessToken: string, originalCursor: string | null) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let cursor = originalCursor;
    const added: Transaction[] = [];
    const modified: Transaction[] = [];
    const removedIds: string[] = [];
    const accounts = new Map<string, AccountBase>();
    let updateStatus = "NOT_READY";

    try {
      for (let page = 0; page < 100; page += 1) {
        const response = await getPlaidClient().transactionsSync({
          access_token: accessToken,
          cursor: cursor ?? undefined,
          count: 500,
          options: {
            include_original_description: true,
            days_requested: 730,
            personal_finance_category_version: PersonalFinanceCategoryVersion.V2,
          },
        });
        added.push(...response.data.added);
        modified.push(...response.data.modified);
        removedIds.push(...response.data.removed.map((item) => item.transaction_id));
        response.data.accounts.forEach((account) => accounts.set(account.account_id, account));
        cursor = response.data.next_cursor;
        updateStatus = response.data.transactions_update_status;
        if (!response.data.has_more) {
          return {
            added,
            modified,
            removedIds,
            accounts: [...accounts.values()],
            nextCursor: cursor,
            updateStatus,
          };
        }
      }
      throw new Error("Plaid transaction sync exceeded 100 pages");
    } catch (error) {
      const details = getPlaidApiErrorDetails(error);
      if (
        details.code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" &&
        attempt === 0
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Plaid transaction sync could not stabilize");
}

async function upsertTransactionAccounts({
  supabase,
  practiceId,
  connectionId,
  accounts,
  syncedAt,
}: {
  supabase: AdminClient;
  practiceId: string;
  connectionId: string;
  accounts: AccountBase[];
  syncedAt: string;
}) {
  if (!accounts.length) return;
  const { data: existing, error: existingError } = await supabase
    .from("financial_accounts")
    .select("provider_account_id, included_in_total")
    .eq("practice_id", practiceId)
    .eq("connection_id", connectionId);
  if (existingError) throw new Error(existingError.message);
  const existingByProviderId = new Map(
    (existing ?? []).map((account) => [account.provider_account_id as string, account]),
  );
  const rows = accounts.map((account) =>
    mapPlaidCreditCardAccount({
      account,
      liability: null,
      practiceId,
      connectionId,
      includedInTotal:
        (existingByProviderId.get(account.account_id)?.included_in_total as
          | boolean
          | undefined) ?? isCreditCard(account),
      syncedAt,
    }),
  );
  const { error } = await supabase
    .from("financial_accounts")
    .upsert(rows, { onConflict: "connection_id,provider_account_id" });
  if (error) throw new Error(error.message);
}

export async function syncTotalCreditCardDebtStat(
  supabase: AdminClient,
  practiceId: string,
  actorId: string | null,
): Promise<number> {
  const { data: accounts, error: accountsError } = await supabase
    .from("financial_accounts")
    .select("current_balance_cents, included_in_total, is_active")
    .eq("practice_id", practiceId);
  if (accountsError) throw new Error(accountsError.message);

  const totalCents = calculateTotalCreditCardDebtCents(
    (accounts ?? []) as Pick<
      FinancialAccount,
      "current_balance_cents" | "included_in_total" | "is_active"
    >[],
  );
  const totalDollars = totalCents / 100;
  const weekStart = getCurrentWeekStart();

  const { data: stat } = await supabase
    .from("stats")
    .select("id, post_id, good_direction")
    .eq("practice_id", practiceId)
    .eq("is_active", true)
    .eq("stat_type", "dollar")
    .ilike("name", "Total Credit Card Debt")
    .maybeSingle();
  if (!stat) return totalCents;

  const [{ data: previous }, { data: current }] = await Promise.all([
    supabase
      .from("stat_entries")
      .select("value")
      .eq("stat_id", stat.id)
      .lt("week_start", weekStart)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("stat_entries")
      .select("profile_id")
      .eq("stat_id", stat.id)
      .eq("week_start", weekStart)
      .maybeSingle(),
  ]);
  const previousValue = previous?.value === null || previous?.value === undefined
    ? null
    : Number(previous.value);

  const profileId =
    (await getAssignedProfileId(supabase, stat.post_id as string)) ??
    (current?.profile_id as string | null | undefined) ??
    actorId ??
    (await getPracticeAdminProfileId(supabase, practiceId));
  if (!profileId) return totalCents;

  const condition = calculateCondition(
    totalDollars,
    previousValue,
    (stat.good_direction as "up" | "down") ?? "down",
  );
  const now = new Date().toISOString();
  const { error: statError } = await supabase.from("stat_entries").upsert(
    {
      stat_id: stat.id,
      profile_id: profileId,
      practice_id: practiceId,
      week_start: weekStart,
      value: totalDollars,
      calculated_value: totalDollars,
      is_manual_override: false,
      previous_value: previousValue,
      percent_change: condition.percentChange,
      auto_condition: condition.condition,
      self_condition: condition.condition,
      final_condition: condition.condition,
      updated_by: actorId,
      submitted_at: now,
      updated_at: now,
    },
    { onConflict: "stat_id,week_start" },
  );
  if (statError) throw new Error(statError.message);

  return totalCents;
}

async function getAssignedProfileId(
  supabase: AdminClient,
  postId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("employee_posts")
    .select("profile_id")
    .eq("post_id", postId)
    .order("assigned_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.profile_id as string | null | undefined) ?? null;
}

async function getPracticeAdminProfileId(
  supabase: AdminClient,
  practiceId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("practice_id", practiceId)
    .eq("role", "admin")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | null | undefined) ?? null;
}
