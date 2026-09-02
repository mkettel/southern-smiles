import assert from "node:assert/strict";
import test from "node:test";
import { availableCredit, creditUtilization, loanProgress, suggestedLoanPayment, suggestedLoanPaymentAllocations, suggestedLoanPaymentSplit } from "@/lib/financial-loans";

test("line of credit utilization uses the revolving credit limit", () => {
  const loan = { creditLimitCents: 3000000, availableCreditCents: null, currentBalanceCents: 2002720 };

  assert.equal(creditUtilization(loan), 67);
  assert.equal(availableCredit(loan), 997280);
});

test("line of credit metrics remain unknown until a limit is entered", () => {
  const loan = { creditLimitCents: null, availableCreditCents: null, currentBalanceCents: 2002720 };

  assert.equal(creditUtilization(loan), null);
  assert.equal(availableCredit(loan), null);
});

test("lender-reported available credit handles balances that include future fees", () => {
  const loan = { creditLimitCents: 2280000, availableCreditCents: 649291, currentBalanceCents: 1874941 };

  assert.equal(availableCredit(loan), 649291);
  assert.equal(creditUtilization(loan), 72);
});

test("term loan progress continues to use original principal", () => {
  assert.equal(loanProgress({ originalPrincipalCents: 3000000, currentBalanceCents: 680155 }), 77);
});

test("uses the exact nearby amortization split", () => {
  const split = suggestedLoanPaymentSplit({
    interestMethod: "amortizing",
    schedule: [{ dueDate: "2026-08-13", paymentCents: 126575, principalCents: 95825, interestCents: 30750, feeCents: 0 }],
  }, 126575, "2026-08-13");
  assert.deepEqual(split, { principal: 95825, interest: 30750, fee: 0 });
});

test("uses a monthly installment paid up to two weeks early and marks it as estimated", () => {
  const suggestion = suggestedLoanPayment({
    interestMethod: "amortizing",
    paymentFrequency: "monthly",
    schedule: [{ dueDate: "2026-09-09", paymentCents: 95386, principalCents: 89869, interestCents: 5517, feeCents: 0 }],
  }, 95386, "2026-08-31");

  assert.deepEqual(suggestion, {
    split: { principal: 89869, interest: 5517, fee: 0 },
    basis: "early_schedule",
    dueDate: "2026-09-09",
  });
});

test("leaves an unmatched interest-bearing payment unallocated", () => {
  const suggestion = suggestedLoanPayment({
    interestMethod: "amortizing",
    paymentFrequency: "monthly",
    schedule: [{ dueDate: "2026-10-09", paymentCents: 95386, principalCents: 90541, interestCents: 4845, feeCents: 0 }],
  }, 95386, "2026-08-31");

  assert.deepEqual(suggestion, {
    split: { principal: 0, interest: 0, fee: 0 },
    basis: "unavailable",
  });
});

test("treats payments on verified interest-free loans as principal", () => {
  assert.deepEqual(suggestedLoanPaymentSplit({
    interestMethod: "interest_free",
    schedule: [],
  }, 25000, "2026-08-31"), { principal: 25000, interest: 0, fee: 0 });
});

test("prorates a split payment and preserves every cent", () => {
  const split = suggestedLoanPaymentSplit({
    interestMethod: "amortizing",
    schedule: [{ dueDate: "2026-08-13", paymentCents: 126575, principalCents: 95825, interestCents: 30750, feeCents: 0 }],
  }, 63290, "2026-08-13");
  assert.equal(split.principal + split.interest + split.fee, 63290);
  assert.deepEqual(split, { principal: 47914, interest: 15376, fee: 0 });
});

test("reuses a fixed-fee transaction template outside the date window", () => {
  const split = suggestedLoanPaymentSplit({
    interestMethod: "fixed_fee",
    schedule: [{ dueDate: "2026-05-27", paymentCents: 46873, principalCents: 24481, interestCents: 0, feeCents: 22392 }],
  }, 46873, "2026-09-02");
  assert.deepEqual(split, { principal: 24481, interest: 0, fee: 22392 });
});

test("allocates one Amex withdrawal across two scheduled draws", () => {
  const allocations = suggestedLoanPaymentAllocations([
    {
      id: "3141136",
      lenderName: "American Express",
      bookkeepingAccountId: "amex-bloc",
      schedule: [{ dueDate: "2026-08-18", paymentCents: 184560, principalCents: 150000, interestCents: 0, feeCents: 34560 }],
    },
    {
      id: "3151323",
      lenderName: "American Express",
      bookkeepingAccountId: "amex-bloc",
      schedule: [{ dueDate: "2026-08-18", paymentCents: 62048, principalCents: 46112, interestCents: 0, feeCents: 15936 }],
    },
  ], 246608, "2026-08-19");

  assert.deepEqual(allocations, [
    { loanId: "3141136", principal: 150000, interest: 0, fee: 34560 },
    { loanId: "3151323", principal: 46112, interest: 0, fee: 15936 },
  ]);
});

test("does not combine loans from different facilities", () => {
  const allocations = suggestedLoanPaymentAllocations([
    {
      id: "one",
      lenderName: "American Express",
      bookkeepingAccountId: "facility-one",
      schedule: [{ dueDate: "2026-08-18", paymentCents: 10000, principalCents: 9000, interestCents: 0, feeCents: 1000 }],
    },
    {
      id: "two",
      lenderName: "American Express",
      bookkeepingAccountId: "facility-two",
      schedule: [{ dueDate: "2026-08-18", paymentCents: 20000, principalCents: 18000, interestCents: 0, feeCents: 2000 }],
    },
  ], 30000, "2026-08-19");

  assert.deepEqual(allocations, []);
});
