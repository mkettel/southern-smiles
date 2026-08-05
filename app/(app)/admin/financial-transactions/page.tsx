import Link from "next/link";
import { redirect } from "next/navigation";
import { DatabaseZap } from "lucide-react";
import { getProfile } from "@/actions/auth";
import { getFinancialTransactionDashboardData } from "@/actions/financial-transactions";
import { FinancialTransactionsDashboard } from "@/components/financial-transactions/financial-transactions-dashboard";
import { Button } from "@/components/ui/button";

export default async function AdminFinancialTransactionsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const data = await getFinancialTransactionDashboardData().catch(() => null);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Transaction Inbox</h1>
          <p className="text-sm text-muted-foreground">
            Review imported bank activity before it becomes trusted bookkeeping data.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/admin/financial-connections" />}>
          Manage connections
        </Button>
      </div>

      {data ? <FinancialTransactionsDashboard initialData={data} /> : <SchemaSetupNotice />}
    </div>
  );
}

function SchemaSetupNotice() {
  return (
    <div className="rounded-md border bg-card p-6 text-sm text-card-foreground">
      <div className="flex items-start gap-3">
        <DatabaseZap className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div>
          <h2 className="font-medium">Transaction ledger migration is ready to apply</h2>
          <p className="mt-1 text-muted-foreground">
            Apply the financial transaction migration to enable imports and review.
          </p>
        </div>
      </div>
    </div>
  );
}
