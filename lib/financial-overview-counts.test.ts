import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { summarizeWorkspaceReview } from "./financial-workspace";

type ReviewRow = Parameters<typeof summarizeWorkspaceReview>[0][number];
const row = (changes: Partial<ReviewRow> = {}): ReviewRow => ({ pending:false, review_status:"pending", is_removed:false, plaid_category_primary:null, ...changes });

test("counts settled review separately from bank settlement and excludes removed/reviewed/excluded", () => {
  const counts = summarizeWorkspaceReview([row(),row({plaid_category_primary:"TRANSFER_OUT"}),row({pending:true}),row({pending:true,review_status:"excluded"}),row({is_removed:true}),row({review_status:"reviewed"}),row({review_status:"excluded"})]);
  assert.deepEqual(counts,{pendingCount:2,possibleTransferCount:1,settlingCount:1});
});

test("transfer bank labels are suggestions, never a claim of unmatched records", () => {
  const counts = summarizeWorkspaceReview([row({plaid_category_primary:"transfer_in"}),row({plaid_category_primary:"TRANSFER_OUT",pending:true}),row({plaid_category_primary:"TRANSFER_OUT",review_status:"reviewed"})]);
  assert.equal(counts.possibleTransferCount,1);
  assert.equal(counts.pendingCount,1);
  assert.equal(counts.settlingCount,1);
});

test("selected-month UI never uses all-history counts or claims unmatched transfers", () => {
  const source = readFileSync(new URL("../components/financial/financial-overview-dashboard.tsx",import.meta.url),"utf8");
  assert.match(source,/Review \{selectedMonth.pendingCount/);
  assert.doesNotMatch(source,/data.pendingCount|unmatchedTransferCount|Unmatched transfers|Uncategorized transactions/);
  assert.match(source,/selectedMonth.settlingCount/);
  assert.match(source,/Earlier months/);
  assert.match(source,/As of today/);
});

test("server derives each monthly queue from that month's rows without altering settled P&L scope", () => {
  const source = readFileSync(new URL("../actions/financial-workspace.ts",import.meta.url),"utf8");
  assert.match(source,/transaction.transaction_date >= frame.start && transaction.transaction_date < frame.end/);
  assert.match(source,/summarizeWorkspaceReview\(monthTransactions\)/);
  assert.match(source,/summarizeTransactions\(monthTransactions.filter\(\(transaction\) => !transaction.pending\)/);
  assert.match(source,/\.order\("id", \{ ascending: false \}\)/);
});
