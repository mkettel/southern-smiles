import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getOverheadDashboardData } from "@/actions/overhead";
import { OverheadDashboard } from "@/components/overhead/overhead-dashboard";
import { getWorkspaceAccess } from "@/actions/workspace-access";
import { getWorkspaceLabel } from "@/lib/workspace-access";

export default async function OverheadPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const [data, access] = await Promise.all([
    getOverheadDashboardData(),
    getWorkspaceAccess(),
  ]);
  const featureLabel = getWorkspaceLabel(access, "budgeting", "Overhead");

  return (
    <div className="mx-auto max-w-7xl">
      <OverheadDashboard initialData={data} featureLabel={featureLabel} />
    </div>
  );
}
