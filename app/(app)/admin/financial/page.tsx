import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getFinancialWorkspaceData } from "@/actions/financial-workspace";
import { FinancialOverviewDashboard } from "@/components/financial/financial-overview-dashboard";
import { FinancialWorkspaceShell } from "@/components/financial/financial-workspace-shell";

export default async function AdminFinancialPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");
  const data = await getFinancialWorkspaceData();
  return <FinancialWorkspaceShell active="overview"><FinancialOverviewDashboard data={data} /></FinancialWorkspaceShell>;
}
