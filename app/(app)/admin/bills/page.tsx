import { redirect } from "next/navigation";
import { ReceiptText } from "lucide-react";
import { getProfile } from "@/actions/auth";
import { getBillsDashboardData, getCanAccessBills } from "@/actions/bills";
import { BillsDashboard } from "@/components/bills/bills-dashboard";

export default async function AdminBillsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!(await getCanAccessBills())) redirect("/dashboard");

  const billsData = await getBillsDashboardData().catch(() => null);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Bills</h1>
        <p className="text-muted-foreground text-sm">
          Track vendor invoices, aging, paid history, and the Division 7 Bills stat.
        </p>
      </div>

      {billsData ? <BillsDashboard initialData={billsData} /> : <BillsSetupNotice />}
    </div>
  );
}

function BillsSetupNotice() {
  return (
    <div className="rounded-xl border bg-card p-6 text-sm text-card-foreground ring-1 ring-foreground/10">
      <div className="flex items-start gap-3">
        <ReceiptText className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div>
          <h2 className="font-medium">Bills schema is ready to apply</h2>
          <p className="mt-1 text-muted-foreground">
            Apply `supabase/migrations/038_add_bills.sql` to enable the Bills
            tracker against this Supabase project.
          </p>
        </div>
      </div>
    </div>
  );
}
