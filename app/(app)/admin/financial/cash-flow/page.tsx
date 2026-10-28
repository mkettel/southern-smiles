import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { requireMemberModulePage } from "@/actions/member-module-access";
import { getFinancialCashFlowData } from "@/actions/financial-cash-flow";
import { FinancialCashFlowDashboard } from "@/components/financial/financial-cash-flow-dashboard";
import { FinancialWorkspaceShell } from "@/components/financial/financial-workspace-shell";

export default async function FinancialCashFlowPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  await requireMemberModulePage("financial");
  const data = await getFinancialCashFlowData();
  return <FinancialWorkspaceShell active="cash-flow"><FinancialCashFlowDashboard initialData={data} /></FinancialWorkspaceShell>;
}
