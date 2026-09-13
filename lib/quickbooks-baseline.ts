import { z } from "zod";
import { buildAccountantPackage, packageInputSchema } from "./accountant-package";
import type { BookkeepingAccount } from "./financial-transactions";

const baselineSchema = packageInputSchema.extend({
  version: z.literal(1),
  openingDate: z.string(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  expectedEntryCount: z.number().int().positive(),
  expectedLineCount: z.number().int().positive(),
  closingBalances: z.record(z.string(), z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)),
});
export type QuickBooksBaseline = z.infer<typeof baselineSchema>;

/** Fail closed on a partial or altered baseline, including balanced omissions. */
export function validateQuickBooksBaseline(raw: unknown, practiceId: string) {
  const baseline = baselineSchema.parse(raw);
  if (baseline.practiceId !== practiceId) throw new Error("Cross-practice baseline");
  if (baseline.entries.length !== baseline.expectedEntryCount || baseline.lines.length !== baseline.expectedLineCount) {
    throw new Error("Incomplete baseline");
  }
  const dayBefore = new Date(`${baseline.from}T00:00:00Z`);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  if (baseline.openingDate !== dayBefore.toISOString().slice(0, 10)) throw new Error("Invalid baseline opening date");
  const opening = baseline.entries.filter(e => e.entry_date === baseline.openingDate);
  if (opening.length !== 1) throw new Error("Expected exactly one opening entry");
  if (baseline.entries.some(e => e.status !== "posted" ||
    (e.entry_date !== baseline.openingDate && (e.entry_date < baseline.from || e.entry_date > baseline.through)))) {
    throw new Error("Baseline entry outside approved period");
  }
  if (baseline.financialAccounts.length || baseline.lines.some(l => l.financial_account_id)) {
    throw new Error("Baseline must retain independent source accounts");
  }
  if (baseline.bookkeepingAccounts.some(a => !a.id.startsWith("qb:"))) throw new Error("Source account namespace required");
  const extract = buildAccountantPackage(baseline);
  const actual = new Map(extract.account_activity.map(a => [a.account_key.slice("bookkeeping:".length), a.closing_net_cents]));
  const known = new Set(baseline.bookkeepingAccounts.map(a => a.id));
  for (const id of Object.keys(baseline.closingBalances)) {
    if (!known.has(id)) throw new Error("Unknown closing account");
  }
  for (const id of new Set([...actual.keys(), ...Object.keys(baseline.closingBalances)])) {
    if ((actual.get(id) ?? 0) !== (baseline.closingBalances[id] ?? 0)) throw new Error("Baseline closing balance mismatch");
  }
  return { baseline, extract };
}

type ReportRow = { transaction_date: string; amount_cents: number; bookkeeping_account_id: string | null };
export function applyQuickBooksBaseline(raw: unknown, practiceId: string, accounts: BookkeepingAccount[], rows: ReportRow[]) {
  const { baseline } = validateQuickBooksBaseline(raw, practiceId);
  const sourceIds = new Set(baseline.bookkeepingAccounts.map(a => a.id));
  if (accounts.some(a => sourceIds.has(a.id))) throw new Error("Source and Board account collision");
  const entryDates = new Map(baseline.entries.map(e => [e.id, e.entry_date]));
  const transactions = rows.filter(r => r.transaction_date < baseline.from || r.transaction_date > baseline.through);
  for (const line of baseline.lines) {
    const date = entryDates.get(line.journal_entry_id)!;
    if (date === baseline.openingDate) continue;
    transactions.push({ transaction_date: date, amount_cents: line.debit_cents - line.credit_cents,
      bookkeeping_account_id: line.bookkeeping_account_id });
  }
  return {
    baselinePeriod: { from: baseline.from, through: baseline.through },
    accounts: [...accounts, ...baseline.bookkeepingAccounts.map(a => ({ id: a.id, name: a.name,
      accountType: a.account_type, accountNumber: null, detailType: null, externalSource: "quickbooks" as const }))],
    transactions,
  };
}
