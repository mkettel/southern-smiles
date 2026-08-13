import { getFinancialLoansData } from "@/actions/financial-loans";
import { FinancialLoansDashboard } from "@/components/financial/financial-loans-dashboard";
import { FinancialWorkspaceShell } from "@/components/financial/financial-workspace-shell";

export default async function FinancialLoansPage() {
  const data = await getFinancialLoansData();
  return (
    <FinancialWorkspaceShell active="loans">
      <FinancialLoansDashboard initialData={data} />
    </FinancialWorkspaceShell>
  );
}

