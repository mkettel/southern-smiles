import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getOverheadDashboardData } from "@/actions/overhead";
import { OverheadDashboard } from "@/components/overhead/overhead-dashboard";

export default async function OverheadPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const data = await getOverheadDashboardData();

  return (
    <div className="mx-auto max-w-7xl">
      <OverheadDashboard initialData={data} />
    </div>
  );
}
