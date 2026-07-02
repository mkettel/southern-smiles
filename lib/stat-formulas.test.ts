import assert from "node:assert/strict";
import test from "node:test";
import { calculateCollectionsPerStaffWeek } from "./stat-formulas";

test("calculates collections per staff from weekly totals", () => {
  const result = calculateCollectionsPerStaffWeek(
    [{ value: 5000 }, { value: 8000 }, { value: 0 }, { value: 7000 }],
    [{ input_value: 4 }, { input_value: 5 }, { input_value: 1 }, { input_value: 4 }],
  );

  assert.equal(result, 20_000 / 14);
});

test("does not average daily collections per staff ratios", () => {
  const weeklyTotalFormula = calculateCollectionsPerStaffWeek(
    [{ value: 10000 }, { value: 0 }],
    [{ input_value: 5 }, { input_value: 1 }],
  );
  const averageDailyRatio = (10000 / 5 + 0 / 1) / 2;

  assert.equal(weeklyTotalFormula, 10000 / 6);
  assert.notEqual(weeklyTotalFormula, averageDailyRatio);
});

test("returns null until staff-days exist", () => {
  const result = calculateCollectionsPerStaffWeek(
    [{ value: 5000 }],
    [{ input_value: null }],
  );

  assert.equal(result, null);
});

