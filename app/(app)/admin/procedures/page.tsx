import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getOverheadDashboardData } from "@/actions/overhead";
import { ProcedureCostWorkspace } from "@/components/procedures/procedure-cost-workspace";

export default async function ProcedureCostsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const overheadData = await getOverheadDashboardData();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Procedure Costs</h1>
        <p className="text-muted-foreground">
          Start translating overhead, supplies, labs, and chair time into a truer procedure-level cost model.
        </p>
      </div>

      <ProcedureCostWorkspace
        overheadPerOperatoryHourCents={
          overheadData.summary.cost_per_operatory_hour_cents
        }
        fullCapacityOverheadRateCents={
          overheadData.summary.full_capacity_cost_per_operatory_hour_cents
        }
        overheadSetupRequired={Boolean(overheadData.setupRequired)}
      />
    </div>
  );
}
