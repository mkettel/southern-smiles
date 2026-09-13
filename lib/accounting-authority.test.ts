import assert from "node:assert/strict";
import test from "node:test";
import { selectAuthoritativeLedger, type AuthorityEntry, type BaselineLedger } from "./accounting-authority";

function fixture() {
  const entry = (id: string, date: string): AuthorityEntry => ({ id, date, practiceId: "p", status: "posted" });
  const baseline: BaselineLedger<AuthorityEntry> = {
    authority: { id: "qb", practiceId: "p", from: "2026-01-01", through: "2026-08-31",
      sourceSha256: "a".repeat(64), status: "approved", balancesVerified: true, accountingBasis: "cash" },
    expectedEntryCount: 2, entries: [entry("q1", "2026-01-01"), entry("q2", "2026-08-31")],
  };
  return { practiceId: "p", baselines: [baseline], boardEntries: [
    entry("before", "2025-12-31"), entry("first", "2026-01-01"), entry("last", "2026-08-31"), entry("after", "2026-09-01"),
  ] };
}

test("QuickBooks controls both cutoff boundaries; Board remains before and after", () => {
  const input = fixture(), original = structuredClone(input);
  const result = selectAuthoritativeLedger(input);
  assert.deepEqual(result.effective.map((e) => e.entry.id), ["before", "q1", "q2", "after"]);
  assert.deepEqual(result.reviewQueue.map((e) => e.entry.id), ["first", "last"]);
  assert.deepEqual(input, original);
});
test("without an approved baseline, original posted history remains", () => {
  const input = fixture(); input.baselines = [];
  assert.equal(selectAuthoritativeLedger(input).effective.length, 4);
});
test("late Board backdating cannot silently enter an authoritative period", () => {
  const input = fixture();
  input.boardEntries.push({id: "late", date: "2026-04-01", practiceId: "p", status: "posted"});
  assert.equal(selectAuthoritativeLedger(input).reviewQueue.length, 3);
  assert.equal(selectAuthoritativeLedger(input).effective.length, 4);
});
test("rejects partial baseline instead of falling back to double-counted Board entries", () => {
  const input = fixture(); input.baselines[0].entries.pop();
  assert.throws(() => selectAuthoritativeLedger(input), /Incomplete/);
});
test("rejects overlapping baseline periods", () => {
  const input = fixture(); const other = structuredClone(input.baselines[0]); other.authority.id = "other";
  input.baselines.push(other);
  assert.throws(() => selectAuthoritativeLedger(input), /Overlapping/);
});
test("rejects wrong practice, duplicate source IDs, and out-of-period source entries", () => {
  let input = fixture(); input.boardEntries[0].practiceId = "other";
  assert.throws(() => selectAuthoritativeLedger(input), /Cross-practice/);
  input = fixture(); input.baselines[0].entries[1].id = "q1";
  assert.throws(() => selectAuthoritativeLedger(input), /duplicate/);
  input = fixture(); input.baselines[0].entries[1].date = "2026-09-01";
  assert.throws(() => selectAuthoritativeLedger(input), /scope/);
});
test("never includes voided Board entries in totals or review queue", () => {
  const input = fixture(); input.boardEntries[0].status = "voided";
  assert.equal(selectAuthoritativeLedger(input).effective.length, 3);
});
