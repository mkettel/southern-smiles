import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateTotalCreditCardDebtCents,
  dollarsToCents,
  isTotalCreditCardDebtStat,
} from "@/lib/financial-connections";
import {
  decryptFinancialToken,
  encryptFinancialToken,
} from "@/lib/financial-token-crypto";

const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

test("encrypts and decrypts financial tokens", () => {
  const encrypted = encryptFinancialToken("access-sandbox-secret", TEST_KEY);

  assert.notEqual(encrypted, "access-sandbox-secret");
  assert.equal(
    decryptFinancialToken(encrypted, TEST_KEY),
    "access-sandbox-secret",
  );
});

test("rejects a financial token encrypted with another key", () => {
  const encrypted = encryptFinancialToken("access-sandbox-secret", TEST_KEY);
  const otherKey = Buffer.alloc(32, 8).toString("base64");

  assert.throws(() => decryptFinancialToken(encrypted, otherKey));
});

test("sums only active included positive credit-card balances", () => {
  assert.equal(
    calculateTotalCreditCardDebtCents([
      { current_balance_cents: 10_000, included_in_total: true, is_active: true },
      { current_balance_cents: 2_500, included_in_total: false, is_active: true },
      { current_balance_cents: 7_500, included_in_total: true, is_active: false },
      { current_balance_cents: -300, included_in_total: true, is_active: true },
      { current_balance_cents: null, included_in_total: true, is_active: true },
    ]),
    10_000,
  );
});

test("converts Plaid dollar balances to integer cents", () => {
  assert.equal(dollarsToCents(93.99), 9_399);
  assert.equal(dollarsToCents(null), null);
});

test("recognizes the managed Owner credit-card debt stat", () => {
  assert.equal(
    isTotalCreditCardDebtStat({
      name: " Total Credit Card Debt ",
      stat_type: "dollar",
    }),
    true,
  );
  assert.equal(
    isTotalCreditCardDebtStat({ name: "Total Credit Card Debt", stat_type: "count" }),
    false,
  );
});

