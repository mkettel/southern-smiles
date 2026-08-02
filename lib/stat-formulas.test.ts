import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCollectionsPerStaffWeek,
  calculateRatioOfSumsWeek,
  calculateSumOfWeeklyTotals,
  getDailyInputStatId,
  isNewPatientBookingsInput,
  isWeeklyFormulaActive,
} from "./stat-formulas";

test("treats new patient bookings as an input-only helper", () => {
  assert.equal(isNewPatientBookingsInput({ name: "New Patient Bookings" }), true);
  assert.equal(isNewPatientBookingsInput({ name: "New Reaches" }), false);
});

test("uses booking counts as the daily input behind conversion rate", () => {
  assert.equal(
    getDailyInputStatId({
      id: "conversion",
      name: "Conversion Rate",
      weekly_formula: "ratio_of_sums",
      formula_source_stat_id: "bookings",
    }),
    "bookings",
  );
  assert.equal(
    getDailyInputStatId({
      id: "reaches",
      name: "New Reaches",
      weekly_formula: "sum",
      formula_source_stat_id: null,
    }),
    "reaches",
  );
});

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

test("adds existing weekly source totals for a derived stat", () => {
  assert.equal(
    calculateSumOfWeeklyTotals([
      { value: 120 },
      { value: "35" },
      { value: 18 },
      { value: 9 },
      { value: 22 },
    ]),
    204,
  );
});

test("returns null when no weekly source totals exist", () => {
  assert.equal(calculateSumOfWeeklyTotals([]), null);
  assert.equal(calculateSumOfWeeklyTotals([{ value: null }]), null);
});

test("keeps formula-driven recalculation off before its effective week", () => {
  assert.equal(isWeeklyFormulaActive("2026-07-20", "2026-07-13"), false);
  assert.equal(isWeeklyFormulaActive("2026-07-20", "2026-07-20"), true);
  assert.equal(isWeeklyFormulaActive(null, "2026-07-13"), true);
});
