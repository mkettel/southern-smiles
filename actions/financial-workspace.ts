"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { transactionDisplayName, type BookkeepingAccount, type FinancialTransaction } from "@/lib/financial-transactions";
import { buildFinancialReportsData, type FinancialReportsData } from "@/lib/financial-reports";
import type { FinancialWorkspaceData, FinancialWorkspaceRule } from "@/lib/financial-workspace";
import { requireWorkspaceModule } from "@/actions/workspace-access";

const updateRuleSchema = z.object({
  ruleId: z.string().uuid(),
  bookkeepingAccountId: z.string().uuid(),
});
const ruleIdSchema = z.string().uuid();

async function requireAdmin() {
  await requireWorkspaceModule("financial");
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
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

export async function getFinancialWorkspaceData(): Promise<FinancialWorkspaceData> {
  const { supabase, practiceId } = await requireAdmin();
  const today = new Date();
  const monthFrames = getMonthFrames(today, 6);
  const periodStart = monthFrames[0].start;
  const periodEnd = monthFrames.at(-1)!.end;
  const current = monthFrames.at(-1)!;

  const [accountResult, ruleResult, connectionResult, financialAccountResult, overdueResult] = await Promise.all([
    supabase.from("bookkeeping_accounts")
      .select("id, account_number, name, account_type, detail_type, external_source")
      .eq("practice_id", practiceId).eq("is_active", true)
      .order("account_type").order("account_number", { nullsFirst: false }).order("name"),
    supabase.from("bookkeeping_vendor_rules")
      .select("id, normalized_vendor, match_type, bookkeeping_account_id, source, sample_count, confidence, updated_at")
      .eq("practice_id", practiceId).order("updated_at", { ascending: false }),
    supabase.from("financial_connections")
      .select("id, transactions_last_synced_at")
      .eq("practice_id", practiceId).neq("status", "disconnected"),
    supabase.from("financial_accounts")
      .select("id").eq("practice_id", practiceId).eq("is_active", true).eq("included_in_bookkeeping", true),
    supabase.from("bills").select("id", { count: "exact", head: true })
      .eq("practice_id", practiceId).eq("status", "unpaid").lt("due_date", toPhoenixDate(today)),
  ]);

  for (const result of [accountResult, ruleResult, connectionResult, financialAccountResult, overdueResult]) {
    if (result.error) throw new Error(result.error.message);
  }
  const includedAccountIds = (financialAccountResult.data ?? []).map((account) => account.id as string);
  const [transactions, pendingCount, unmatchedTransferCount] = includedAccountIds.length
    ? await Promise.all([
        getWorkspaceTransactions(supabase, practiceId, includedAccountIds, periodStart, periodEnd),
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
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const months = monthFrames.map((frame) => {
    const totals = summarizeTransactions(
      transactions.filter((transaction) => transaction.transaction_date >= frame.start && transaction.transaction_date < frame.end),
      accountById,
    );
    return { key: frame.start.slice(0, 7), label: frame.shortLabel, ...totals };
  });
  const currentTransactions = transactions.filter(
    (transaction) => transaction.transaction_date >= current.start && transaction.transaction_date < current.end,
  );
  const currentTotals = summarizeTransactions(currentTransactions, accountById);
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
    revenueCents: currentTotals.revenueCents,
    expenseCents: currentTotals.expenseCents,
    netIncomeCents: currentTotals.revenueCents - currentTotals.expenseCents,
    pendingCount,
    unmatchedTransferCount,
    overdueBillCount: overdueResult.count ?? 0,
    connectedInstitutionCount: connectionResult.data?.length ?? 0,
    includedBankAccountCount: financialAccountResult.data?.length ?? 0,
    lastSyncedAt: (connectionResult.data ?? [])
      .map((connection) => connection.transactions_last_synced_at as string | null)
      .filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
    months,
    recentActivity: transactions.slice(0, 8).map((transaction) => {
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
    }),
    expenseBreakdown: [...expenseByAccount.entries()]
      .map(([name, amountCents]) => ({ name, amountCents }))
      .sort((a, b) => b.amountCents - a.amountCents).slice(0, 8),
    accounts,
    rules,
  };
}

export async function getFinancialReportsData(): Promise<FinancialReportsData> {
  const { supabase, practiceId } = await requireAdmin();
  const [accountResult, financialAccountResult] = await Promise.all([
    supabase.from("bookkeeping_accounts")
      .select("id, account_number, name, account_type, detail_type, external_source")
      .eq("practice_id", practiceId).eq("is_active", true)
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
  periodStart: string,
  periodEnd: string,
) {
  const rows: WorkspaceTransaction[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from("financial_transactions")
      .select("id, transaction_date, merchant_name, counterparty_name, name, amount_cents, review_status, category_source, bookkeeping_account_id, is_removed, pending")
      .eq("practice_id", practiceId).eq("is_removed", false).eq("pending", false)
      .in("account_id", accountIds)
      .gte("transaction_date", periodStart).lt("transaction_date", periodEnd)
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
  const { supabase, practiceId, userId } = await requireAdmin();
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
  const { supabase, practiceId } = await requireAdmin();
  const { error } = await supabase.from("bookkeeping_vendor_rules").delete()
    .eq("id", parsed.data).eq("practice_id", practiceId);
  if (error) return { error: error.message };
  revalidateFinancialWorkspace();
  return { success: true };
}

function revalidateFinancialWorkspace() {
  revalidatePath("/admin/financial");
  revalidatePath("/admin/financial/rules");
  revalidatePath("/admin/financial-transactions");
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

function getMonthFrames(now: Date, count: number) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: "America/Phoenix", year: "numeric", month: "numeric" });
  const parts = formatter.formatToParts(now);
  const currentYear = Number(parts.find((part) => part.type === "year")?.value);
  const currentMonthIndex = Number(parts.find((part) => part.type === "month")?.value) - 1;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(currentYear, currentMonthIndex - (count - 1 - index), 1));
    const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      start: `${year}-${String(month).padStart(2, "0")}-01`,
      end: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`,
      shortLabel: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date),
      longLabel: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(date),
      dateRange: `${new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(date)} 1–${days}, ${year}`,
    };
  });
}

function toPhoenixDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}
