import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateCareSnapshot,
  CARE_CALL_START,
  phoenixDay,
} from "./care-call-sync";
test("receiver only accepts post-cutover completed Phoenix days and aggregate shape", () => {
  const now = new Date("2026-10-27T07:10:00Z");
  const v = {
    metric: "care-call-attempts-v1",
    startDate: CARE_CALL_START,
    date: CARE_CALL_START,
    count: 18,
    revision: now.getTime(),
  };
  assert.equal(validateCareSnapshot(v, now).count, 18);
  for (const change of [
    { date: "2026-10-25" },
    { date: "2026-10-27" },
    { date: "2026-02-30" },
    { count: -1 },
    { count: 1.5 },
    { count: 1000001 },
    { patient: "forbidden" },
    { startDate: "2026-10-01" },
    { revision: now.getTime() + 600000 },
  ])
    assert.throws(() => validateCareSnapshot({ ...v, ...change }, now));
  assert.equal(phoenixDay(new Date("2026-10-26T06:59:59Z")), "2026-10-25");
});
