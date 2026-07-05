import { redirect } from "next/navigation";
import { BadgeDollarSign } from "lucide-react";
import { getProfile } from "@/actions/auth";
import { getCherryFinancingDashboardData } from "@/actions/cherry-financing";
import { CherryFinancingDashboard } from "@/components/cherry/cherry-financing-dashboard";

export default async function AdminCherryFinancingPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const data = await getCherryFinancingDashboardData().catch(() => null);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Approved Financing</h1>
        <p className="text-sm text-muted-foreground">
          Import Cherry approval emails and sync the Division 2 Approved
          Financing stat.
        </p>
      </div>

      {data ? (
        <CherryFinancingDashboard initialData={data} />
      ) : (
        <CherryFinancingSetupNotice />
      )}
    </div>
  );
}

function CherryFinancingSetupNotice() {
  return (
    <div className="rounded-xl border bg-card p-6 text-sm text-card-foreground ring-1 ring-foreground/10">
      <div className="flex items-start gap-3">
        <BadgeDollarSign className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div>
          <h2 className="font-medium">Cherry financing schema is ready to apply</h2>
          <p className="mt-1 text-muted-foreground">
            Apply `supabase/migrations/042_add_cherry_financing_approvals.sql`
            to enable Cherry approval imports against this Supabase project.
          </p>
        </div>
      </div>
    </div>
  );
}
