import assert from "node:assert/strict";
import test from "node:test";
import { isAutoApprovalEligibleTransaction, transactionRuleFingerprint } from "./financial-transactions";

const purchase = {
  name: "MCDONALD'S F3812", original_description: "MCDONALD'S F3812",
  merchant_name: "McDonald's", counterparty_name: null, amount_cents: 1714, pending: false,
};

test("identified McDonald's purchases can learn a shared automatic rule", () => {
  assert.equal(transactionRuleFingerprint(purchase), "mcdonald s");
  assert.equal(isAutoApprovalEligibleTransaction(purchase), true);
  assert.equal(transactionRuleFingerprint({ ...purchase, original_description: "MCDONALD'S F36225" }), "mcdonald s");
});

test("pending purchases and unrecognized short descriptions remain ineligible", () => {
  assert.equal(isAutoApprovalEligibleTransaction({ ...purchase, pending: true }), false);
  assert.equal(isAutoApprovalEligibleTransaction({ ...purchase, merchant_name: null }), false);
  assert.equal(isAutoApprovalEligibleTransaction({ ...purchase, amount_cents: -1714 }), false);
  assert.equal(isAutoApprovalEligibleTransaction({ ...purchase, merchant_name: "Wire transfer", original_description: "Wire transfer" }), false);
});
