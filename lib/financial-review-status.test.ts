import assert from "node:assert/strict";
import test from "node:test";
import { matchesReviewFilter, needsBookkeepingReview } from "./financial-review-status";

test("bank-pending transactions are waiting, not reviewable", () => {
  const transaction = { pending: true, review_status: "pending" as const };
  assert.equal(needsBookkeepingReview(transaction), false);
  assert.equal(matchesReviewFilter(transaction, "pending"), false);
  assert.equal(matchesReviewFilter(transaction, "bank_pending"), true);
  assert.equal(matchesReviewFilter(transaction, "all"), true);
});

test("settlement makes an unreviewed transaction eligible", () => {
  const transaction = { pending: false, review_status: "pending" as const };
  assert.equal(needsBookkeepingReview(transaction), true);
  assert.equal(matchesReviewFilter(transaction, "pending"), true);
  assert.equal(matchesReviewFilter(transaction, "bank_pending"), false);
});

test("reviewed and excluded transactions stay outside the review queue", () => {
  for (const review_status of ["reviewed", "excluded"] as const) {
    const transaction = { pending: false, review_status };
    assert.equal(needsBookkeepingReview(transaction), false);
    assert.equal(matchesReviewFilter(transaction, review_status), true);
  }
  assert.equal(matchesReviewFilter({ pending: true, review_status: "excluded" }, "bank_pending"), false);
});
