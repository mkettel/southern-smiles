import { redirect } from "next/navigation";
import { Landmark } from "lucide-react";
import { getProfile } from "@/actions/auth";
import { getFinancialConnectionsDashboardData } from "@/actions/financial-connections";
import { FinancialWorkspaceShell } from "@/components/financial/financial-workspace-shell";
import { FinancialConnectionsDashboard } from "@/components/financial-connections/financial-connections-dashboard";

export default async function AdminFinancialConnectionsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const data = await getFinancialConnectionsDashboardData().catch(() => null);

  return (
    <FinancialWorkspaceShell active="connections">
      <div className="mb-5"><h2 className="text-lg font-semibold">Connections</h2><p className="mt-1 text-sm text-muted-foreground">Choose which connected bank and credit-card accounts belong in bookkeeping and debt totals.</p></div>
      {data ? (
        <FinancialConnectionsDashboard initialData={data} />
      ) : (
        <SchemaSetupNotice />
      )}
    </FinancialWorkspaceShell>
  );
}

function SchemaSetupNotice() {
  return (
    <div className="rounded-md border bg-card p-6 text-sm text-card-foreground">
      <div className="flex items-start gap-3">
        <Landmark className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div>
          <h2 className="font-medium">Financial connection schema is ready to apply</h2>
          <p className="mt-1 text-muted-foreground">
            Apply the financial-connections migration to enable secure card balance storage.
          </p>
        </div>
      </div>
    </div>
  );
}
