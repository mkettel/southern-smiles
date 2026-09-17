import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { requireMemberModulePage } from "@/actions/member-module-access";
import { getFinancialWorkspaceData } from "@/actions/financial-workspace";
import { getHouseholdFinanceData } from "@/actions/household-finance";
import { getHouseholdRecurringData } from "@/actions/household-recurring";
import { getWorkspaceAccess } from "@/actions/workspace-access";
import { FinancialOverviewDashboard } from "@/components/financial/financial-overview-dashboard";
import { FinancialWorkspaceShell } from "@/components/financial/financial-workspace-shell";
import { HouseholdOverviewDashboard } from "@/components/financial/household-overview-dashboard";

export default async function AdminFinancialPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  await requireMemberModulePage("financial");

  const access = await getWorkspaceAccess();

  if (access.workspaceType === "household") {
    const [data, recurring] = await Promise.all([getHouseholdFinanceData(), getHouseholdRecurringData()]);
    return (
      <FinancialWorkspaceShell active="overview">
        {data ? (
          <HouseholdOverviewDashboard data={data} recurring={recurring} />
        ) : (
          <section className="rounded-lg border bg-card px-6 py-14 text-center text-sm text-muted-foreground">
            Financial connections are not set up for this workspace yet.{" "}
            <Link href="/admin/financial-connections" className="font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400">
              Open connections
            </Link>
          </section>
        )}
      </FinancialWorkspaceShell>
    );
  }

  const data = await getFinancialWorkspaceData();
  return <FinancialWorkspaceShell active="overview"><FinancialOverviewDashboard data={data} /></FinancialWorkspaceShell>;
}
