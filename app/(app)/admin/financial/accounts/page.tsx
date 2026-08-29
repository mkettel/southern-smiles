import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getFinancialWorkspaceData } from "@/actions/financial-workspace";
import { ChartOfAccountsManager } from "@/components/financial/chart-of-accounts-manager";
import { FinancialWorkspaceShell } from "@/components/financial/financial-workspace-shell";

export default async function FinancialAccountsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");
  const data = await getFinancialWorkspaceData();
  return (
    <FinancialWorkspaceShell active="accounts">
      <div className="mb-5"><h2 className="text-lg font-semibold">Chart of accounts</h2><p className="mt-1 text-sm text-muted-foreground">Add, edit, and remove the accounts used to classify reviewed bank activity and build financial reports.</p></div>
      <ChartOfAccountsManager accounts={data.accounts} />
    </FinancialWorkspaceShell>
  );
}
