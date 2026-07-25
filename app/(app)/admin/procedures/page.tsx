import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getOverheadDashboardData } from "@/actions/overhead";
import { getSupplyWorkspace } from "@/actions/supplies";
import { ProcedureCostWorkspace } from "@/components/procedures/procedure-cost-workspace";

export default async function ProcedureCostsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const [overheadData, supplyWorkspace] = await Promise.all([
    getOverheadDashboardData(),
    getSupplyWorkspace(),
  ]);

  return (
    <div className="mx-auto max-w-[1500px]">
      <ProcedureCostWorkspace
        overheadPerOperatoryHourCents={
          overheadData.summary.cost_per_operatory_hour_cents
        }
        fullCapacityOverheadRateCents={
          overheadData.summary.full_capacity_cost_per_operatory_hour_cents
        }
        overheadSetupRequired={Boolean(overheadData.setupRequired)}
        supplyCatalog={supplyWorkspace?.catalog ?? []}
      />
    </div>
  );
}
