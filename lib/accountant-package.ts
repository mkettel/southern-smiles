import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  (value) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
  "Invalid calendar date",
);
const id = z.string().min(1);
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const entrySchema = z.object({
  id, practice_id: id, entry_date: date, status: z.enum(["draft", "posted", "voided"]),
  description: z.string().nullable(), memo: z.string().nullable(), source_type: z.string(),
  source_transaction_id: id.nullable(),
});
const lineSchema = z.object({
  id, practice_id: id, journal_entry_id: id,
  financial_account_id: id.nullable(), bookkeeping_account_id: id.nullable(),
  debit_cents: cents, credit_cents: cents, memo: z.string().nullable(),
});
const accountSchema = z.object({
  id, name: z.string(), account_type: z.string(), is_active: z.boolean(),
});
export const packageInputSchema = z.object({
  practiceId: id, from: date, through: date,
  entries: z.array(entrySchema), lines: z.array(lineSchema),
  bookkeepingAccounts: z.array(accountSchema), financialAccounts: z.array(accountSchema),
});
export type AccountantPackageInput = z.infer<typeof packageInputSchema>;

function unique<T extends { id: string }>(rows: T[], label: string) {
  const result = new Map(rows.map((row) => [row.id, row]));
  if (result.size !== rows.length) throw new Error(`Duplicate ${label} IDs`);
  return result;
}

function add(a: number, b: number) {
  const result = a + b;
  if (!Number.isSafeInteger(result)) throw new Error("Monetary total exceeds safe integer range");
  return result;
}

// This is a ledger extract, not an accrual-to-cash conversion or a completeness certification.
export function buildAccountantPackage(raw: AccountantPackageInput) {
  const input = packageInputSchema.parse(raw);
  if (input.from > input.through) throw new Error("Invalid report period");
  const entries = unique(input.entries, "entry");
  unique(input.lines, "line");
  const books = unique(input.bookkeepingAccounts, "bookkeeping account");
  const banks = unique(input.financialAccounts, "financial account");
  const byEntry = new Map<string, typeof input.lines>();
  for (const entry of input.entries) {
    if (entry.practice_id !== input.practiceId) throw new Error("Cross-practice entry");
  }
  for (const line of input.lines) {
    if (line.practice_id !== input.practiceId) throw new Error("Cross-practice line");
    if (!entries.has(line.journal_entry_id)) throw new Error("Orphan journal line");
    if (Boolean(line.financial_account_id) === Boolean(line.bookkeeping_account_id)) {
      throw new Error("Journal line must reference exactly one account");
    }
    if (!(line.financial_account_id ? banks : books).has((line.financial_account_id ?? line.bookkeeping_account_id)!)) {
      throw new Error("Unknown account reference");
    }
    const group = byEntry.get(line.journal_entry_id) ?? [];
    group.push(line);
    byEntry.set(line.journal_entry_id, group);
  }
  const selected = input.entries.filter((entry) => entry.status === "posted" && entry.entry_date <= input.through)
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.id.localeCompare(b.id));
  const journal = [];
  const totals = new Map<string, {
    account_key: string; account_name: string; account_type: string; active: boolean;
    opening_net_cents: number; period_debit_cents: number; period_credit_cents: number; closing_net_cents: number;
  }>();
  for (const entry of selected) {
    const lines = (byEntry.get(entry.id) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));
    let debits = 0, credits = 0;
    for (const line of lines) {
      if (Boolean(line.debit_cents) === Boolean(line.credit_cents)) throw new Error(`Invalid posted line: ${line.id}`);
      debits = add(debits, line.debit_cents);
      credits = add(credits, line.credit_cents);
    }
    if (lines.length < 2 || debits !== credits) throw new Error(`Unbalanced posted entry: ${entry.id}`);
    for (const line of lines) {
      const financial = Boolean(line.financial_account_id);
      const accountId = (line.financial_account_id ?? line.bookkeeping_account_id)!;
      const account = (financial ? banks : books).get(accountId)!;
      const key = `${financial ? "financial" : "bookkeeping"}:${accountId}`;
      const total = totals.get(key) ?? {
        account_key: key, account_name: account.name, account_type: account.account_type, active: account.is_active,
        opening_net_cents: 0, period_debit_cents: 0, period_credit_cents: 0, closing_net_cents: 0,
      };
      const net = line.debit_cents - line.credit_cents;
      if (entry.entry_date < input.from) total.opening_net_cents = add(total.opening_net_cents, net);
      else {
        total.period_debit_cents = add(total.period_debit_cents, line.debit_cents);
        total.period_credit_cents = add(total.period_credit_cents, line.credit_cents);
        journal.push({
          entry_id: entry.id, line_id: line.id, date: entry.entry_date,
          description: entry.description, entry_memo: entry.memo, line_memo: line.memo,
          source_type: entry.source_type, source_transaction_id: entry.source_transaction_id,
          account_key: key, account_name: account.name, account_type: account.account_type,
          debit_cents: line.debit_cents, credit_cents: line.credit_cents,
        });
      }
      total.closing_net_cents = add(total.closing_net_cents, net);
      totals.set(key, total);
    }
  }
  return {
    schema_version: 1, status: "draft_ledger_extract" as const,
    practice_id: input.practiceId, from: input.from, through: input.through,
    accounting_basis: "as_recorded_not_converted" as const,
    warnings: [
      "Not a finalized tax package. Balanced journals do not establish completeness or reconciliation.",
      "Opening and closing activity totals reflect only supplied ledger history, not accepted trial balances.",
      "All posted account activity is retained, including inactive accounts; account inclusion requires review.",
    ],
    required_evidence: [
      "Accepted opening balances and historical import tie-out",
      "Complete period ledger and approved adjusting entries",
      "Bank and credit-card reconciliations with statements",
      "Cash-basis P&L, balance sheet and trial balance tied to accepted ledger",
      "Fixed-asset purchases, disposals and depreciation schedule",
      "Loan balances and principal/interest schedules",
      "Payroll reports and filings (QuickBooks Q1-Q3; ADP Q4 if transition completes)",
      "Contractor payment review and secure W-9 references",
      "Owner contributions, distributions and shareholder loan review",
      "Accountant questions, prior returns and secure supporting-document index",
    ],
    excluded_nonposted_entries: input.entries.filter((e) => e.status !== "posted" && e.entry_date >= input.from && e.entry_date <= input.through).length,
    journal,
    account_activity: [...totals.values()].sort((a, b) => a.account_key.localeCompare(b.account_key)),
  };
}

export function toCsv(rows: (string | number | null)[][]) {
  return rows.map((row) => row.map((value) => {
    let text = value === null ? "" : String(value);
    // Preserve numeric negatives while preventing spreadsheet execution of untrusted text.
    if (typeof value === "string" && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n") + "\r\n";
}
