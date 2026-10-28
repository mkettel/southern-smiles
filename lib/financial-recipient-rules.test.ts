import assert from "node:assert/strict";
import test from "node:test";
import { findBestMatchingBookkeepingAccountId, transactionRuleCandidates, transactionVendorRuleKey, transactionRuleFingerprint, isAutoApprovalEligibleTransaction } from "./financial-transactions";

const payment = (name: string, original_description: string | null = null) => ({
  name, original_description, merchant_name: "Zelle", counterparty_name: null,
});

test("autoapproval fingerprints keep recipient and direction, not references", () => {
  const outgoing = { ...payment("Zelle", "ZELLE TO MARTA ON 10/23 REF # WFCT22SXK45Y"), amount_cents: 15000, pending: false };
  assert.equal(transactionRuleFingerprint(outgoing), "zelle to marta");
  assert.equal(isAutoApprovalEligibleTransaction(outgoing), true);
  assert.equal(transactionRuleFingerprint({ ...outgoing, original_description: "ZELLE TO MARTA ON 11/01 REF # NEWREF" }), "zelle to marta");
  assert.equal(transactionRuleFingerprint({ ...outgoing, original_description: "ZELLE TO MARIA ON 11/01 REF # NEWREF" }), "zelle to maria");
  assert.equal(isAutoApprovalEligibleTransaction({ ...outgoing, pending: true }), false);
  assert.equal(isAutoApprovalEligibleTransaction({ ...outgoing, amount_cents: -15000 }), false);
  assert.equal(isAutoApprovalEligibleTransaction({ ...outgoing, original_description: "Zelle" }), false);
  assert.equal(isAutoApprovalEligibleTransaction({ ...outgoing, original_description: "ZELLE FROM MARTA ON 10/23" }), false);
  assert.equal(isAutoApprovalEligibleTransaction({ ...outgoing, name: "ZELLE TO MARIA ON 10/23" }), false);
  assert.equal(isAutoApprovalEligibleTransaction({ ...outgoing, merchant_name: "EverBank", name: "EverBank", original_description: "BUSINESS TO BUSINESS ACH EverBank, N.A. EverBank 261016 AC-BUND123 TEST" }), false);
});

test("Marta rule ignores dates and references but preserves recipient and direction", () => {
  for (const date of ["09/18", "09/25/26"]) {
    assert.equal(transactionVendorRuleKey(payment(`ZELLE TO MARTA ON ${date} REF # WFCT22PLBM35`)), "zelle to marta");
  }
  assert.equal(transactionVendorRuleKey(payment("ZELLE FROM MARTA ON 09/25 REF # ABC")), "zelle from marta");
  assert.equal(transactionVendorRuleKey(payment("ZELLE TO MARIA ON 09/25 REF # ABC")), "zelle to maria");
});

test("unknown or conflicting recipients do not teach a Zelle rule", () => {
  assert.equal(transactionVendorRuleKey(payment("Zelle")), "");
  assert.deepEqual(transactionRuleCandidates(payment("Zelle payment")), []);
  assert.equal(transactionVendorRuleKey(payment("ZELLE TO MARTA ON 09/25", "ZELLE TO MARIA ON 09/25")), "");
});

test("original bank description identifies recipient when merchant is generic", () => {
  assert.equal(transactionVendorRuleKey(payment("Zelle", "ZELLE TO MARTA ON 09/25 REF # ABC")), "zelle to marta");
});

test("Marta matches her exact rule, not a broad legacy Zelle rule or another recipient", () => {
  const rules = [
    { normalizedVendor: "zelle", bookkeepingAccountId: "janitorial", matchType: "contains" as const },
    { normalizedVendor: "zelle to marta", bookkeepingAccountId: "maintenance", matchType: "exact" as const },
  ];
  assert.equal(findBestMatchingBookkeepingAccountId(transactionRuleCandidates(payment("ZELLE TO MARTA ON 09/25")), rules), "maintenance");
  assert.equal(findBestMatchingBookkeepingAccountId(transactionRuleCandidates(payment("ZELLE TO MARIA ON 09/25")), rules), undefined);
  assert.equal(findBestMatchingBookkeepingAccountId(["zelle"], rules), undefined);
  assert.equal(findBestMatchingBookkeepingAccountId(["zelle to marta"], [rules[0]]), undefined);
});

test("ordinary merchant rules remain unchanged", () => {
  const transaction = { name: "AMAZON RETA 123", merchant_name: "Amazon", counterparty_name: null };
  assert.equal(transactionVendorRuleKey(transaction), "amazon");
  assert.deepEqual(transactionRuleCandidates(transaction), ["amazon", "amazon reta 123"]);
});
