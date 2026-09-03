"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { transactionDisplayName, type BookkeepingAccount, type FinancialTransaction } from "@/lib/financial-transactions";
import { buildFinancialReportsData, type FinancialReportsData } from "@/lib/financial-reports";
import {
  financialWorkspaceMonthCount,
  getFinancialWorkspaceMonthFrames,
  type FinancialWorkspaceActivity,
  type FinancialWorkspaceAutoRule,
  type FinancialWorkspaceData,
  type FinancialWorkspaceRule,
} from "@/lib/financial-workspace";
import { requireMemberModuleAccess } from "@/actions/member-module-access";

const updateRuleSchema = z.object({
  ruleId: z.string().uuid(),
  bookkeepingAccountId: z.string().uuid(),
});
const ruleIdSchema = z.string().uuid();
const autoRuleSchema = z.object({ ruleId: z.string().uuid(), isEnabled: z.boolean() });
const bookkeepingAccountSchema = z.object({
  accountNumber: z.string().trim().max(40, "Account number must be 40 characters or fewer"),
  name: z.string().trim().min(1, "Account name is required").max(200, "Account name must be 200 characters or fewer"),
  accountType: z.string().trim().min(1, "Account type is required").max(100, "Account type must be 100 characters or fewer"),
  detailType: z.string().trim().max(200, "Detail type must be 200 characters or fewer"),
});
const updateBookkeepingAccountSchema = bookkeepingAccountSchema.extend({
  accountId: z.string().uuid(),
});
const bookkeepingAccountIdSchema = z.string().uuid();

const requireFinancialAccess = () => requireMemberModuleAccess("financial");

