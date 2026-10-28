import assert from "node:assert/strict";
import test from "node:test";
import { buildCashFlowReport, cashFlowCsv, cashFlowMonthEnd, cashFlowToday, type CashFlowLine } from "./financial-cash-flow";

const line = (id: string, amount: number, overrides: Partial<CashFlowLine> = {}): CashFlowLine => ({ id, entryId: id, date: "2026-09-02", description: id, account: "Checking", debitCents: Math.max(0, amount), creditCents: Math.max(0, -amount), sourceType: "bank_transaction", status: "posted", ...overrides });
test("nets internal bank transfers but retains full card and loan cash payments", () => {
  const r = buildCashFlowReport("2026-09", [line("receipt", 100000), line("transfer-out", -50000, {entryId: "transfer"}), line("transfer-in", 50000, {entryId: "transfer", account: "Savings"}), line("card-payment", -30000), line("loan-payment", -108401)], "2026-10-27");
  assert.equal(r.inflowCents, 100000);
  assert.equal(r.outflowCents, 138401);
  assert.equal(r.netCents, -38401);
  assert.equal(r.weeks[0].activity.length, 3);
  assert.match(cashFlowCsv(r), /-384.01/);
});
test("excludes opening balances, voids, and dates outside the reporting window", () => {
  const r = buildCashFlowReport("2026-09", [line("opening", 999999, {sourceType: "opening_balance"}), line("void", 900, {status: "voided"}), line("old", 700, {date: "2026-08-31"}), line("future", 500, {date: "2026-09-29"})], "2026-09-21");
  assert.equal(r.netCents, 0);
  assert.equal(r.through, "2026-09-21");
  assert.equal(r.weeks.at(-1)?.end, "2026-09-21");
});
test("weeks are Monday-Sunday clipped to month boundaries", () => {
  const r = buildCashFlowReport("2026-09", [], "2026-10-27");
  assert.deepEqual(r.weeks.map(w => [w.start,w.end]), [["2026-09-01","2026-09-06"],["2026-09-07","2026-09-13"],["2026-09-14","2026-09-20"],["2026-09-21","2026-09-27"],["2026-09-28","2026-09-30"]]);
  assert.equal(cashFlowMonthEnd("2024-02"), "2024-02-29");
  assert.equal(cashFlowToday(new Date("2026-10-28T02:00:00Z")), "2026-10-27");
});
test("rejects duplicate lines, invalid cents, and future months", () => {
  assert.throws(() => buildCashFlowReport("2026-09", [line("a", 1), line("a", 1)], "2026-10-27"), /Duplicate/);
  assert.throws(() => buildCashFlowReport("2026-09", [line("a", 1.2)], "2026-10-27"), /Invalid/);
  assert.throws(() => buildCashFlowReport("2026-11", [], "2026-10-27"), /Future/);
});
