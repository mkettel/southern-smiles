import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { requireMemberModulePage } from "@/actions/member-module-access";
import { getFinancialReportsData } from "@/actions/financial-workspace";
import { FinancialReportsDashboard } from "@/components/financial/financial-reports-dashboard";
import { FinancialWorkspaceShell } from "@/components/financial/financial-workspace-shell";

export default async function FinancialReportsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  await requireMemberModulePage("financial");
  const data = await getFinancialReportsData();
  return <FinancialWorkspaceShell active="reports"><FinancialReportsDashboard data={data} /></FinancialWorkspaceShell>;
}
