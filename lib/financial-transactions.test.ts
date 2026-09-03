import assert from "node:assert/strict";
import test from "node:test";
import type { Transaction } from "plaid";
import {
  calculateCashMovement,
  calculateTransactionTotals,
  findBestMatchingBookkeepingAccountId,
  findMatchingBookkeepingAccountId,
  isAutoApprovalEligibleTransaction,
  mapPlaidTransaction,
  normalizeVendorName,
  transactionRuleFingerprint,
  transactionDisplayName,
  type FinancialTransaction,
} from "@/lib/financial-transactions";

test("mapPlaidTransaction normalizes merchant, category, and cents", () => {
  const transaction = {
    account_id: "account-1",
    transaction_id: "transaction-1",
    pending_transaction_id: null,
    date: "2026-08-04",
    authorized_date: "2026-08-03",
    datetime: null,
    authorized_datetime: null,
    name: "  DENTAL VENDOR  ",
    merchant_name: "  Dental Vendor  ",
    original_description: "  DENTAL VENDOR 123  ",
    amount: 93.99,
    iso_currency_code: "USD",
    unofficial_currency_code: null,
    pending: false,
    payment_channel: "online",
    website: "https://example.com",
    logo_url: null,
    merchant_entity_id: "merchant-1",
    counterparties: [],
    business_finance_category: {
      primary: "GENERAL_MERCHANDISE",
      detailed: "GENERAL_MERCHANDISE_OFFICE_SUPPLIES",
      confidence_level: "VERY_HIGH",
    },
    personal_finance_category: null,
  } as unknown as Transaction;

  const result = mapPlaidTransaction({
    transaction,
    practiceId: "practice-1",
    connectionId: "connection-1",
    accountId: "stored-account-1",
    syncedAt: "2026-08-05T00:00:00.000Z",
  });

  assert.equal(result.name, "DENTAL VENDOR");
  assert.equal(result.merchant_name, "Dental Vendor");
  assert.equal(result.amount_cents, 9399);
  assert.equal(result.plaid_category_detailed, "GENERAL_MERCHANDISE_OFFICE_SUPPLIES");
  assert.equal(result.is_removed, false);
});

test("calculateTransactionTotals treats positive Plaid amounts as outflow", () => {
  const totals = calculateTransactionTotals([
    { amount_cents: 12000, pending: false, is_removed: false },
    { amount_cents: -5000, pending: false, is_removed: false },
    { amount_cents: 3000, pending: true, is_removed: false },
    { amount_cents: 4000, pending: false, is_removed: true },
  ]);

  assert.deepEqual(totals, { outflowCents: 12000, inflowCents: 5000 });
});

test("calculateCashMovement reports inflow minus outflow", () => {
  const movement = calculateCashMovement([
    { amount_cents: -10118276, is_removed: false, pending: false },
    { amount_cents: 9377744, is_removed: false, pending: false },
    { amount_cents: 50000, is_removed: false, pending: true },
  ]);

  assert.deepEqual(movement, {
    outflowCents: 9377744,
    inflowCents: 10118276,
    netCents: 740532,
  });
});

test("transactionDisplayName prefers the recognized merchant", () => {
  const transaction = {
    merchant_name: "Recognized Merchant",
    counterparty_name: "Counterparty",
    name: "Raw bank description",
  } as Pick<FinancialTransaction, "merchant_name" | "counterparty_name" | "name">;

  assert.equal(transactionDisplayName(transaction), "Recognized Merchant");
});

test("normalizeVendorName creates a stable rule key", () => {
  assert.equal(normalizeVendorName(" NET32* PA Dental "), "net32 pa dental");
  assert.equal(normalizeVendorName("Google Ads / Southern Smiles"), "google ads southern smiles");
});

test("contains rules match changing mobile deposit reference numbers", () => {
  const rules = [
    {
      normalizedVendor: "mobile deposit",
      bookkeepingAccountId: "fee-for-service",
      matchType: "contains" as const,
    },
  ];

  assert.equal(
    findMatchingBookkeepingAccountId(
      normalizeVendorName("MOBILE DEPOSIT : REF NUMBER :117040706195"),
      rules,
    ),
    "fee-for-service",
  );
});

test("exact rules take priority over broader contains rules", () => {
  assert.equal(
    findMatchingBookkeepingAccountId("mobile deposit special", [
      {
        normalizedVendor: "mobile deposit",
        bookkeepingAccountId: "broad",
        matchType: "contains",
      },
      {
        normalizedVendor: "mobile deposit special",
        bookkeepingAccountId: "exact",
        matchType: "exact",
      },
    ]),
    "exact",
  );
});

test("specific description rules beat a generic merchant rule", () => {
  assert.equal(
    findBestMatchingBookkeepingAccountId(
      ["intuit", "recurring payment intuit qbooks online"],
      [
        { normalizedVendor: "intuit", bookkeepingAccountId: "payroll", matchType: "exact" },
        { normalizedVendor: "intuit qbooks", bookkeepingAccountId: "software", matchType: "contains" },
      ],
    ),
    "software",
  );
});

test("transaction fingerprints remove changing dates and reference numbers", () => {
  const first = {
    name: "Intuit",
    merchant_name: "Intuit",
    counterparty_name: null,
    original_description: "RECURRING PAYMENT AUTHORIZED ON 08/16 INTUIT *QBooks Onl S586228473898608 CARD 9389",
  };
  const second = {
    ...first,
    original_description: "RECURRING PAYMENT AUTHORIZED ON 09/16 INTUIT *QBooks Onl S991234567890123 CARD 9389",
  };

  assert.equal(transactionRuleFingerprint(first), transactionRuleFingerprint(second));
  assert.equal(
    transactionRuleFingerprint(first),
    "recurring payment authorized on intuit qbooks onl card",
  );
});

test("auto approval accepts recurring expenses but rejects transfers and loan payments", () => {
  const recurringExpense = {
    amount_cents: 14183,
    pending: false,
    name: "Intuit",
    merchant_name: "Intuit",
    counterparty_name: null,
    original_description: "RECURRING PAYMENT AUTHORIZED ON 08/16 INTUIT QBooks Online CARD 9389",
  };
  assert.equal(isAutoApprovalEligibleTransaction(recurringExpense), true);
  assert.equal(
    isAutoApprovalEligibleTransaction({
      ...recurringExpense,
      name: "American Express",
      original_description: "BUSINESS TO BUSINESS ACH AMEX EPAYMENT ACH PMT 260831",
    }),
    false,
  );
  assert.equal(
    isAutoApprovalEligibleTransaction({
      ...recurringExpense,
      name: "Wells Fargo",
      original_description: "ONLINE TRANSFER TO CHECKING XXXXXX6378 REF IB0ZHT2LPK",
    }),
    false,
  );
});
