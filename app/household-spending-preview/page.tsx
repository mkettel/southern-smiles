import { notFound } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { HouseholdSpendingExplorer } from "@/components/financial/household-spending-explorer";
import { PreviewChrome, buildPreviewFixtures, previewAccounts, previewToday } from "@/lib/household-preview-fixtures";
import { isSpendingTransaction } from "@/lib/household-spending";

// Dev-only preview of the household Spending explorer with sample data.
export default function HouseholdSpendingPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const today = previewToday();
  const { transactions } = buildPreviewFixtures(today, 24);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar role="admin" practiceName="Kettelkamp Household" />
      <PreviewChrome title="Finances · Spending">
        <HouseholdSpendingExplorer accounts={previewAccounts} transactions={transactions.filter(isSpendingTransaction)} today={today} />
      </PreviewChrome>
    </div>
  );
}
