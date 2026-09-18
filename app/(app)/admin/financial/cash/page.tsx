import { getCashExpenseData } from "@/actions/household-cash";
import { FinancialWorkspaceShell } from "@/components/financial/financial-workspace-shell";
import { HouseholdCashExpenses } from "@/components/financial/household-cash-expenses";

export default async function CashExpensesPage() {
  const data = await getCashExpenseData();
  return <FinancialWorkspaceShell active="spending"><HouseholdCashExpenses data={data} /></FinancialWorkspaceShell>;
}
