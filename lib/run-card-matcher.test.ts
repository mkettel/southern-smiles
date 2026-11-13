import assert from "node:assert/strict";
import test from "node:test";
import { runCardMatcher } from "./run-card-matcher";

test("a stale schema cache retries within the same sync", async () => {
  let attempts = 0;
  await runCardMatcher(async () => ({
    error: ++attempts === 1 ? { code: "PGRST202", message: "not found" } : null,
  }), async () => {});
  assert.equal(attempts, 2);
});

test("persistent schema errors and posting failures never report success", async () => {
  for (const [code, expected] of [["PGRST202", 3], ["42501", 1]] as const) {
    let attempts = 0;
    await assert.rejects(runCardMatcher(async () => {
      attempts++;
      return { error: { code, message: "unavailable" } };
    }, async () => {}), /Card payment matching failed/);
    assert.equal(attempts, expected);
  }
});
