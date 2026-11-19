import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateCareSnapshot,
  CARE_CALL_START,
  phoenixDay,
  isVaultSyncedStat,
  CARE_CALL_STAT,
  NEW_REACH_STAT,
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
    { date: "2026-10-28" },
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
  const reach = {...v, metric:"new-reaches-v1", startDate:"2026-11-16",date:"2026-11-16"};
  assert.throws(()=>validateCareSnapshot(reach,now));
  assert.throws(()=>validateCareSnapshot({...reach,date:"2026-11-15"},new Date("2026-11-16T23:45Z")));
  assert.equal(validateCareSnapshot(reach,new Date("2026-11-16T23:45Z")).metric,reach.metric);
});
test("manual controls follow each stat's own cutover", () => {
  assert.equal(isVaultSyncedStat(CARE_CALL_STAT, "2026-10-25"), false);
  assert.equal(isVaultSyncedStat(CARE_CALL_STAT, "2026-10-26"), true);
  assert.equal(isVaultSyncedStat(NEW_REACH_STAT, "2026-11-15"), false);
  assert.equal(isVaultSyncedStat(NEW_REACH_STAT, "2026-11-16"), true);
  assert.equal(isVaultSyncedStat("unrelated", "2026-11-16"), false);
});
