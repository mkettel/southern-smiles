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
import { requireMemberModuleAccess } from "@/actions/member-module-access";

const reviewSchema = z.object({
  transactionId: z.string().uuid(),
  accountId: z.string().uuid().nullable(),
  status: z.enum(["reviewed", "excluded"]),
  note: z.string().trim().max(1000).nullable().optional(),
}).refine((value) => value.status === "excluded" || value.accountId !== null, {
  message: "Choose an account before approving",
});
const bulkReviewSchema = z.object({
  transactions: z.array(z.object({
    transactionId: z.string().uuid(),
    accountId: z.string().uuid(),
  })).min(1, "Select at least one transaction").max(100, "Approve up to 100 transactions at a time"),
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
const loanTransactionSchema = z.object({
  transactionId: z.string().uuid(),
  loanId: z.string().uuid(),
  activityKind: z.enum(["payment", "draw"]),
  principalCents: z.number().int().nonnegative(),
  interestCents: z.number().int().nonnegative(),
  feeCents: z.number().int().nonnegative(),
  interestAccountId: z.string().uuid().nullable().optional(),
  feeAccountId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

const requireFinancialAccess = () => requireMemberModuleAccess("financial");

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
  const { supabase, practiceId } = await requireFinancialAccess();
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

  const { data: loans, error: loanError } = await supabase
    .from("financial_loans")
    .select("id, name, lender_name, loan_type, account_reference, bookkeeping_account_id, current_balance_cents, scheduled_payment_cents, payment_frequency")
    .eq("practice_id", practiceId)
    .eq("status", "active")
    .order("lender_name")
    .order("name");
  if (isSetupMissing(loanError)) return null;
  if (loanError) throw new Error(loanError.message);
  const { data: loanPayments, error: loanPaymentError } = await supabase
    .from("financial_loan_payments")
    .select("loan_id, principal_cents, interest_cents, fee_cents, payment_date")
    .eq("practice_id", practiceId)
    .order("payment_date", { ascending: false });
  if (loanPaymentError) throw new Error(loanPaymentError.message);
  const { data: loanSchedule, error: loanScheduleError } = await supabase
    .from("financial_loan_schedule_entries")
    .select("loan_id, due_date, payment_cents, principal_cents, interest_cents, fee_cents")
    .eq("practice_id", practiceId)
    .order("due_date", { ascending: true });
  if (loanScheduleError) throw new Error(loanScheduleError.message);

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
  const latestPaymentByLoan = new Map<string, { principal: number; interest: number; fee: number }>();
  for (const payment of loanPayments ?? []) {
    const loanId = payment.loan_id as string;
    if (!latestPaymentByLoan.has(loanId)) latestPaymentByLoan.set(loanId, {
      principal: Number(payment.principal_cents),
      interest: Number(payment.interest_cents),
      fee: Number(payment.fee_cents),
    });
  }
  const scheduleByLoan = new Map<string, FinancialTransactionDashboardData["loans"][number]["schedule"]>();
  for (const entry of loanSchedule ?? []) {
    const schedule = scheduleByLoan.get(entry.loan_id as string) ?? [];
    schedule.push({
      dueDate: entry.due_date as string,
      paymentCents: Number(entry.payment_cents),
      principalCents: Number(entry.principal_cents),
      interestCents: Number(entry.interest_cents),
      feeCents: Number(entry.fee_cents),
    });
    scheduleByLoan.set(entry.loan_id as string, schedule);
  }
  const loanSummaries = (loans ?? []).map((loan) => ({
    id: loan.id as string,
    name: loan.name as string,
    lenderName: loan.lender_name as string,
    loanType: loan.loan_type as string,
    accountReference: loan.account_reference as string | null,
    bookkeepingAccountId: loan.bookkeeping_account_id as string,
    currentBalanceCents: Number(loan.current_balance_cents),
    scheduledPaymentCents: loan.scheduled_payment_cents === null ? null : Number(loan.scheduled_payment_cents),
    paymentFrequency: loan.payment_frequency as string | null,
    lastPrincipalCents: latestPaymentByLoan.get(loan.id as string)?.principal ?? null,
    lastInterestCents: latestPaymentByLoan.get(loan.id as string)?.interest ?? null,
    lastFeeCents: latestPaymentByLoan.get(loan.id as string)?.fee ?? null,
    schedule: scheduleByLoan.get(loan.id as string) ?? [],
  }));

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
    loans: loanSummaries,
    suggestedLoanByTransaction: Object.fromEntries(
      typedTransactions.flatMap((transaction) => {
        const haystack = [transaction.name, transaction.merchant_name, transaction.original_description]
          .filter(Boolean).join(" ").toLowerCase();
        const match = loanSummaries.find((loan) =>
          (loan.accountReference && haystack.includes(loan.accountReference.toLowerCase())) ||
          haystack.includes(loan.lenderName.toLowerCase()) ||
          haystack.includes(loan.name.toLowerCase()),
        );
        return match ? [[transaction.id, match.id]] : [];
      }),
    ),
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
  const { supabase, userId, practiceId } = await requireFinancialAccess();
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

export async function reviewFinancialTransactions(input: unknown) {
  const parsed = bulkReviewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      reviewedIds: [] as string[],
      errors: [{ transactionId: null, message: parsed.error.issues[0]?.message ?? "Invalid bulk review" }],
    };
  }

  const { supabase, userId, practiceId } = await requireFinancialAccess();
  const requestedById = new Map(
    parsed.data.transactions.map((transaction) => [transaction.transactionId, transaction]),
  );
  if (requestedById.size !== parsed.data.transactions.length) {
    return {
      reviewedIds: [] as string[],
      errors: [{ transactionId: null, message: "Each selected transaction must be unique" }],
    };
  }

  const { data: transactions, error: transactionError } = await supabase
    .from("financial_transactions")
    .select("id, account_id, name, merchant_name, counterparty_name, review_status")
    .eq("practice_id", practiceId)
    .eq("is_removed", false)
    .in("id", [...requestedById.keys()]);
  if (transactionError) {
    return {
      reviewedIds: [] as string[],
      errors: [{ transactionId: null, message: transactionError.message }],
    };
  }

  const transactionById = new Map((transactions ?? []).map((transaction) => [transaction.id as string, transaction]));
  const reviewedIds: string[] = [];
  const errors: Array<{ transactionId: string | null; message: string }> = [];
  for (const requested of requestedById.values()) {
    const transaction = transactionById.get(requested.transactionId);
    if (!transaction) {
      errors.push({ transactionId: requested.transactionId, message: "Transaction not found" });
      continue;
    }
    if (transaction.review_status !== "pending") {
      errors.push({ transactionId: requested.transactionId, message: "Transaction is no longer pending review" });
      continue;
    }
    const { error } = await supabase.rpc("post_categorized_financial_transaction", {
      p_practice_id: practiceId,
      p_transaction_id: requested.transactionId,
      p_bookkeeping_account_id: requested.accountId,
      p_review_note: null,
      p_reviewed_by: userId,
    });
    if (error) {
      errors.push({ transactionId: requested.transactionId, message: error.message });
      continue;
    }
    reviewedIds.push(requested.transactionId);
  }

  const now = new Date().toISOString();
  const proposedRules = reviewedIds.flatMap((transactionId) => {
    const transaction = transactionById.get(transactionId);
    const requested = requestedById.get(transactionId);
    if (!transaction || !requested) return [];
    const normalizedVendor = normalizeVendorName(
      transactionDisplayName(transaction as Pick<
        FinancialTransaction,
        "merchant_name" | "counterparty_name" | "name"
      >),
    );
    return normalizedVendor.length >= 2
      ? [{
          practice_id: practiceId,
          normalized_vendor: normalizedVendor,
          bookkeeping_account_id: requested.accountId,
          source: "review",
          sample_count: 1,
          confidence: 1,
          updated_by: userId,
          updated_at: now,
        }]
      : [];
  });
  const accountIdsByVendor = new Map<string, Set<string>>();
  for (const rule of proposedRules) {
    const accountIds = accountIdsByVendor.get(rule.normalized_vendor) ?? new Set<string>();
    accountIds.add(rule.bookkeeping_account_id);
    accountIdsByVendor.set(rule.normalized_vendor, accountIds);
  }
  const rules = [...new Map(
    proposedRules
      .filter((rule) => accountIdsByVendor.get(rule.normalized_vendor)?.size === 1)
      .map((rule) => [rule.normalized_vendor, rule]),
  ).values()];
  if (rules.length) {
    const { error: ruleError } = await supabase
      .from("bookkeeping_vendor_rules")
      .upsert(rules, { onConflict: "practice_id,normalized_vendor" });
    if (ruleError) errors.push({ transactionId: null, message: `Transactions posted, but vendor rules could not be updated: ${ruleError.message}` });
  }

  revalidatePath("/admin/financial-transactions");
  revalidatePath("/admin/financial/reports");
  return { reviewedIds, errors };
}

export async function reviewFinancialTransfer(input: unknown) {
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid transfer" };
  }
  if (parsed.data.transactionId === parsed.data.matchedTransactionId) {
    return { error: "A transaction cannot match itself" };
  }

  const { supabase, userId, practiceId } = await requireFinancialAccess();
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

export async function reviewFinancialLoanTransaction(input: unknown) {
  const parsed = loanTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid loan transaction" };
  }
  if (parsed.data.interestCents > 0 && !parsed.data.interestAccountId) {
    return { error: "Choose an interest expense account" };
  }
  if (parsed.data.feeCents > 0 && !parsed.data.feeAccountId) {
    return { error: "Choose a fee expense account" };
  }
  const { supabase, userId, practiceId } = await requireFinancialAccess();
  const { error } = await supabase.rpc("post_financial_loan_transaction", {
    p_practice_id: practiceId,
    p_transaction_id: parsed.data.transactionId,
    p_loan_id: parsed.data.loanId,
    p_activity_kind: parsed.data.activityKind,
    p_principal_cents: parsed.data.principalCents,
    p_interest_cents: parsed.data.interestCents,
    p_fee_cents: parsed.data.feeCents,
    p_interest_account_id: parsed.data.interestAccountId ?? null,
    p_fee_account_id: parsed.data.feeAccountId ?? null,
    p_review_note: parsed.data.note || null,
    p_reviewed_by: userId,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/financial-transactions");
  revalidatePath("/admin/financial/loans");
  revalidatePath("/admin/financial/reports");
  return { success: true };
}

export async function refreshFinancialTransactions(connectionId?: string) {
  const parsedId = connectionIdSchema.safeParse(connectionId);
  if (!parsedId.success) return { error: "Invalid financial connection" };
  const { supabase, practiceId } = await requireFinancialAccess();

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
