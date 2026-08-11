"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  calculateTransactionTotals,
  findMatchingBookkeepingAccountId,
  normalizeVendorName,
  transactionDisplayName,
  type FinancialTransaction,
  type FinancialTransactionDashboardData,
} from "@/lib/financial-transactions";
import { syncFinancialTransactions } from "@/lib/financial-sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspaceModule } from "@/actions/workspace-access";

const reviewSchema = z.object({
  transactionId: z.string().uuid(),
  accountId: z.string().uuid().nullable(),
  status: z.enum(["reviewed", "excluded"]),
  note: z.string().trim().max(1000).nullable().optional(),
}).refine((value) => value.status === "excluded" || value.accountId !== null, {
  message: "Choose an account before approving",
});
const connectionIdSchema = z.string().uuid().optional();
const transferSchema = z.object({
  transactionId: z.string().uuid(),
  otherFinancialAccountId: z.string().uuid(),
  matchedTransactionId: z.string().uuid().nullable().optional(),
  transferKind: z.enum([
    "internal",
    "credit_card_payment",
    "line_of_credit_draw",
    "loan_payment",
  ]),
  note: z.string().trim().max(1000).nullable().optional(),
});

async function requireAdmin() {
  await requireWorkspaceModule("financial");
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await client
    .from("profiles")
    .select("practice_id, role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") throw new Error("Admin access required");

  return {
    supabase: createAdminClient(),
    userId: user.id,
    practiceId: profile.practice_id as string,
  };
}

function isSetupMissing(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return Boolean(
    error &&
      (message.includes("financial_transactions") ||
        message.includes("bookkeeping_accounts") ||
        message.includes("bookkeeping_vendor_rules") ||
        message.includes("transactions_status") ||
        error.code === "PGRST204" ||
        error.code === "PGRST205"),
  );
}

export async function getFinancialTransactionDashboardData(): Promise<
  FinancialTransactionDashboardData | null
