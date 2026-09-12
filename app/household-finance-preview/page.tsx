import { notFound } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { HouseholdOverviewDashboard } from "@/components/financial/household-overview-dashboard";
import { buildHouseholdFinanceData } from "@/lib/household-finance";
import { PreviewChrome, buildPreviewFixtures, previewAccounts, previewToday } from "@/lib/household-preview-fixtures";
import { detectRecurringStreams } from "@/lib/recurring-detection";

// Dev-only preview of the household overview with deterministic sample data,
// so the layout can be iterated on without a Plaid connection or a login.
export default function HouseholdFinancePreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const today = previewToday();
  const { transactions, snapshots } = buildPreviewFixtures(today);
  const data = buildHouseholdFinanceData({
    accounts: previewAccounts,
    transactions,
    snapshots,
    today,
    connectionCount: 3,
    lastSyncedAt: "2026-09-11T13:05:00Z",
  });
  const recurring = detectRecurringStreams({
    transactions,
    accounts: previewAccounts,
    today,
    overrides: { "rocket mortgage": "confirmed", "jiffy lube": "dismissed" },
  });

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar role="admin" practiceName="Kettelkamp Household" />
      <PreviewChrome title="Finances">
        <HouseholdOverviewDashboard data={data} recurring={recurring} previewMode />
      </PreviewChrome>
    </div>
  );
}
