import { redirect } from "next/navigation";
import { Landmark } from "lucide-react";
import { getProfile } from "@/actions/auth";
import { getFinancialConnectionsDashboardData } from "@/actions/financial-connections";
import { FinancialConnectionsDashboard } from "@/components/financial-connections/financial-connections-dashboard";

export default async function AdminFinancialConnectionsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const data = await getFinancialConnectionsDashboardData().catch(() => null);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Financial Connections</h1>
        <p className="text-sm text-muted-foreground">
          Manage the credit cards included in the Owner Total Credit Card Debt stat.
        </p>
      </div>

      {data ? (
        <FinancialConnectionsDashboard initialData={data} />
      ) : (
        <SchemaSetupNotice />
      )}
    </div>
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

