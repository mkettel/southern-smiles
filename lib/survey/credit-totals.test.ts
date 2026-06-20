import assert from "node:assert/strict";
import test from "node:test";
import { calculateCreditTotals } from "./credit-totals";

test("counts only responded promised credits as outstanding", () => {
  const recipients = Array.from({ length: 134 }, (_, index) => ({
    id: `recipient-${index + 1}`,
    credit_status: "promised",
    credit_amount_cents: 5_000,
  }));

  const totals = calculateCreditTotals(
    recipients,
    new Set(["recipient-42"])
  );

  assert.equal(totals.promisedCents, 670_000);
  assert.equal(totals.outstandingCents, 5_000);
});

test("removes a redeemed credit from the outstanding total", () => {
  const totals = calculateCreditTotals(
    [
      {
        id: "recipient-1",
        credit_status: "redeemed",
        credit_amount_cents: 5_000,
      },
    ],
    new Set(["recipient-1"])
  );

  assert.equal(totals.redeemedCents, 5_000);
  assert.equal(totals.outstandingCents, 0);
});
