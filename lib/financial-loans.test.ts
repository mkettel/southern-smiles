import assert from "node:assert/strict";
import test from "node:test";
import { availableCredit, creditUtilization, loanProgress } from "@/lib/financial-loans";

test("line of credit utilization uses the revolving credit limit", () => {
  const loan = { creditLimitCents: 3000000, currentBalanceCents: 2002720 };

  assert.equal(creditUtilization(loan), 67);
  assert.equal(availableCredit(loan), 997280);
});

test("line of credit metrics remain unknown until a limit is entered", () => {
  const loan = { creditLimitCents: null, currentBalanceCents: 2002720 };

  assert.equal(creditUtilization(loan), null);
  assert.equal(availableCredit(loan), null);
});

test("term loan progress continues to use original principal", () => {
  assert.equal(loanProgress({ originalPrincipalCents: 3000000, currentBalanceCents: 680155 }), 77);
});
