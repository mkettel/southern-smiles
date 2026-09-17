import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { requireMemberModulePage } from "@/actions/member-module-access";
import { getHouseholdSpendingData } from "@/actions/household-spending";
import { getWorkspaceAccess } from "@/actions/workspace-access";
import { FinancialWorkspaceShell } from "@/components/financial/financial-workspace-shell";
import { HouseholdSpendingExplorer } from "@/components/financial/household-spending-explorer";

export default async function HouseholdSpendingPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  await requireMemberModulePage("financial");

  const access = await getWorkspaceAccess();
  if (access.workspaceType !== "household") redirect("/admin/financial");

  const data = await getHouseholdSpendingData();

  return (
    <FinancialWorkspaceShell active="spending">
      {data ? (
        <HouseholdSpendingExplorer accounts={data.accounts} transactions={data.transactions} today={data.today} />
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
