import { test } from "node:test";
import assert from "node:assert/strict";
import { importCareCallSnapshot } from "./care-call-import";
import { CARE_CALL_ACTOR, CARE_CALL_PRACTICE, CARE_CALL_STAT } from "./care-call-sync";

test("saved snapshots refresh dependent totals in the correct Monday week", async () => {
  for (const date of ["2026-10-26", "2026-10-27", "2026-11-01"]) {
    const calls: unknown[] = [];
    const snapshot = { date, count: 10, revision: 1 };
    await importCareCallSnapshot(snapshot,
      async (value) => { calls.push(value); },
      async (...args) => { calls.push(args); });
    assert.deepEqual(calls, [snapshot, [CARE_CALL_STAT, "2026-10-26", CARE_CALL_ACTOR, CARE_CALL_PRACTICE]]);
  }
});

test("failed saves do not refresh; failed refreshes propagate and retries refresh again", async () => {
  const snapshot = { date: "2026-10-26", count: 10, revision: 1 };
  let saves = 0;
  let refreshes = 0;
  await assert.rejects(importCareCallSnapshot(snapshot,
    async () => { throw new Error("save failed"); },
    async () => { refreshes++; }), /save failed/);
  assert.equal(refreshes, 0);
  const save = async () => { saves++; };
  await assert.rejects(importCareCallSnapshot(snapshot, save,
    async () => { refreshes++; throw new Error("refresh failed"); }), /refresh failed/);
  await importCareCallSnapshot(snapshot, save, async () => { refreshes++; });
  assert.equal(saves, 2);
  assert.equal(refreshes, 2);
});