export async function getFinancialWorkspaceData(): Promise<FinancialWorkspaceData> {
  const { supabase, practiceId } = await requireFinancialAccess();
  const today = new Date();
  const currentFrame = getFinancialWorkspaceMonthFrames(today, 1)[0];

  const [accountResult, ruleResult, autoRuleResult, connectionResult, financialAccountResult, overdueResult] = await Promise.all([
    supabase.from("bookkeeping_accounts")
      .select("id, account_number, name, account_type, detail_type, external_source")
      .eq("practice_id", practiceId).eq("is_active", true)
      .order("account_type").order("account_number", { nullsFirst: false }).order("name"),
    supabase.from("bookkeeping_vendor_rules")
      .select("id, normalized_vendor, match_type, bookkeeping_account_id, source, sample_count, confidence, updated_at")
      .eq("practice_id", practiceId).order("updated_at", { ascending: false }),
    supabase.from("bookkeeping_auto_rules")
      .select("id, transaction_fingerprint, bookkeeping_account_id, confirmation_count, is_enabled, updated_at")
      .eq("practice_id", practiceId).order("updated_at", { ascending: false }),
    supabase.from("financial_connections")
      .select("id, transactions_last_synced_at")
      .eq("practice_id", practiceId).neq("status", "disconnected"),
    supabase.from("financial_accounts")
      .select("id").eq("practice_id", practiceId).eq("is_active", true).eq("included_in_bookkeeping", true),
    supabase.from("bills").select("id", { count: "exact", head: true })
      .eq("practice_id", practiceId).eq("status", "unpaid").lt("due_date", toPhoenixDate(today)),
  ]);

  for (const result of [accountResult, ruleResult, autoRuleResult, connectionResult, financialAccountResult, overdueResult]) {
    if (result.error) throw new Error(result.error.message);
  }
  const includedAccountIds = (financialAccountResult.data ?? []).map((account) => account.id as string);
  const [transactions, pendingCount, unmatchedTransferCount] = includedAccountIds.length
    ? await Promise.all([
        getWorkspaceTransactions(supabase, practiceId, includedAccountIds, currentFrame.end),
        getWorkspaceTransactionCount(supabase, practiceId, includedAccountIds),
        getWorkspaceTransactionCount(supabase, practiceId, includedAccountIds, true),
      ])
    : [[], 0, 0];

  const accounts: BookkeepingAccount[] = (accountResult.data ?? []).map((account) => ({
    id: account.id as string,
    accountNumber: account.account_number as string | null,
    name: account.name as string,
    accountType: account.account_type as string,
    detailType: account.detail_type as string | null,
    externalSource: account.external_source as "quickbooks" | "manual",
  }));
  const rules: FinancialWorkspaceRule[] = (ruleResult.data ?? []).map((rule) => ({
    id: rule.id as string,
    normalizedVendor: rule.normalized_vendor as string,
    matchType: rule.match_type as FinancialWorkspaceRule["matchType"],
    bookkeepingAccountId: rule.bookkeeping_account_id as string,
    source: rule.source as FinancialWorkspaceRule["source"],
    sampleCount: rule.sample_count as number,
    confidence: Number(rule.confidence),
    updatedAt: rule.updated_at as string,
  }));
  const autoRules: FinancialWorkspaceAutoRule[] = (autoRuleResult.data ?? []).map((rule) => ({
    id: rule.id as string,
    fingerprint: rule.transaction_fingerprint as string,
    bookkeepingAccountId: rule.bookkeeping_account_id as string,
    confirmationCount: rule.confirmation_count as number,
    isEnabled: rule.is_enabled as boolean,
    updatedAt: rule.updated_at as string,
  }));
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const monthFrames = getFinancialWorkspaceMonthFrames(
    today,
    financialWorkspaceMonthCount(transactions.at(-1)?.transaction_date, today),
  );
  const toActivity = (transaction: WorkspaceTransaction): FinancialWorkspaceActivity => {
    const account = transaction.bookkeeping_account_id ? accountById.get(transaction.bookkeeping_account_id) : null;
    return {
      id: transaction.id,
      date: transaction.transaction_date,
      description: transactionDisplayName(transaction as FinancialTransaction),
      category: account?.accountType ?? "Uncategorized",
      account: account ? `${account.accountNumber ? `${account.accountNumber} ` : ""}${account.name}` : "Choose account",
      amountCents: transaction.amount_cents,
      reviewStatus: transaction.review_status,
      categorySource: transaction.category_source,
    };
  };
  const months = monthFrames.map((frame) => {
    const monthTransactions = transactions.filter(
      (transaction) => transaction.transaction_date >= frame.start && transaction.transaction_date < frame.end,
    );
    return {
      key: frame.key,
      label: frame.shortLabel,
      longLabel: frame.longLabel,
      dateRange: frame.dateRange,
      ...summarizeTransactions(monthTransactions, accountById),
      recentActivity: monthTransactions.slice(0, 8).map(toActivity),
    };
  });
  const current = months.at(-1)!;
  const currentTransactions = transactions.filter(
    (transaction) => transaction.transaction_date >= currentFrame.start && transaction.transaction_date < currentFrame.end,
  );
  const expenseByAccount = new Map<string, number>();
  for (const transaction of currentTransactions) {
    if (transaction.review_status !== "reviewed" || transaction.amount_cents <= 0) continue;
    const account = transaction.bookkeeping_account_id ? accountById.get(transaction.bookkeeping_account_id) : null;
    if (!account || !isExpenseType(account.accountType)) continue;
    expenseByAccount.set(account.name, (expenseByAccount.get(account.name) ?? 0) + transaction.amount_cents);
  }

  return {
    monthLabel: current.longLabel,
    monthDateRange: current.dateRange,
    revenueCents: current.revenueCents,
    expenseCents: current.expenseCents,
    netIncomeCents: current.revenueCents - current.expenseCents,
    pendingCount,
    unmatchedTransferCount,
    overdueBillCount: overdueResult.count ?? 0,
    connectedInstitutionCount: connectionResult.data?.length ?? 0,
    includedBankAccountCount: financialAccountResult.data?.length ?? 0,
    lastSyncedAt: (connectionResult.data ?? [])
      .map((connection) => connection.transactions_last_synced_at as string | null)
      .filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
    months,
    recentActivity: current.recentActivity,
    expenseBreakdown: [...expenseByAccount.entries()]
      .map(([name, amountCents]) => ({ name, amountCents }))
      .sort((a, b) => b.amountCents - a.amountCents).slice(0, 8),
    accounts,
    rules,
    autoRules,
  };
}

