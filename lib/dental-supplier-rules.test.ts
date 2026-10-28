import assert from "node:assert/strict";
import test from "node:test";
import { dentalSupplierFingerprint, transactionVendorRuleKey, transactionRuleCandidates, transactionRuleFingerprint, isAutoApprovalEligibleTransaction } from "./financial-transactions";

const purchase = (name: string, merchant_name: string | null = null) => ({
  name, merchant_name, counterparty_name: null, original_description: null,
  amount_cents: 2726, pending: false,
});

test("Net32 sellers share one identity regardless of enriched merchant", () => {
  for (const seller of ["Smartchoice Den", "Mvp Dental Supp", "Brookshire Inno", "Premium Plus De", "Frontier Dental", "Tradent Supply", "Pa Dental"]) {
    const row = purchase(`Net32* ${seller} Net32.com Nc`, seller);
    assert.equal(transactionVendorRuleKey(row), "net32");
    assert.equal(transactionRuleFingerprint(row), "net32 marketplace");
    assert.deepEqual(transactionRuleCandidates(row), ["net32"]);
    assert.equal(isAutoApprovalEligibleTransaction(row), true);
    assert.equal(isAutoApprovalEligibleTransaction({ ...row, pending: true }), false);
  }
});

test("direct Frontier purchases have their own stable identity", () => {
  const row = purchase("Frontier Dental 800-555-0100 CA", "Frontier Dental");
  assert.equal(dentalSupplierFingerprint(row), "frontier dental");
  assert.equal(isAutoApprovalEligibleTransaction(row), true);
});

test("refunds keep the category identity without silently enabling inflow posting", () => {
  const row = { ...purchase("Net32* Mvp Dental Supp Cary Nc"), amount_cents: -709 };
  assert.equal(transactionRuleFingerprint(row), "net32 marketplace");
  assert.deepEqual(transactionRuleCandidates(row), ["net32"]);
  assert.equal(isAutoApprovalEligibleTransaction(row), false);
  assert.equal(isAutoApprovalEligibleTransaction({ ...row, amount_cents: 0 }), false);
});

test("use original descriptor, not loose mentions or enriched merchant names", () => {
  assert.equal(dentalSupplierFingerprint({ ...purchase("Unrelated seller", "Net32"), original_description: "OTHER PURCHASE" }), null);
  for (const name of ["NET320 STORE", "PAYMENT TO NET32", "Frontier Airlines", "Refund for Frontier Dental", "NET32PAYMENT"]) {
    assert.equal(dentalSupplierFingerprint(purchase(name)), null);
  }
  assert.equal(dentalSupplierFingerprint({ ...purchase("Brookshire Inn"), original_description: "Net32* Brookshire Inno Net32.com Nc" }), "net32");
});
