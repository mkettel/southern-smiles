"use server";

import { requireMemberModuleAccess } from "@/actions/member-module-access";
import { buildCashFlowReport, cashFlowMonthEnd, cashFlowToday, type CashFlowData, type CashFlowLine } from "@/lib/financial-cash-flow";
import { financialWorkspaceMonthCount, getFinancialWorkspaceMonthFrames } from "@/lib/financial-workspace";

export async function getFinancialCashFlowData(requestedMonth?: string): Promise<CashFlowData> {
  const { supabase, practiceId } = await requireMemberModuleAccess("financial");
  const now = new Date();
  const today = cashFlowToday(now);
  const month = requestedMonth ?? today.slice(0, 7);
  const end = cashFlowMonthEnd(month);
  if (month > today.slice(0, 7)) throw new Error("Future cash-flow month");
  const through = end < today ? end : today;
  const { data: accounts, error: accountsError } = await supabase.from("financial_accounts")
    .select("id, name, nickname, mask, currency_code")
    .eq("practice_id", practiceId).eq("included_in_bookkeeping", true).eq("account_type", "depository");
  if (accountsError) throw new Error(accountsError.message);
  const cashAccounts = (accounts ?? []).filter((a) => a.currency_code === "USD");
  const ids = cashAccounts.map((a) => a.id as string);
  const names = new Map(cashAccounts.map((a) => [a.id, `${a.nickname || a.name}${a.mask ? ` ·${a.mask}` : ""}`]));
  const { data: firstEntry, error: firstError } = await supabase.from("accounting_journal_entries")
    .select("entry_date").eq("practice_id", practiceId).eq("status", "posted").lte("entry_date", today)
    .order("entry_date").limit(1).maybeSingle();
  if (firstError) throw new Error(firstError.message);
  const frames = getFinancialWorkspaceMonthFrames(now, financialWorkspaceMonthCount(firstEntry?.entry_date, now));
  if (!frames.some((f) => f.key === month)) throw new Error("Month outside posted history");
  const lines: CashFlowLine[] = [];
  if (ids.length) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from("accounting_journal_lines")
        .select("id, journal_entry_id, financial_account_id, debit_cents, credit_cents, accounting_journal_entries!inner(entry_date, description, source_type, status)")
        .eq("practice_id", practiceId).eq("accounting_journal_entries.practice_id", practiceId)
        .in("financial_account_id", ids).eq("accounting_journal_entries.status", "posted")
        .gte("accounting_journal_entries.entry_date", `${month}-01`).lte("accounting_journal_entries.entry_date", through)
        .order("id").range(offset, offset + 999);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        const entry = Array.isArray(row.accounting_journal_entries) ? row.accounting_journal_entries[0] : row.accounting_journal_entries;
        if (!entry) throw new Error("Missing cash-flow journal");
        lines.push({ id: row.id, entryId: row.journal_entry_id, account: names.get(row.financial_account_id) ?? "Bank account", date: entry.entry_date, description: entry.description, sourceType: entry.source_type, status: entry.status, debitCents: Number(row.debit_cents), creditCents: Number(row.credit_cents) });
      }
      if ((data?.length ?? 0) < 1000) break;
    }
  }
  const count = async (pending: boolean) => {
    if (!ids.length) return 0;
    const { count, error } = await supabase.from("financial_transactions").select("id", { count: "exact", head: true })
      .eq("practice_id", practiceId).in("account_id", ids).eq("is_removed", false).eq("pending", pending)
      .eq("review_status", "pending").gte("transaction_date", `${month}-01`).lte("transaction_date", through);
    if (error) throw new Error(error.message);
    return count ?? 0;
  };
  const [unpostedCount, settlingCount] = await Promise.all([count(false), count(true)]);
  return { report: buildCashFlowReport(month, lines, today), months: frames.reverse().map((f) => ({ key: f.key, label: f.longLabel })), accountNames: [...names.values()], unpostedCount, settlingCount, unsupportedCurrencyCount: (accounts?.length ?? 0) - ids.length };
}
