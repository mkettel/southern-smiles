import assert from "node:assert/strict";
import test from "node:test";
import { buildFinancialReportsData } from "@/lib/financial-reports";
import type { BookkeepingAccount, FinancialTransaction } from "@/lib/financial-transactions";

const accounts: BookkeepingAccount[] = [
  account("groceries", "5100", "Groceries", "Expense", "Food"),
  account("gas", "5200", "Gas", "Expense", "Transportation"),
  account("animal", "5380", "Animal Care", "Expense", "Pets"),
  account("salary", "4000", "Salary Income", "Income", "Employment"),
];

const transactions: Array<Pick<FinancialTransaction, "transaction_date" | "amount_cents" | "bookkeeping_account_id">> = [
  transaction("2026-08-04", 8282, "groceries"),
  transaction("2026-08-03", 7619, "groceries"),
  transaction("2026-08-01", -200000, "salary"),
  transaction("2026-07-12", 5000, "gas"),
  transaction("2026-01-10", 10000, "animal"),
  transaction("2025-12-20", 2000, "groceries"),
];

test("buildFinancialReportsData calculates selectable spending periods", () => {
  const data = buildFinancialReportsData({
    accounts,
    transactions,
    now: new Date("2026-08-06T18:00:00Z"),
  });

  const month = data.periods.find((period) => period.key === "month")!;
  const sixMonths = data.periods.find((period) => period.key === "six_months")!;
  const year = data.periods.find((period) => period.key === "year")!;
  const allTime = data.periods.find((period) => period.key === "all_time")!;

  assert.equal(month.expenseCents, 15901);
  assert.equal(month.revenueCents, 200000);
  assert.equal(sixMonths.expenseCents, 20901);
  assert.equal(year.expenseCents, 30901);
  assert.equal(allTime.expenseCents, 32901);
  assert.match(allTime.dateRange, /Dec 20, 2025/);
});

test("category reports include zero-dollar expense accounts", () => {
  const data = buildFinancialReportsData({
    accounts,
    transactions,
    now: new Date("2026-08-06T18:00:00Z"),
  });
  const month = data.periods.find((period) => period.key === "month")!;

  assert.equal(month.categories.length, 3);
  assert.deepEqual(
    month.categories.map(({ name, amountCents, transactionCount }) => ({ name, amountCents, transactionCount })),
    [
      { name: "Groceries", amountCents: 15901, transactionCount: 2 },
      { name: "Gas", amountCents: 0, transactionCount: 0 },
      { name: "Animal Care", amountCents: 0, transactionCount: 0 },
    ],
  );
});

test("the six-month chart runs from March through August", () => {
  const data = buildFinancialReportsData({
    accounts,
    transactions,
    now: new Date("2026-08-06T18:00:00Z"),
  });

  assert.deepEqual(data.months.map((month) => month.label), ["Mar", "Apr", "May", "Jun", "Jul", "Aug"]);
  assert.equal(data.months.find((month) => month.label === "Jul")?.expenseCents, 5000);
  assert.equal(data.months.find((month) => month.label === "Aug")?.expenseCents, 15901);
});

function account(
  id: string,
  accountNumber: string,
  name: string,
  accountType: string,
  detailType: string,
): BookkeepingAccount {
  return { id, accountNumber, name, accountType, detailType, externalSource: "manual" };
}

function transaction(
  transaction_date: string,
  amount_cents: number,
  bookkeeping_account_id: string,
): Pick<FinancialTransaction, "transaction_date" | "amount_cents" | "bookkeeping_account_id"> {
  return { transaction_date, amount_cents, bookkeeping_account_id };
}