export async function getFinancialReportsData(): Promise<FinancialReportsData> {
  const { supabase, practiceId } = await requireFinancialAccess();
  const [accountResult, financialAccountResult] = await Promise.all([
    supabase.from("bookkeeping_accounts")
      .select("id, account_number, name, account_type, detail_type, external_source")
      .eq("practice_id", practiceId)
      .order("account_type").order("account_number", { nullsFirst: false }).order("name"),
    supabase.from("financial_accounts")
      .select("id").eq("practice_id", practiceId).eq("is_active", true).eq("included_in_bookkeeping", true),
  ]);
  if (accountResult.error) throw new Error(accountResult.error.message);
  if (financialAccountResult.error) throw new Error(financialAccountResult.error.message);

  const accounts: BookkeepingAccount[] = (accountResult.data ?? []).map((account) => ({
    id: account.id as string,
    accountNumber: account.account_number as string | null,
    name: account.name as string,
    accountType: account.account_type as string,
    detailType: account.detail_type as string | null,
    externalSource: account.external_source as "quickbooks" | "manual",
  }));
  const includedAccountIds = (financialAccountResult.data ?? []).map((account) => account.id as string);
  const ledgerTransactions = await getLedgerReportTransactions(supabase, practiceId);
  const transactions = ledgerTransactions ?? (includedAccountIds.length
    ? await getReportTransactions(supabase, practiceId, includedAccountIds)
    : []);

  return buildFinancialReportsData({ accounts, transactions, now: new Date() });
}

async function getLedgerReportTransactions(
  supabase: ReturnType<typeof createAdminClient>,
  practiceId: string,
) {
  const rows: Array<{
    transaction_date: string;
    amount_cents: number;
    bookkeeping_account_id: string;
  }> = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from("accounting_journal_lines")
      .select("debit_cents, credit_cents, bookkeeping_account_id, accounting_journal_entries!inner(entry_date, status)")
      .eq("practice_id", practiceId)
      .not("bookkeeping_account_id", "is", null)
      .eq("accounting_journal_entries.status", "posted")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) {
      if (error.code === "PGRST204" || error.code === "PGRST205" ||
        error.message.toLowerCase().includes("accounting_journal_lines")) return null;
      throw new Error(error.message);
    }
    for (const row of data ?? []) {
      const entry = Array.isArray(row.accounting_journal_entries)
        ? row.accounting_journal_entries[0]
        : row.accounting_journal_entries;
      if (!entry || !row.bookkeeping_account_id) continue;
      rows.push({
        transaction_date: entry.entry_date as string,
        amount_cents: Number(row.debit_cents) - Number(row.credit_cents),
        bookkeeping_account_id: row.bookkeeping_account_id as string,
      });
    }
    if ((data?.length ?? 0) < pageSize) return rows;
  }
}

type WorkspaceTransaction = Pick<FinancialTransaction,
  "id" | "transaction_date" | "merchant_name" | "counterparty_name" | "name" | "amount_cents" |
  "review_status" | "category_source" | "bookkeeping_account_id" | "is_removed" | "pending"
>;

async function getWorkspaceTransactions(
  supabase: ReturnType<typeof createAdminClient>,
  practiceId: string,
  accountIds: string[],
  periodEnd: string,
) {
  const rows: WorkspaceTransaction[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from("financial_transactions")
      .select("id, transaction_date, merchant_name, counterparty_name, name, amount_cents, review_status, category_source, bookkeeping_account_id, is_removed, pending")
      .eq("practice_id", practiceId).eq("is_removed", false).eq("pending", false)
      .in("account_id", accountIds)
      .lt("transaction_date", periodEnd)
      .order("transaction_date", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as WorkspaceTransaction[]));
    if ((data?.length ?? 0) < pageSize) return rows;
  }
}

async function getWorkspaceTransactionCount(
  supabase: ReturnType<typeof createAdminClient>,
  practiceId: string,
  accountIds: string[],
  transfersOnly = false,
) {
  let query = supabase.from("financial_transactions").select("id", { count: "exact", head: true })
    .eq("practice_id", practiceId).eq("is_removed", false).eq("review_status", "pending")
    .in("account_id", accountIds);
  if (transfersOnly) query = query.ilike("plaid_category_primary", "TRANSFER%");
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function getReportTransactions(
  supabase: ReturnType<typeof createAdminClient>,
  practiceId: string,
  accountIds: string[],
) {
  const rows: Array<Pick<FinancialTransaction, "transaction_date" | "amount_cents" | "bookkeeping_account_id">> = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from("financial_transactions")
      .select("transaction_date, amount_cents, bookkeeping_account_id")
      .eq("practice_id", practiceId).eq("is_removed", false).eq("pending", false)
      .eq("review_status", "reviewed").not("bookkeeping_account_id", "is", null)
      .in("account_id", accountIds)
      .order("transaction_date", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as typeof rows));
    if ((data?.length ?? 0) < pageSize) return rows;
  }
}

