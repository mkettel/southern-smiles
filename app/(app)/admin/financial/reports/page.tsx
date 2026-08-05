import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getFinancialWorkspaceData } from "@/actions/financial-workspace";
import { FinancialReportsDashboard } from "@/components/financial/financial-reports-dashboard";
import { FinancialWorkspaceShell } from "@/components/financial/financial-workspace-shell";

export default async function FinancialReportsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");
  const data = await getFinancialWorkspaceData();
  return <FinancialWorkspaceShell active="reports"><FinancialReportsDashboard data={data} /></FinancialWorkspaceShell>;
}
