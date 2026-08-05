import assert from "node:assert/strict";
import test from "node:test";
import type { Transaction } from "plaid";
import {
  calculateTransactionTotals,
  findMatchingBookkeepingAccountId,
  mapPlaidTransaction,
  normalizeVendorName,
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
