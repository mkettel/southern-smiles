import assert from "node:assert/strict";
import test from "node:test";
import {
  assertBalancedJournalLines,
  buildCategorizedTransactionLines,
  buildTransferLines,
} from "./accounting-ledger";

test("an outflow debits its category and credits its financial account", () => {
  const lines = buildCategorizedTransactionLines({
    amountCents: 4250,
    financialAccountId: "checking",
    bookkeepingAccountId: "groceries",
  });
  assert.deepEqual(lines, [
    { accountKind: "bookkeeping", accountId: "groceries", debitCents: 4250, creditCents: 0 },
    { accountKind: "financial", accountId: "checking", debitCents: 0, creditCents: 4250 },
  ]);
  assert.doesNotThrow(() => assertBalancedJournalLines(lines));
});

test("an inflow debits its financial account and credits income", () => {
  const lines = buildCategorizedTransactionLines({
    amountCents: -90000,
    financialAccountId: "checking",
    bookkeepingAccountId: "income",
  });
  assert.deepEqual(lines, [
    { accountKind: "financial", accountId: "checking", debitCents: 90000, creditCents: 0 },
    { accountKind: "bookkeeping", accountId: "income", debitCents: 0, creditCents: 90000 },
  ]);
});

test("a transfer has no income or expense line", () => {
  const lines = buildTransferLines({
    amountCents: 120000,
    financialAccountId: "checking",
    otherFinancialAccountId: "credit-card",
  });
  assert.deepEqual(lines, [
    { accountKind: "financial", accountId: "checking", debitCents: 0, creditCents: 120000 },
    { accountKind: "financial", accountId: "credit-card", debitCents: 120000, creditCents: 0 },
  ]);
  assert.doesNotThrow(() => assertBalancedJournalLines(lines));
});

test("a transfer cannot point back to the same account", () => {
  assert.throws(() => buildTransferLines({
    amountCents: 100,
    financialAccountId: "checking",
    otherFinancialAccountId: "checking",
  }), /different accounts/);
});
