import type { FinancialTransaction } from "./financial-transactions";

type ReviewState = Pick<FinancialTransaction, "pending" | "review_status">;
export type ReviewFilter = "all" | "pending" | "bank_pending" | "reviewed" | "excluded";

export function needsBookkeepingReview(transaction: ReviewState) {
  return !transaction.pending && transaction.review_status === "pending";
}

export function matchesReviewFilter(transaction: ReviewState, filter: ReviewFilter) {
  if (filter === "all") return true;
  if (filter === "bank_pending") return transaction.pending && transaction.review_status !== "excluded";
  if (filter === "pending") return needsBookkeepingReview(transaction);
  return transaction.review_status === filter;
}