export async function updateFinancialRule(input: unknown) {
  const parsed = updateRuleSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid rule update" };
  const { supabase, practiceId, userId } = await requireFinancialAccess();
  const { data: account } = await supabase.from("bookkeeping_accounts").select("id")
    .eq("id", parsed.data.bookkeepingAccountId).eq("practice_id", practiceId).eq("is_active", true).maybeSingle();
  if (!account) return { error: "Chart of accounts entry not found" };
  const { error } = await supabase.from("bookkeeping_vendor_rules").update({
    bookkeeping_account_id: parsed.data.bookkeepingAccountId,
    source: "review",
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }).eq("id", parsed.data.ruleId).eq("practice_id", practiceId);
  if (error) return { error: error.message };
  revalidateFinancialWorkspace();
  return { success: true };
}

export async function deleteFinancialRule(ruleId: string) {
  const parsed = ruleIdSchema.safeParse(ruleId);
  if (!parsed.success) return { error: "Invalid rule" };
  const { supabase, practiceId } = await requireFinancialAccess();
  const { error } = await supabase.from("bookkeeping_vendor_rules").delete()
    .eq("id", parsed.data).eq("practice_id", practiceId);
  if (error) return { error: error.message };
  revalidateFinancialWorkspace();
  return { success: true };
}