> {
  const { supabase, practiceId } = await requireAdmin();
  const { data: connections, error: connectionError } = await supabase
    .from("financial_connections")
    .select(
      "id, institution_name, transactions_status, transactions_last_synced_at",
    )
    .eq("practice_id", practiceId)
    .neq("status", "disconnected")
    .order("created_at", { ascending: true });
  if (isSetupMissing(connectionError)) return null;
  if (connectionError) throw new Error(connectionError.message);

  let { data: accounts, error: accountError } = await supabase
    .from("financial_accounts")
    .select("id, connection_id, name, nickname, mask, account_type, account_subtype, included_in_bookkeeping")
    .eq("practice_id", practiceId)
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (accountError?.code === "PGRST204") {
    const fallback = await supabase
      .from("financial_accounts")
      .select("id, connection_id, name, mask, account_type, account_subtype, included_in_bookkeeping")
      .eq("practice_id", practiceId)
      .eq("is_active", true)
      .order("name", { ascending: true });
    accounts = fallback.data?.map((account) => ({ ...account, nickname: null })) ?? null;
    accountError = fallback.error;
  }
  if (accountError) throw new Error(accountError.message);
  const includedAccounts = (accounts ?? []).filter(
    (account) => account.included_in_bookkeeping,
  );
  const includedAccountIds = includedAccounts.map((account) => account.id as string);

  const { data: bookkeepingAccounts, error: bookkeepingAccountError } = await supabase
    .from("bookkeeping_accounts")
    .select("id, account_number, name, account_type, detail_type, external_source")
    .eq("practice_id", practiceId)
    .eq("is_active", true)
    .order("account_type", { ascending: true })
    .order("account_number", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  if (isSetupMissing(bookkeepingAccountError)) return null;
  if (bookkeepingAccountError) throw new Error(bookkeepingAccountError.message);

  const { data: vendorRules, error: vendorRuleError } = await supabase
    .from("bookkeeping_vendor_rules")
    .select("normalized_vendor, bookkeeping_account_id, match_type")
    .eq("practice_id", practiceId);
  if (isSetupMissing(vendorRuleError)) return null;
  if (vendorRuleError) throw new Error(vendorRuleError.message);

  const transactionResult = includedAccountIds.length
    ? await supabase
        .from("financial_transactions")
        .select("*")
        .eq("practice_id", practiceId)
        .eq("is_removed", false)
        .in("account_id", includedAccountIds)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500)
    : { data: [], error: null };
  const { data: transactions, error: transactionError } = transactionResult;
  if (isSetupMissing(transactionError)) return null;
  if (transactionError) throw new Error(transactionError.message);

  const { monthStart, monthEnd } = getPhoenixMonthBounds();

  const [
    { count: pendingCount, error: pendingError },
    { count: reviewedCount, error: reviewedError },
    currentMonthRows,
  ] =
    await Promise.all([
      getTransactionCount(supabase, practiceId, includedAccountIds, "pending"),
      getTransactionCount(supabase, practiceId, includedAccountIds, "reviewed"),
      getMonthTransactionRows(
        supabase,
        practiceId,
        includedAccountIds,
        monthStart,
        monthEnd,
      ),
    ]);
  if (pendingError) throw new Error(pendingError.message);
  if (reviewedError) throw new Error(reviewedError.message);

  const typedTransactions = (transactions ?? []) as FinancialTransaction[];
  const activeBookkeepingAccountIds = new Set(
    (bookkeepingAccounts ?? []).map((account) => account.id as string),
  );
  const activeRules = (vendorRules ?? [])
    .filter((rule) =>
      activeBookkeepingAccountIds.has(rule.bookkeeping_account_id as string),
    )
    .map((rule) => ({
      normalizedVendor: rule.normalized_vendor as string,
      bookkeepingAccountId: rule.bookkeeping_account_id as string,
      matchType: rule.match_type as "exact" | "contains",
    }));
  const currentMonthTotals = calculateTransactionTotals(
    currentMonthRows as Pick<
      FinancialTransaction,
      "amount_cents" | "pending" | "is_removed"
    >[],
  );
  const institutionByConnection = new Map(
    (connections ?? []).map((connection) => [
      connection.id as string,
      (connection.institution_name as string | null) ?? "Financial institution",
    ]),
  );

  return {
    transactions: typedTransactions,
    accounts: includedAccounts.map((account) => ({
      id: account.id as string,
      connectionId: account.connection_id as string,
      name: account.name as string,
      nickname: account.nickname as string | null,
      mask: account.mask as string | null,
      accountType: account.account_type as string,
      accountSubtype: account.account_subtype as string | null,
      institutionName:
        institutionByConnection.get(account.connection_id as string) ??
        "Financial institution",
    })),
    bookkeepingAccounts: (bookkeepingAccounts ?? []).map((account) => ({
      id: account.id as string,
      accountNumber: account.account_number as string | null,
      name: account.name as string,
      accountType: account.account_type as string,
      detailType: account.detail_type as string | null,
      externalSource: account.external_source as "quickbooks" | "manual",
    })),
    suggestedBookkeepingAccountByTransaction: Object.fromEntries(
      typedTransactions.flatMap((transaction) => {
        if (transaction.bookkeeping_account_id) return [];
        const normalizedCandidates = [
          transactionDisplayName(transaction),
          transaction.name,
          transaction.original_description,
        ]
          .filter((value): value is string => Boolean(value))
          .map(normalizeVendorName);
        const suggestedAccountId = normalizedCandidates
          .map((candidate) => findMatchingBookkeepingAccountId(candidate, activeRules))
          .find((accountId): accountId is string => Boolean(accountId));
        return suggestedAccountId ? [[transaction.id, suggestedAccountId]] : [];
      }),
    ),
    pendingCount: pendingCount ?? 0,
    reviewedCount: reviewedCount ?? 0,
    currentMonthOutflowCents: currentMonthTotals.outflowCents,
    currentMonthInflowCents: currentMonthTotals.inflowCents,
    lastSyncedAt:
      (connections ?? [])
        .map((connection) => connection.transactions_last_synced_at as string | null)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null,
    connectionCount: connections?.length ?? 0,
    connectionsNeedingConsent: (connections ?? []).filter(
      (connection) => connection.transactions_status === "not_enabled",
    ).length,
  };
}

