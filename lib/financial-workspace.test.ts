import assert from "node:assert/strict";
import test from "node:test";
import { financialWorkspaceMonthCount, getFinancialWorkspaceMonthFrames } from "@/lib/financial-workspace";

test("financial overview exposes each month from the first transaction through the current month", () => {
  const now = new Date("2026-09-01T19:00:00Z");
  const count = financialWorkspaceMonthCount("2026-05-14", now);
  const frames = getFinancialWorkspaceMonthFrames(now, count);

  assert.equal(count, 5);
  assert.equal(frames[0].key, "2026-05");
  assert.equal(frames.at(-1)?.key, "2026-09");
  assert.equal(frames[3].longLabel, "August 2026");
  assert.equal(frames[3].dateRange, "August 1–31, 2026");
});

test("financial overview keeps one current month when no transactions exist", () => {
  const now = new Date("2026-09-01T19:00:00Z");
  assert.equal(financialWorkspaceMonthCount(undefined, now), 1);
  assert.equal(getFinancialWorkspaceMonthFrames(now, 0)[0].key, "2026-09");
});