export async function setBookkeepingAutoRuleEnabled(input: unknown) {
  const parsed = autoRuleSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid automatic rule update" };
  const { supabase, practiceId } = await requireFinancialAccess();
  const { error } = await supabase.from("bookkeeping_auto_rules")
    .update({ is_enabled: parsed.data.isEnabled, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.ruleId).eq("practice_id", practiceId);
  if (error) return { error: error.message };
  revalidateFinancialWorkspace();
  return { success: true };
}

export async function createBookkeepingAccount(input: unknown) {
  const parsed = bookkeepingAccountSchema.safeParse(input);
  if (!parsed.success) return { error: firstValidationError(parsed.error) };

  const { supabase, practiceId } = await requireFinancialAccess();
  const { data: existingAccounts, error: lookupError } = await supabase
    .from("bookkeeping_accounts")
    .select("id, name, is_active")
    .eq("practice_id", practiceId);
  if (lookupError) return { error: lookupError.message };

  const existing = (existingAccounts ?? []).find(
    (account) => String(account.name).trim().toLowerCase() === parsed.data.name.toLowerCase(),
  );
  if (existing?.is_active) return { error: "An active account with this name already exists" };

  const values = {
    account_number: parsed.data.accountNumber || null,
    name: parsed.data.name,
    account_type: parsed.data.accountType,
    detail_type: parsed.data.detailType || null,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase.from("bookkeeping_accounts").update(values)
      .eq("id", existing.id).eq("practice_id", practiceId);
    if (error) return { error: friendlyAccountError(error) };
    revalidateFinancialWorkspace();
    return { success: true, disposition: "restored" as const };
  }

  const { error } = await supabase.from("bookkeeping_accounts").insert({
    practice_id: practiceId,
    external_source: "manual",
    ...values,
  });
  if (error) return { error: friendlyAccountError(error) };
  revalidateFinancialWorkspace();
  return { success: true, disposition: "created" as const };
}

export async function updateBookkeepingAccount(input: unknown) {
  const parsed = updateBookkeepingAccountSchema.safeParse(input);
  if (!parsed.success) return { error: firstValidationError(parsed.error) };

  const { supabase, practiceId } = await requireFinancialAccess();
  const { data: account, error: lookupError } = await supabase.from("bookkeeping_accounts")
    .select("id").eq("id", parsed.data.accountId).eq("practice_id", practiceId).eq("is_active", true).maybeSingle();
  if (lookupError) return { error: lookupError.message };
  if (!account) return { error: "Chart of accounts entry not found" };

  const { error } = await supabase.from("bookkeeping_accounts").update({
    account_number: parsed.data.accountNumber || null,
    name: parsed.data.name,
    account_type: parsed.data.accountType,
    detail_type: parsed.data.detailType || null,
    updated_at: new Date().toISOString(),
  }).eq("id", parsed.data.accountId).eq("practice_id", practiceId);
  if (error) return { error: friendlyAccountError(error) };
  revalidateFinancialWorkspace();
  return { success: true };
}

export async function deleteBookkeepingAccount(accountId: string) {
  const parsed = bookkeepingAccountIdSchema.safeParse(accountId);
  if (!parsed.success) return { error: "Invalid chart of accounts entry" };

  const { supabase, practiceId } = await requireFinancialAccess();
  const { data: account, error: lookupError } = await supabase.from("bookkeeping_accounts")
    .select("id").eq("id", parsed.data).eq("practice_id", practiceId).eq("is_active", true).maybeSingle();
  if (lookupError) return { error: lookupError.message };
  if (!account) return { error: "Chart of accounts entry not found" };

  const references = await Promise.all([
    supabase.from("financial_transactions").select("id", { count: "exact", head: true })
      .eq("practice_id", practiceId).eq("bookkeeping_account_id", parsed.data),
    supabase.from("accounting_journal_lines").select("id", { count: "exact", head: true })
      .eq("practice_id", practiceId).eq("bookkeeping_account_id", parsed.data),
    supabase.from("financial_loans").select("id", { count: "exact", head: true })
      .eq("practice_id", practiceId).eq("bookkeeping_account_id", parsed.data),
  ]);
  const referenceError = references.find((result) => result.error)?.error;
  if (referenceError) return { error: referenceError.message };

  const isInUse = references.some((result) => (result.count ?? 0) > 0);
  if (isInUse) {
    const { error } = await supabase.from("bookkeeping_accounts").update({
      is_active: false,
      updated_at: new Date().toISOString(),
    }).eq("id", parsed.data).eq("practice_id", practiceId);
    if (error) return { error: error.message };

    const { error: ruleError } = await supabase.from("bookkeeping_vendor_rules").delete()
      .eq("practice_id", practiceId).eq("bookkeeping_account_id", parsed.data);
    if (ruleError) return { error: ruleError.message };
    revalidateFinancialWorkspace();
    return { success: true, disposition: "archived" as const };
  }

  const { error } = await supabase.from("bookkeeping_accounts").delete()
    .eq("id", parsed.data).eq("practice_id", practiceId);
  if (error?.code === "23503") {
    const { error: archiveError } = await supabase.from("bookkeeping_accounts").update({
      is_active: false,
      updated_at: new Date().toISOString(),
    }).eq("id", parsed.data).eq("practice_id", practiceId);
    if (archiveError) return { error: archiveError.message };
    const { error: ruleError } = await supabase.from("bookkeeping_vendor_rules").delete()
      .eq("practice_id", practiceId).eq("bookkeeping_account_id", parsed.data);
    if (ruleError) return { error: ruleError.message };
    revalidateFinancialWorkspace();
    return { success: true, disposition: "archived" as const };
  }
  if (error) return { error: error.message };
  revalidateFinancialWorkspace();
  return { success: true, disposition: "deleted" as const };
}

function revalidateFinancialWorkspace() {
  revalidatePath("/admin/financial");
  revalidatePath("/admin/financial/accounts");
  revalidatePath("/admin/financial/rules");
  revalidatePath("/admin/financial/loans");
  revalidatePath("/admin/financial/reports");
  revalidatePath("/admin/financial-transactions");
}

function firstValidationError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid chart of accounts entry";
}

function friendlyAccountError(error: { code?: string; message: string }) {
  if (error.code === "23505") return "An account with this name already exists";
  return error.message;
}

function summarizeTransactions(
  transactions: Array<Pick<FinancialTransaction, "amount_cents" | "review_status" | "bookkeeping_account_id">>,
  accountById: Map<string, BookkeepingAccount>,
) {
  let revenueCents = 0;
  let expenseCents = 0;
  for (const transaction of transactions) {
    if (transaction.review_status !== "reviewed" || !transaction.bookkeeping_account_id) continue;
    const account = accountById.get(transaction.bookkeeping_account_id);
    if (!account) continue;
    if (isIncomeType(account.accountType) && transaction.amount_cents < 0) revenueCents += Math.abs(transaction.amount_cents);
    if (isExpenseType(account.accountType) && transaction.amount_cents > 0) expenseCents += transaction.amount_cents;
  }
  return { revenueCents, expenseCents };
}

function isIncomeType(value: string) {
  return /(income|revenue)/i.test(value) && !/other current/i.test(value);
}

function isExpenseType(value: string) {
  return /(expense|cost of goods|cogs)/i.test(value);
}

function toPhoenixDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}
