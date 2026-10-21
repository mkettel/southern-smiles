import assert from "node:assert/strict";
import test from "node:test";
import { allowsNegativeWeeklyValue, weeklyStatValueError } from "./stat-value-validation";

test("Profit accepts a loss, zero, and positive net income", () => {
  const profit = { name: "Profit", stat_type: "dollar" };
  for (const value of [-2293.24, 0, 5480.25]) assert.equal(weeklyStatValueError(profit, value), null);
  assert.equal(allowsNegativeWeeklyValue({ ...profit, name: " profit " }), true);
});

test("other dollar stats, counts, and percentages remain nonnegative", () => {
  for (const stat of [
    { name: "Collections", stat_type: "dollar" },
    { name: "Profit", stat_type: "count" },
    { name: "Conversion", stat_type: "percentage" },
  ]) assert.notEqual(weeklyStatValueError(stat, -1), null);
  assert.notEqual(weeklyStatValueError({ name: "Conversion", stat_type: "percentage" }, 101), null);
});

test("Profit rejects non-finite values", () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.notEqual(weeklyStatValueError({ name: "Profit", stat_type: "dollar" }, value), null);
  }
});
