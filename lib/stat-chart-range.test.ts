import { test } from "node:test";
import assert from "node:assert/strict";
import { annotationWeek, inStatChartRange, statChartDomain } from "./stat-chart-range";

test("ranges are calendar months ending today, not the latest stale entry", () => {
  const today = "2026-09-27";
  assert.equal(inStatChartRange("2026-08-27", 1, today), true);
  assert.equal(inStatChartRange("2026-08-26", 1, today), false);
  assert.equal(inStatChartRange("2026-06-27", 3, today), true);
  assert.equal(inStatChartRange("2025-09-27", 12, today), true);
  assert.equal(inStatChartRange("2025-09-26", 12, today), false);
  assert.equal(inStatChartRange("2020-01-01", 0, today), true);
  assert.equal(inStatChartRange("2026-09-28", 0, today), false);
});
test("calendar month boundaries include leap day", () => {
  assert.equal(inStatChartRange("2024-02-29", 1, "2024-03-31"), true);
  assert.equal(inStatChartRange("2024-02-28", 1, "2024-03-31"), false);
});
test("old outliers cannot flatten a filtered period", () => {
  const rows = [{ date: "2025-01-01", value: 1000 }, { date: "2026-09-01", value: 40 }, { date: "2026-09-14", value: 48 }];
  const visible = rows.filter(row => inStatChartRange(row.date, 3, "2026-09-27"));
  const [low, high] = statChartDomain(visible.map(row => row.value));
  assert.ok(low < 40 && high > 48 && high < 60);
  assert.ok(statChartDomain(rows.map(row => row.value))[1] > 1000);
});
test("scaling includes every plotted series and rolling average", () => {
  const [low, high] = statChartDomain([40, 48, 28.5, 155, null]);
  assert.ok(low < 28.5 && high > 155);
});
test("empty, zero, flat, fractional, and negative charts have usable domains", () => {
  assert.deepEqual(statChartDomain([null, NaN, Infinity]), [0, 1]);
  assert.deepEqual(statChartDomain([0, 0]), [0, 1]);
  assert.deepEqual(statChartDomain([10, 10]), [9, 11]);
  const fractional = statChartDomain([0.12, 0.18], false, 0.1);
  assert.ok(fractional[0] < 0.12 && fractional[1] > 0.18);
  const negatives = statChartDomain([-5, -2], true);
  assert.ok(negatives[0] < -5);
  assert.equal(negatives[1], 0);
  assert.equal(statChartDomain([40, 48], true)[0], 0);
});
test("action log markers use distinct ISO weeks across years", () => {
  assert.equal(annotationWeek("2026-09-25"), "2026-09-21");
  assert.notEqual(annotationWeek("2025-09-25"), annotationWeek("2026-09-25"));
  assert.equal(annotationWeek("2026-01-01"), "2025-12-29");
});
