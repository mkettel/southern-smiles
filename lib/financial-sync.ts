import type { AccountBase, CreditCardLiability } from "plaid";
import { calculateCondition } from "@/lib/conditions";
import { getCurrentWeekStart } from "@/lib/constants";
import {
  calculateTotalCreditCardDebtCents,
  dollarsToCents,
  type FinancialAccount,
} from "@/lib/financial-connections";
import { decryptFinancialToken } from "@/lib/financial-token-crypto";
import { getPlaidApiErrorDetails, getPlaidClient } from "@/lib/plaid-client";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

interface FinancialConnectionSecret {
  id: string;
  practice_id: string;
  access_token_ciphertext: string;
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
}): Promise<{ accountCount: number; totalDebtCents: number }> {
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
    const response = await getPlaidClient().liabilitiesGet({
      access_token: accessToken,
    });
    const creditLiabilities = new Map(
      (response.data.liabilities.credit ?? [])
        .filter((liability) => liability.account_id)
        .map((liability) => [liability.account_id as string, liability]),
    );
    const creditAccounts = response.data.accounts.filter(
      (account) => account.type === "credit" && account.subtype === "credit card",
    );

    const { data: existingRows, error: existingError } = await supabase
      .from("financial_accounts")
      .select("id, provider_account_id, included_in_total")
      .eq("practice_id", practiceId)
      .eq("connection_id", connectionId);
    if (existingError) throw new Error(existingError.message);

    const existingByProviderId = new Map(
      (existingRows ?? []).map((row) => [row.provider_account_id as string, row]),
    );
    const upserts = creditAccounts.map((account) =>
      mapPlaidCreditCardAccount({
        account,
        liability: creditLiabilities.get(account.account_id) ?? null,
        practiceId,
        connectionId,
        includedInTotal:
          (existingByProviderId.get(account.account_id)?.included_in_total as
            | boolean
            | undefined) ?? true,
        syncedAt,
      }),
    );

    if (upserts.length) {
      const { error: upsertError } = await supabase
        .from("financial_accounts")
        .upsert(upserts, { onConflict: "connection_id,provider_account_id" });
      if (upsertError) throw new Error(upsertError.message);
    }

    const returnedIds = new Set(creditAccounts.map((account) => account.account_id));
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
        consent_expiration_time: response.data.item.consent_expiration_time,
        last_synced_at: syncedAt,
        last_error: null,
        updated_at: syncedAt,
      })
      .eq("id", connectionId)
      .eq("practice_id", practiceId);
    if (updateError) throw new Error(updateError.message);

    const totalDebtCents = await syncTotalCreditCardDebtStat(
      supabase,
      practiceId,
      actorId,
    );
    return { accountCount: creditAccounts.length, totalDebtCents };
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

