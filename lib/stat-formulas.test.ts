import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCollectionsPerStaffWeek,
  calculateRatioOfSumsWeek,
} from "./stat-formulas";

test("calculates collections per staff from weekly totals", () => {
  const result = calculateCollectionsPerStaffWeek(
    [
      { entry_date: "2026-06-29", value: 5000 },
      { entry_date: "2026-06-30", value: 8000 },
      { entry_date: "2026-07-02", value: 0 },
      { entry_date: "2026-07-03", value: 7000 },
    ],
    [
      { entry_date: "2026-06-29", input_value: 4 },
      { entry_date: "2026-06-30", input_value: 5 },
      { entry_date: "2026-07-02", input_value: 1 },
      { entry_date: "2026-07-03", input_value: 4 },
    ],
  );

  assert.equal(result, 20_000 / 14);
});

test("does not average daily collections per staff ratios", () => {
  const weeklyTotalFormula = calculateCollectionsPerStaffWeek(
    [
      { entry_date: "2026-06-29", value: 10000 },
      { entry_date: "2026-06-30", value: 0 },
    ],
    [
      { entry_date: "2026-06-29", input_value: 5 },
      { entry_date: "2026-06-30", input_value: 1 },
    ],
  );
  const averageDailyRatio = (10000 / 5 + 0 / 1) / 2;

  assert.equal(weeklyTotalFormula, 10000 / 6);
  assert.notEqual(weeklyTotalFormula, averageDailyRatio);
});

test("returns null until staff-days exist", () => {
  const result = calculateCollectionsPerStaffWeek(
    [{ entry_date: "2026-06-29", value: 5000 }],
    [{ entry_date: "2026-06-29", input_value: null }],
  );

  assert.equal(result, null);
});

test("pauses when collections exist for a day missing staff-days", () => {
  const result = calculateCollectionsPerStaffWeek(
    [
      { entry_date: "2026-06-29", value: 5000 },
      { entry_date: "2026-06-30", value: 8000 },
    ],
    [{ entry_date: "2026-06-29", input_value: 4 }],
  );

  assert.equal(result, null);
});

test("counts missing collections as zero when staff-days are entered", () => {
  const result = calculateCollectionsPerStaffWeek(
    [{ entry_date: "2026-06-29", value: 5000 }],
    [
      { entry_date: "2026-06-29", input_value: 4 },
      { entry_date: "2026-06-30", input_value: 1 },
    ],
  );

  assert.equal(result, 5000 / 5);
});

test("calculates conversion rate from weekly totals", () => {
  const result = calculateRatioOfSumsWeek(
    [{ value: 4 }, { value: 1 }, { value: 1 }, { value: 1 }],
    [{ value: 7 }, { value: 4 }, { value: 4 }, { value: 2 }],
  );

  assert.equal(result, (7 / 17) * 100);
});

test("does not average daily conversion rates", () => {
  const weeklyRatio = calculateRatioOfSumsWeek(
    [{ value: 4 }, { value: 1 }, { value: 1 }, { value: 1 }],
    [{ value: 7 }, { value: 4 }, { value: 4 }, { value: 2 }],
  );
  const averageDailyRatio = ((4 / 7) * 100 + 25 + 25 + 50) / 4;

  assert.equal(weeklyRatio, (7 / 17) * 100);
  assert.notEqual(weeklyRatio, averageDailyRatio);
});

test("returns null when the weekly ratio denominator is zero or missing", () => {
  assert.equal(calculateRatioOfSumsWeek([{ value: 2 }], []), null);
  assert.equal(calculateRatioOfSumsWeek([{ value: 2 }], [{ value: 0 }]), null);
});
