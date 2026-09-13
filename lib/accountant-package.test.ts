import assert from "node:assert/strict";
import test from "node:test";
import { buildAccountantPackage, toCsv, type AccountantPackageInput } from "./accountant-package";

function fixture(): AccountantPackageInput {
  return {
    practiceId: "practice", from: "2026-01-01", through: "2026-08-31",
    entries: [{ id: "payment", practice_id: "practice", entry_date: "2026-08-01", status: "posted",
      description: "Loan payment", memo: null, source_type: "bank_transaction", source_transaction_id: "source" }],
    lines: [
      { id: "1", practice_id: "practice", journal_entry_id: "payment", financial_account_id: "bank", bookkeeping_account_id: null, debit_cents: 0, credit_cents: 10000, memo: null },
      { id: "2", practice_id: "practice", journal_entry_id: "payment", financial_account_id: null, bookkeeping_account_id: "loan", debit_cents: 9000, credit_cents: 0, memo: "Principal" },
      { id: "3", practice_id: "practice", journal_entry_id: "payment", financial_account_id: null, bookkeeping_account_id: "interest", debit_cents: 1000, credit_cents: 0, memo: "Interest" },
    ],
    bookkeepingAccounts: [
      { id: "loan", name: "Loan", account_type: "Long Term Liabilities", is_active: true },
      { id: "interest", name: "Interest", account_type: "Expenses", is_active: true },
    ],
    financialAccounts: [{ id: "bank", name: "Bank", account_type: "depository", is_active: false }],
  };
}

test("retains principal, interest, inactive accounts and source references without claiming finalization", () => {
  const result = buildAccountantPackage(fixture());
  assert.equal(result.journal.length, 3);
  assert.equal(result.journal[1].line_memo, "Principal");
  assert.equal(result.journal[0].source_transaction_id, "source");
  assert.equal(result.account_activity.find((a) => a.account_key === "financial:bank")?.closing_net_cents, -10000);
  assert.equal(result.status, "draft_ledger_extract");
  assert.equal(result.accounting_basis, "as_recorded_not_converted");
});

test("separates pre-period activity from in-period journal", () => {
  const input = fixture();
  input.from = "2026-08-02";
  const result = buildAccountantPackage(input);
  assert.equal(result.journal.length, 0);
  const bank = result.account_activity.find((a) => a.account_key === "financial:bank")!;
  assert.equal(bank.opening_net_cents, -10000);
  assert.equal(bank.period_credit_cents, 0);
});

test("excludes draft and future entries", () => {
  const input = fixture();
  input.entries[0].status = "draft";
  assert.equal(buildAccountantPackage(input).excluded_nonposted_entries, 1);
  assert.equal(buildAccountantPackage(input).journal.length, 0);
  input.entries[0].status = "voided";
  assert.equal(buildAccountantPackage(input).journal.length, 0);
  input.entries[0].status = "posted";
  input.entries[0].entry_date = "2026-09-01";
  assert.equal(buildAccountantPackage(input).account_activity.length, 0);
});

test("rejects duplicate IDs, orphan lines and missing accounts", () => {
  let input = fixture();
  input.lines.push(input.lines[0]);
  assert.throws(() => buildAccountantPackage(input), /Duplicate line/);
  input = fixture(); input.lines[0].journal_entry_id = "missing";
  assert.throws(() => buildAccountantPackage(input), /Orphan/);
  input = fixture(); input.bookkeepingAccounts = [];
  assert.throws(() => buildAccountantPackage(input), /Unknown account/);
});

test("rejects mixed practices", () => {
  let input = fixture(); input.entries[0].practice_id = "other";
  assert.throws(() => buildAccountantPackage(input), /Cross-practice/);
  input = fixture(); input.lines[0].practice_id = "other";
  assert.throws(() => buildAccountantPackage(input), /Cross-practice/);
});

test("rejects unbalanced, fractional, negative and double-sided posted lines", () => {
  for (const value of [9999, 0.1, -100, Number.NaN, Infinity]) {
    const input = fixture(); input.lines[0].credit_cents = value;
    assert.throws(() => buildAccountantPackage(input));
  }
  const input = fixture(); input.lines[0].debit_cents = 100;
  assert.throws(() => buildAccountantPackage(input), /Invalid posted line/);
});

test("rejects multiple account references and unsafe totals", () => {
  const input = fixture(); input.lines[0].bookkeeping_account_id = "loan";
  assert.throws(() => buildAccountantPackage(input), /exactly one/);
  const huge = fixture();
  huge.lines[0].credit_cents = Number.MAX_SAFE_INTEGER;
  huge.lines[1].debit_cents = Number.MAX_SAFE_INTEGER;
  assert.throws(() => buildAccountantPackage(huge), /safe integer/);
});

test("rejects invalid dates and reversed periods", () => {
  const input = fixture(); input.entries[0].entry_date = "2026-02-30";
  assert.throws(() => buildAccountantPackage(input));
  input.entries[0].entry_date = "2026-08-01"; input.from = "2026-09-01";
  assert.throws(() => buildAccountantPackage(input), /Invalid report period/);
});

test("deterministic journal and account ordering", () => {
  const input = fixture();
  const expected = buildAccountantPackage(input);
  input.lines.reverse(); input.bookkeepingAccounts.reverse();
  assert.deepEqual(buildAccountantPackage(input), expected);
});

test("CSV escapes formulas, quotes and multiline text while leaving numeric negatives numeric", () => {
  assert.equal(toCsv([["=1+1", " @SUM(A1)", 'a"b\nc', -100, null]]),
    '"\'=1+1","\' @SUM(A1)","a""b\nc","-100",""\r\n');
});
