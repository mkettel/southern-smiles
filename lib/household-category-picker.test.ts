import { test } from "node:test";
import assert from "node:assert/strict";
import { householdCategoryName, householdCategoryOptions } from "./household-category-picker";
import type { BookkeepingAccount, FinancialTransaction } from "./financial-transactions";

const accounts: BookkeepingAccount[] = ["Groceries", "Entertainment", "Rare category"].map((name, i) => ({ id: String(i), name, accountNumber: "5100", accountType: "Expense", detailType: null, externalSource: "manual" }));
const history = [{ bookkeeping_account_id: "0", review_status: "reviewed", pending: false, is_removed: false }] as FinancialTransaction[];
test("household labels omit embedded codes without changing records", () => {
  const account = { ...accounts[0], name: "5100 Groceries" };
  assert.equal(householdCategoryName(account), "Groceries");
  assert.equal(account.name, "5100 Groceries");
  assert.equal(account.accountNumber, "5100");
});
test("frequent list retains current selection; search and show-all reveal unused categories", () => {
  assert.deepEqual(householdCategoryOptions(accounts, history, "1", false, "").map(a => a.id), ["0", "1"]);
  assert.equal(householdCategoryOptions(accounts, history, "", true, "").length, 3);
  assert.deepEqual(householdCategoryOptions(accounts, history, "", false, "rare").map(a => a.id), ["2"]);
});
test("new households can choose all categories and pending activity does not teach preferences", () => {
  assert.equal(householdCategoryOptions(accounts, [], "", false, "").length, 3);
  assert.equal(householdCategoryOptions(accounts, [{ ...history[0], pending: true }], "", false, "").length, 3);
});
