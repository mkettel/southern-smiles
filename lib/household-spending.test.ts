import assert from "node:assert/strict";
import test from "node:test";
import type { HouseholdAccountRow, HouseholdTransactionRow } from "./household-finance";
import { assignCategorySlots, buildSpendingView, foldCategories, resolveSpendingRange } from "./household-spending";

const card: HouseholdAccountRow = {
  id: "card",
  name: "Visa",
  nickname: null,
  mask: "3881",
  account_type: "credit",
  account_subtype: "credit card",
  current_balance_cents: 0,
  available_balance_cents: null,
  credit_limit_cents: null,
  minimum_payment_cents: null,
  next_payment_due_date: null,
  last_synced_at: null,
  institution_name: null,
};
const checking: HouseholdAccountRow = { ...card, id: "chk", name: "Checking", account_type: "depository", account_subtype: "checking" };

let counter = 0;
function txn(date: string, amount: number, category: string, overrides: Partial<HouseholdTransactionRow> = {}): HouseholdTransactionRow {
  counter += 1;
  return {
    id: `t${counter}`,
    account_id: "card",
    transaction_date: date,
    name: `${category} ${counter}`,
    merchant_name: null,
    amount_cents: amount,
    pending: false,
    plaid_category_primary: category,
    ...overrides,
  };
}

test("ranges resolve with an equal-length previous window", () => {
  const thisMonth = resolveSpendingRange("this_month", "2026-09-11");
  assert.deepEqual([thisMonth.start, thisMonth.end, thisMonth.previousStart, thisMonth.previousEnd], ["2026-09-01", "2026-09-11", "2026-08-21", "2026-08-31"]);

  const lastMonth = resolveSpendingRange("last_month", "2026-03-15");
  assert.deepEqual([lastMonth.start, lastMonth.end], ["2026-02-01", "2026-02-28"]);

  const twelve = resolveSpendingRange("12_months", "2026-01-10");
  assert.equal(twelve.start, "2025-02-01");

  const ytd = resolveSpendingRange("ytd", "2026-09-11");
  assert.equal(ytd.start, "2026-01-01");
});

test("view groups by category with shares, months, merchants, and deltas", () => {
  const view = buildSpendingView({
    accounts: [card, checking],
    today: "2026-09-11",
    rangeKey: "3_months",
    transactions: [
      txn("2026-07-03", 5_000, "FOOD_AND_DRINK", { merchant_name: "Sprouts" }),
      txn("2026-08-03", 7_000, "FOOD_AND_DRINK", { merchant_name: "Sprouts" }),
      txn("2026-09-03", 3_000, "FOOD_AND_DRINK", { merchant_name: "Chipotle" }),
      txn("2026-08-10", 5_000, "TRAVEL"),
      txn("2026-08-12", -1_000, "TRAVEL"),
      txn("2026-05-20", 9_000, "FOOD_AND_DRINK"),
      txn("2026-09-05", 4_000, "TRANSFER_OUT"),
      txn("2026-09-06", -100_000, "INCOME"),
      txn("2026-09-07", 2_000, "FOOD_AND_DRINK", { pending: true }),
    ],
  });

  assert.equal(view.totalCents, 19_000);
  assert.equal(view.transactionCount, 5);
  assert.deepEqual(view.months.map((month) => month.key), ["2026-07", "2026-08", "2026-09"]);

  const [food, travel] = view.categories;
  assert.equal(food.key, "FOOD_AND_DRINK");
  assert.equal(food.amountCents, 15_000);
  assert.equal(food.shareTenths, 789);
  assert.deepEqual(food.monthly, [5_000, 7_000, 3_000]);
  assert.deepEqual(food.merchants.map((merchant) => [merchant.label, merchant.amountCents]), [["Sprouts", 12_000], ["Chipotle", 3_000]]);
  assert.equal(food.previousAmountCents, 9_000);
  assert.equal(travel.amountCents, 4_000);
  assert.equal(travel.previousAmountCents, 0);
  assert.equal(view.previousTotalCents, 9_000);
});

test("account filter narrows the view and previous totals are null with no history", () => {
  const view = buildSpendingView({
    accounts: [card, checking],
    today: "2026-09-11",
    rangeKey: "this_month",
    accountId: "chk",
    transactions: [
      txn("2026-09-02", 5_000, "FOOD_AND_DRINK"),
      txn("2026-09-02", 8_000, "RENT_AND_UTILITIES", { account_id: "chk" }),
    ],
  });

  assert.equal(view.totalCents, 8_000);
  assert.equal(view.categories.length, 1);
  assert.equal(view.transactions[0].accountLabel, "Checking");
  assert.equal(view.previousTotalCents, null);
  assert.equal(view.categories[0].previousAmountCents, null);
});

test("folding keeps the top categories and sums the rest into Other", () => {
  const view = buildSpendingView({
    accounts: [card],
    today: "2026-09-11",
    rangeKey: "this_month",
    transactions: ["A", "B", "C", "D", "E"].map((category, index) => txn("2026-09-02", (5 - index) * 1_000, category)),
  });
  const folded = foldCategories(view.categories, 3);

  assert.deepEqual(folded.map((category) => [category.key, category.amountCents]), [
    ["A", 5_000],
    ["B", 4_000],
    ["C", 3_000],
    ["__other", 3_000],
  ]);
  assert.equal(folded[3].label, "Other (2)");
  assert.deepEqual(folded[3].monthly, [3_000]);
  assert.equal(foldCategories(view.categories, 10).length, 5);
});

test("color slots are fixed for core categories and stable for the biggest others", () => {
  const slots = assignCategorySlots([
    txn("2026-09-01", 1_000, "FOOD_AND_DRINK"),
    txn("2026-09-01", 9_000, "TRAVEL"),
    txn("2026-09-01", 5_000, "MEDICAL"),
    txn("2026-09-01", 3_000, "ENTERTAINMENT"),
    txn("2026-09-01", 2_000, "PERSONAL_CARE"),
    txn("2026-09-01", 50_000, "TRANSFER_OUT"),
  ]);

  assert.equal(slots.get("FOOD_AND_DRINK"), 0);
  assert.equal(slots.get("LOAN_PAYMENTS"), 4);
  assert.deepEqual([slots.get("TRAVEL"), slots.get("MEDICAL"), slots.get("ENTERTAINMENT")], [5, 6, 7]);
  assert.equal(slots.has("PERSONAL_CARE"), false);
  assert.equal(slots.has("TRANSFER_OUT"), false);
});
