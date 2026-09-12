import assert from "node:assert/strict";
import test from "node:test";
import {
  accountKind,
  buildHouseholdFinanceData,
  categoryLabel,
  shiftMonthKey,
  type HouseholdAccountRow,
  type HouseholdTransactionRow,
} from "./household-finance";

const checking: HouseholdAccountRow = {
  id: "chk",
  name: "Everyday Checking",
  nickname: null,
  mask: "0235",
  account_type: "depository",
  account_subtype: "checking",
  current_balance_cents: 978_400,
  available_balance_cents: 978_400,
  credit_limit_cents: null,
  minimum_payment_cents: null,
  next_payment_due_date: null,
  last_synced_at: "2026-09-11T10:00:00Z",
  institution_name: "Bank of Test",
};

const savings: HouseholdAccountRow = {
  ...checking,
  id: "sav",
  name: "Rainy Day",
  mask: "9040",
  account_subtype: "savings",
  current_balance_cents: 500_000,
};

const card: HouseholdAccountRow = {
  ...checking,
  id: "card",
  name: "Cash Rewards",
  nickname: "Blue card",
  mask: "3881",
  account_type: "credit",
  account_subtype: "credit card",
  current_balance_cents: 1_264_400,
  available_balance_cents: null,
  credit_limit_cents: 3_850_000,
  minimum_payment_cents: 25_000,
  next_payment_due_date: "2026-09-28",
};

function txn(overrides: Partial<HouseholdTransactionRow> & { id: string }): HouseholdTransactionRow {
  return {
    account_id: "card",
    transaction_date: "2026-09-05",
    name: "Sample",
    merchant_name: null,
    amount_cents: 1000,
    pending: false,
    plaid_category_primary: "FOOD_AND_DRINK",
    ...overrides,
  };
}

test("account kinds come from Plaid type and subtype", () => {
  assert.equal(accountKind(checking), "checking");
  assert.equal(accountKind(savings), "savings");
  assert.equal(accountKind(card), "credit");
  assert.equal(accountKind({ account_type: "loan", account_subtype: "mortgage" }), "other");
});

test("category labels are humanized with a fallback", () => {
  assert.equal(categoryLabel("FOOD_AND_DRINK"), "Food & drink");
  assert.equal(categoryLabel(null), "Uncategorized");
  assert.equal(categoryLabel("SOME_NEW_THING"), "Some New Thing");
});

test("month keys shift across year boundaries", () => {
  assert.equal(shiftMonthKey("2026-01", -1), "2025-12");
  assert.equal(shiftMonthKey("2026-09", -11), "2025-10");
  assert.equal(shiftMonthKey("2025-12", 1), "2026-01");
});

test("totals split cash from credit and net them", () => {
  const data = buildHouseholdFinanceData({
    accounts: [card, checking, savings],
    transactions: [],
    snapshots: [],
    today: "2026-09-11",
    connectionCount: 2,
    lastSyncedAt: null,
  });

  assert.equal(data.totals.checkingCents, 978_400);
  assert.equal(data.totals.savingsCents, 500_000);
  assert.equal(data.totals.cashCents, 1_478_400);
  assert.equal(data.totals.creditCents, 1_264_400);
  assert.equal(data.totals.creditLimitCents, 3_850_000);
  assert.equal(data.totals.netCents, 1_478_400 - 1_264_400);
  assert.deepEqual(
    data.accounts.map((account) => account.kind),
    ["checking", "savings", "credit"],
  );
  assert.equal(data.accounts[2].utilizationTenths, Math.round((1_264_400 / 3_850_000) * 1000));
  assert.equal(data.accounts[2].label, "Blue card");
});

test("transfers, card payments, and loan disbursements never count as income or spending", () => {
  const data = buildHouseholdFinanceData({
    accounts: [card, checking],
    transactions: [
      txn({ id: "pay", account_id: "chk", amount_cents: 50_000, plaid_category_primary: "TRANSFER_OUT" }),
      txn({ id: "recv", account_id: "card", amount_cents: -50_000, plaid_category_primary: "TRANSFER_IN" }),
      txn({ id: "loan", account_id: "chk", amount_cents: -1_960_000, plaid_category_primary: "LOAN_DISBURSEMENTS" }),
      txn({ id: "pay2", account_id: "chk", amount_cents: 12_345, plaid_category_primary: "INCOME" }),
      txn({ id: "salary", account_id: "chk", amount_cents: -300_000, plaid_category_primary: "INCOME" }),
      txn({ id: "food", amount_cents: 4_500 }),
      txn({ id: "refund", amount_cents: -500 }),
    ],
    snapshots: [],
    today: "2026-09-11",
    connectionCount: 1,
    lastSyncedAt: null,
  });

  const month = data.months.at(-1)!;
  assert.equal(month.key, "2026-09");
  assert.equal(month.incomeCents, 300_000);
  assert.equal(month.spendingCents, 4_000);
  assert.equal(month.netCents, 296_000);
  assert.deepEqual(
    month.categories.map((category) => [category.key, category.amountCents, category.shareTenths]),
    [["FOOD_AND_DRINK", 4_000, 1000]],
  );
  assert.equal(data.recentTransactions.find((row) => row.id === "pay")?.isTransfer, true);
});

test("months always cover the trailing window ending in the current month", () => {
  const data = buildHouseholdFinanceData({
    accounts: [card],
    transactions: [txn({ id: "old", transaction_date: "2025-01-15", amount_cents: 999 })],
    snapshots: [],
    today: "2026-02-03",
    connectionCount: 1,
    lastSyncedAt: null,
    monthCount: 3,
  });

  assert.deepEqual(data.months.map((month) => month.key), ["2025-12", "2026-01", "2026-02"]);
  assert.equal(data.months.every((month) => month.spendingCents === 0), true);
});

test("pending transactions are counted but excluded from totals", () => {
  const data = buildHouseholdFinanceData({
    accounts: [card],
    transactions: [
      txn({ id: "posted", amount_cents: 2_000 }),
      txn({ id: "hold", amount_cents: 9_000, pending: true }),
    ],
    snapshots: [],
    today: "2026-09-11",
    connectionCount: 1,
    lastSyncedAt: null,
  });

  assert.equal(data.pendingCount, 1);
  assert.equal(data.months.at(-1)!.spendingCents, 2_000);
  assert.equal(data.accounts[0].monthSpendCents, 2_000);
  assert.equal(data.recentTransactions.length, 2);
});

test("balance history sums snapshots by kind and appends today", () => {
  const data = buildHouseholdFinanceData({
    accounts: [card, checking, savings],
    transactions: [],
    snapshots: [
      { account_id: "chk", snapshot_date: "2026-09-09", balance_cents: 900_000 },
      { account_id: "sav", snapshot_date: "2026-09-09", balance_cents: 400_000 },
      { account_id: "card", snapshot_date: "2026-09-09", balance_cents: 1_000_000 },
      { account_id: "chk", snapshot_date: "2026-09-10", balance_cents: 950_000 },
    ],
    today: "2026-09-11",
    connectionCount: 1,
    lastSyncedAt: null,
  });

  assert.deepEqual(
    data.balanceHistory.map((point) => [point.date, point.cashCents, point.creditCents, point.netCents]),
    [
      ["2026-09-09", 1_300_000, 1_000_000, 300_000],
      ["2026-09-10", 950_000, 0, 950_000],
      ["2026-09-11", 1_478_400, 1_264_400, 214_000],
    ],
  );
});
