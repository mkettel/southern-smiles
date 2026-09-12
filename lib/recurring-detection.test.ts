import assert from "node:assert/strict";
import test from "node:test";
import type { HouseholdAccountRow, HouseholdTransactionRow } from "./household-finance";
import {
  addDays,
  daysBetween,
  detectRecurringStreams,
  recurringStreamKey,
  summarizeRecurring,
} from "./recurring-detection";

const card: HouseholdAccountRow = {
  id: "card",
  name: "Cash Rewards",
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

let counter = 0;
function charge(
  merchant: string,
  date: string,
  amount: number,
  overrides: Partial<HouseholdTransactionRow> = {},
): HouseholdTransactionRow {
  counter += 1;
  return {
    id: `t${counter}`,
    account_id: "card",
    transaction_date: date,
    name: merchant.toUpperCase(),
    merchant_name: merchant,
    amount_cents: amount,
    pending: false,
    plaid_category_primary: "GENERAL_SERVICES",
    ...overrides,
  };
}

function monthly(merchant: string, day: number, amounts: number[], startMonth = "2026-01", overrides: Partial<HouseholdTransactionRow> = {}) {
  return amounts.map((amount, index) => {
    const [year, month] = startMonth.split("-").map(Number);
    const total = year * 12 + (month - 1) + index;
    const key = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return charge(merchant, key, amount, overrides);
  });
}

const detect = (transactions: HouseholdTransactionRow[], overrides?: Record<string, "confirmed" | "dismissed">) =>
  detectRecurringStreams({ transactions, accounts: [card], today: "2026-09-11", overrides });

test("stream keys strip digits and punctuation from the merchant", () => {
  assert.equal(recurringStreamKey({ name: "NETFLIX.COM 8005558", merchant_name: "Netflix" }), "netflix");
  assert.equal(recurringStreamKey({ name: "APS ELECTRIC 000123 PHX", merchant_name: null }), "aps electric phx");
});

test("date helpers work across month boundaries", () => {
  assert.equal(daysBetween("2026-01-30", "2026-03-01"), 30);
  assert.equal(addDays("2026-12-25", 10), "2027-01-04");
});

test("a fixed monthly charge is detected as an active subscription", () => {
  const data = detect(monthly("Netflix", 12, [1549, 1549, 1549, 1549], "2026-05", { plaid_category_primary: "ENTERTAINMENT" }));

  assert.equal(data.streams.length, 1);
  const [stream] = data.streams;
  assert.equal(stream.cadence, "monthly");
  assert.equal(stream.kind, "subscription");
  assert.equal(stream.typicalAmountCents, 1549);
  assert.equal(stream.amountIsFixed, true);
  assert.equal(stream.monthlyEquivalentCents, 1549);
  assert.equal(stream.occurrences, 4);
  assert.equal(stream.isActive, true);
  assert.equal(stream.lastDate, "2026-08-12");
  assert.equal(stream.nextExpectedDate, "2026-09-12");
  assert.equal(stream.status, "detected");
});

test("a variable monthly utility needs four occurrences and is classed as a bill", () => {
  const three = detect(monthly("APS", 3, [18_000, 24_500, 21_200], "2026-06", { plaid_category_primary: "RENT_AND_UTILITIES" }));
  assert.equal(three.streams.length, 0);

  const four = detect(monthly("APS", 3, [18_000, 24_500, 21_200, 26_900], "2026-06", { plaid_category_primary: "RENT_AND_UTILITIES" }));
  assert.equal(four.streams.length, 1);
  assert.equal(four.streams[0].kind, "bill");
  assert.equal(four.streams[0].amountIsFixed, false);
});

test("irregular frequent purchases are not recurring", () => {
  const data = detect([
    charge("Amazon", "2026-08-01", 2_300),
    charge("Amazon", "2026-08-03", 8_900),
    charge("Amazon", "2026-08-04", 1_200),
    charge("Amazon", "2026-08-19", 4_100),
    charge("Amazon", "2026-09-02", 15_000),
  ]);
  assert.equal(data.streams.length, 0);
});

test("transfers, income, and pending charges are ignored", () => {
  const data = detect([
    ...monthly("Bank of America Card Payment", 20, [180_000, 180_000, 180_000], "2026-06", { plaid_category_primary: "TRANSFER_OUT" }),
    ...monthly("Symmetria", 1, [-410_000, -410_000, -410_000], "2026-06", { plaid_category_primary: "INCOME" }),
    ...monthly("Spotify", 3, [1_199, 1_199, 1_199], "2026-06", { pending: true }),
  ]);
  assert.equal(data.streams.length, 0);
});

test("yearly and biweekly cadences are recognized and normalized to a month", () => {
  const data = detect([
    charge("Costco Membership", "2024-08-10", 6_500),
    charge("Costco Membership", "2025-08-12", 6_500),
    charge("Costco Membership", "2026-08-11", 6_500),
    ...[0, 14, 28, 42].map((offset) => charge("Planet Fitness", addDays("2026-07-20", offset), 2_499)),
  ]);

  const costco = data.streams.find((stream) => stream.key === "costco membership");
  const gym = data.streams.find((stream) => stream.key === "planet fitness");
  assert.equal(costco?.cadence, "yearly");
  assert.equal(costco?.monthlyEquivalentCents, Math.round(6_500 / 12));
  assert.equal(gym?.cadence, "biweekly");
  assert.equal(gym?.kind, "subscription");
  assert.equal(gym?.monthlyEquivalentCents, Math.round(2_499 * (30.44 / 14)));
});

test("a stream that stopped charging is inactive and left out of the total", () => {
  const data = detect(monthly("Hulu", 5, [1_799, 1_799, 1_799], "2026-02"));
  assert.equal(data.streams[0].isActive, false);
  assert.equal(data.summary.monthlyCents, 0);
  assert.equal(data.summary.hiddenCount, 1);
});

test("overrides set status, dismissed streams drop out of the total, and confirmed sort first", () => {
  const data = detect(
    [
      ...monthly("Rocket Mortgage", 1, [214_500, 214_500, 214_500], "2026-06", { plaid_category_primary: "LOAN_PAYMENTS" }),
      ...monthly("Netflix", 12, [1_549, 1_549, 1_549], "2026-06", { plaid_category_primary: "ENTERTAINMENT" }),
      ...monthly("Sprouts", 7, [4_200, 4_350, 4_100, 4_260], "2026-05", { plaid_category_primary: "FOOD_AND_DRINK" }),
    ],
    { netflix: "confirmed", sprouts: "dismissed" },
  );

  assert.deepEqual(
    data.streams.map((stream) => [stream.key, stream.status]),
    [
      ["netflix", "confirmed"],
      ["rocket mortgage", "detected"],
      ["sprouts", "dismissed"],
    ],
  );
  assert.equal(data.summary.monthlyCents, 214_500 + 1_549);
  assert.equal(data.summary.billsCents, 214_500);
  assert.equal(data.summary.subscriptionsCents, 1_549);
  assert.equal(data.summary.activeCount, 2);

  const restored = summarizeRecurring(data.streams.map((stream) => ({ ...stream, status: "detected" as const })));
  assert.equal(restored.activeCount, 3);
});

test("insurance is a bill even when the merchant name alone does not say so", () => {
  const byName = detect(monthly("State Farm", 22, [14_255, 14_255, 14_255], "2026-06", { name: "STATE FARM INSURANCE" }));
  assert.equal(byName.streams[0].kind, "bill");

  const byDetail = detect(
    monthly("Lemonade", 4, [3_800, 3_800, 3_800], "2026-06", { plaid_category_detailed: "GENERAL_SERVICES_INSURANCE" }),
  );
  assert.equal(byDetail.streams[0].kind, "bill");
});

test("one merchant billing two different amounts becomes two streams", () => {
  const data = detect([
    ...monthly("State Farm", 4, [3_248, 3_248, 3_248, 3_248], "2026-06", { plaid_category_detailed: "GENERAL_SERVICES_INSURANCE" }),
    ...monthly("State Farm", 22, [41_241, 38_873, 38_873, 38_873], "2026-05", { plaid_category_detailed: "GENERAL_SERVICES_INSURANCE" }),
  ]);

  assert.deepEqual(
    data.streams.map((stream) => [stream.key, stream.label, stream.cadence, stream.kind, stream.typicalAmountCents]),
    [
      ["state farm@389", "State Farm · $388.73", "monthly", "bill", 38_873],
      ["state farm@32", "State Farm · $32.48", "monthly", "bill", 3_248],
    ],
  );
  assert.equal(data.summary.monthlyCents, 38_873 + 3_248);
});

test("small usage charges do not break a subscription under the same merchant", () => {
  const data = detect([
    ...monthly("Anthropic", 11, [10_888, 10_888, 10_888, 10_888, 10_888], "2026-04"),
    charge("Anthropic", "2026-04-20", 4_899),
    charge("Anthropic", "2026-05-14", 544),
    charge("Anthropic", "2026-05-31", 545),
    charge("Anthropic", "2026-05-31", 4_899),
  ]);

  assert.equal(data.streams.length, 1);
  assert.equal(data.streams[0].key, "anthropic");
  assert.equal(data.streams[0].label, "Anthropic");
  assert.equal(data.streams[0].cadence, "monthly");
  assert.equal(data.streams[0].typicalAmountCents, 10_888);
});
