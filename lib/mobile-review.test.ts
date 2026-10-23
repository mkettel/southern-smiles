import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MobileReview } from "../components/financial-transactions/mobile-review";
import type { FinancialTransaction } from "./financial-transactions";

const transaction = { id: "one", name: "Example", amount_cents: 1234, currency_code: "USD", transaction_date: "2026-10-18", pending: false, review_status: "pending" } as FinancialTransaction;
function render(overrides: Partial<FinancialTransaction> = {}, category = "groceries", details = false) {
  return renderToStaticMarkup(createElement(MobileReview, {
    transactions: [{...transaction, ...overrides}], accounts: [], categories: {one: category},
    disabled: false, accountLabel: () => "Chase 7709", requiresDetails: () => details,
    onCategory: () => {}, onApprove: async () => true, onDetails: () => {},
  }));
}
test("settled categorized purchases have mobile approval", () => {
  assert.match(render(), />\s*Approve<\/button>/);
  assert.match(render(), /\$12\.34/);
});
test("bank pending and already reviewed transactions cannot enter swipe approval", () => {
  assert.doesNotMatch(render({pending:true}), />\s*Approve<\/button>/);
  assert.doesNotMatch(render({review_status:"reviewed"}), />\s*Approve<\/button>/);
});
test("uncategorized purchases and transfers require review rather than approval", () => {
  assert.doesNotMatch(render({}, ""), />\s*Approve<\/button>/);
  assert.doesNotMatch(render({}, "groceries", true), />\s*Approve<\/button>/);
  assert.match(render({}, "groceries", true), /Review transfer or loan/);
});
test("mobile swipe review offers skip but not destructive exclusion", () => {
  assert.match(render(), />Skip<\/button>/);
  assert.doesNotMatch(render(), /Exclude/);
});
