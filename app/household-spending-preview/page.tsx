import { notFound } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { HouseholdSpendingExplorer } from "@/components/financial/household-spending-explorer";
import { PreviewChrome, buildPreviewFixtures, previewAccounts, previewToday } from "@/lib/household-preview-fixtures";
import { isSpendingTransaction, withSpendingCategories } from "@/lib/household-spending";

// Dev-only preview of the household Spending explorer with sample data.
export default function HouseholdSpendingPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const today = previewToday();
  const { transactions } = buildPreviewFixtures(today, 24);
  // Sample assignments only; production uses saved transaction account IDs.
  const sampleAssignments: Record<string, string> = { FOOD_AND_DRINK: "groceries", GENERAL_MERCHANDISE: "supplies" };
  const spending = withSpendingCategories(transactions.filter(isSpendingTransaction).map((txn) => ({
    ...txn, bookkeeping_account_id: sampleAssignments[txn.plaid_category_primary ?? ""] ?? null,
  })), [
    { id: "groceries", account_number: "5100", name: "Groceries" },
    { id: "supplies", account_number: "5200", name: "Household supplies" },
  ]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar role="admin" practiceName="Kettelkamp Household" />
      <PreviewChrome title="Finances · Spending">
        <HouseholdSpendingExplorer accounts={previewAccounts} transactions={spending} today={today} />
      </PreviewChrome>
    </div>
  );
}