export async function reviewFinancialTransaction(input: unknown) {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid review" };
  }
  const { supabase, userId, practiceId } = await requireAdmin();
  const now = new Date().toISOString();
  const { data: transaction, error: transactionError } = await supabase
    .from("financial_transactions")
    .select("id, account_id, name, merchant_name, counterparty_name")
    .eq("id", parsed.data.transactionId)
    .eq("practice_id", practiceId)
    .eq("is_removed", false)
    .single();
  if (transactionError || !transaction) {
    return { error: transactionError?.message ?? "Transaction not found" };
  }
  if (!transaction.account_id) {
    return { error: "This transaction is not linked to a bank account" };
  }

  const { data: sourceAccount, error: sourceAccountError } = await supabase
    .from("financial_accounts")
    .select("id")
    .eq("id", transaction.account_id)
    .eq("practice_id", practiceId)
    .eq("is_active", true)
    .eq("included_in_bookkeeping", true)
    .maybeSingle();
  if (sourceAccountError || !sourceAccount) {
    return { error: "This bank account is not included in bookkeeping" };
  }

  if (parsed.data.status === "reviewed") {
    const { data: account, error: accountError } = await supabase
      .from("bookkeeping_accounts")
      .select("id")
      .eq("id", parsed.data.accountId)
      .eq("practice_id", practiceId)
      .eq("is_active", true)
      .single();
    if (accountError || !account) {
      return { error: accountError?.message ?? "Bookkeeping account not found" };
    }
  }

  const { error } = parsed.data.status === "excluded"
    ? await supabase.rpc("exclude_financial_transaction", {
        p_practice_id: practiceId,
        p_transaction_id: parsed.data.transactionId,
        p_review_note: parsed.data.note || null,
        p_reviewed_by: userId,
      })
    : await supabase.rpc("post_categorized_financial_transaction", {
        p_practice_id: practiceId,
        p_transaction_id: parsed.data.transactionId,
        p_bookkeeping_account_id: parsed.data.accountId,
        p_review_note: parsed.data.note || null,
        p_reviewed_by: userId,
      });
  if (error) return { error: error.message };

  const normalizedVendor = normalizeVendorName(
    transactionDisplayName(transaction as Pick<
      FinancialTransaction,
      "merchant_name" | "counterparty_name" | "name"
    >),
  );
  if (
    parsed.data.status === "reviewed" &&
    parsed.data.accountId &&
    normalizedVendor.length >= 2
  ) {
    const { error: ruleError } = await supabase
      .from("bookkeeping_vendor_rules")
      .upsert(
        {
          practice_id: practiceId,
          normalized_vendor: normalizedVendor,
          bookkeeping_account_id: parsed.data.accountId,
          source: "review",
          sample_count: 1,
          confidence: 1,
          updated_by: userId,
          updated_at: now,
        },
        { onConflict: "practice_id,normalized_vendor" },
      );
    if (ruleError) return { error: ruleError.message };
  }

  revalidatePath("/admin/financial-transactions");
  return { success: true };
}

export async function reviewFinancialTransfer(input: unknown) {
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid transfer" };
  }
  if (parsed.data.transactionId === parsed.data.matchedTransactionId) {
    return { error: "A transaction cannot match itself" };
  }

  const { supabase, userId, practiceId } = await requireAdmin();
  const { error } = await supabase.rpc("post_financial_transfer", {
    p_practice_id: practiceId,
    p_transaction_id: parsed.data.transactionId,
    p_other_financial_account_id: parsed.data.otherFinancialAccountId,
    p_matched_transaction_id: parsed.data.matchedTransactionId ?? null,
    p_transfer_kind: parsed.data.transferKind,
    p_review_note: parsed.data.note || null,
    p_reviewed_by: userId,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/financial-transactions");
  revalidatePath("/admin/financial/reports");
  return { success: true };
}

export async function refreshFinancialTransactions(connectionId?: string) {
  const parsedId = connectionIdSchema.safeParse(connectionId);
  if (!parsedId.success) return { error: "Invalid financial connection" };
  const { supabase, practiceId } = await requireAdmin();

  const query = supabase
    .from("financial_connections")
    .select("id")
    .eq("practice_id", practiceId)
    .neq("status", "disconnected");
  const { data: connections, error } = parsedId.data
    ? await query.eq("id", parsedId.data)
    : await query;
  if (error) return { error: error.message };

  let imported = 0;
  let needsConsent = 0;
  let failed = 0;
  for (const connection of connections ?? []) {
    try {
      const result = await syncFinancialTransactions({
        supabase,
        connectionId: connection.id as string,
        practiceId,
      });
      imported += result.changeCount;
      if (result.status === "not_enabled") needsConsent += 1;
    } catch {
      // Each connection stores its own error so the remaining institutions can sync.
      failed += 1;
    }
  }

  revalidatePath("/admin/financial-transactions");
  revalidatePath("/admin/financial-connections");
  return { success: true, imported, needsConsent, failed };
}

function getPhoenixMonthBounds() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    monthStart: `${year}-${String(month).padStart(2, "0")}-01`,
    monthEnd: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`,
  };
}

async function getMonthTransactionRows(
  supabase: ReturnType<typeof createAdminClient>,
  practiceId: string,
  accountIds: string[],
  monthStart: string,
  monthEnd: string,
) {
  const rows: Array<{
    amount_cents: number;
    pending: boolean;
    is_removed: boolean;
  }> = [];
  if (!accountIds.length) return rows;
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("financial_transactions")
      .select("amount_cents, pending, is_removed")
      .eq("practice_id", practiceId)
      .eq("is_removed", false)
      .in("account_id", accountIds)
      .gte("transaction_date", monthStart)
      .lt("transaction_date", monthEnd)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as typeof rows));
    if ((data?.length ?? 0) < pageSize) return rows;
  }
}

async function getTransactionCount(
  supabase: ReturnType<typeof createAdminClient>,
  practiceId: string,
  accountIds: string[],
  status: "pending" | "reviewed",
) {
  if (!accountIds.length) return { count: 0, error: null };
  return supabase
    .from("financial_transactions")
    .select("id", { count: "exact", head: true })
    .eq("practice_id", practiceId)
    .eq("is_removed", false)
    .eq("review_status", status)
    .in("account_id", accountIds);
}
