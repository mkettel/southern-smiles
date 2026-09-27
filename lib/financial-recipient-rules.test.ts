import assert from "node:assert/strict";
import test from "node:test";
import { findBestMatchingBookkeepingAccountId, transactionRuleCandidates, transactionVendorRuleKey } from "./financial-transactions";

const payment = (name: string, original_description: string | null = null) => ({
  name, original_description, merchant_name: "Zelle", counterparty_name: null,
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
