import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getFinancialWorkspaceData } from "@/actions/financial-workspace";
import { FinancialRulesTable } from "@/components/financial/financial-rules-table";
import { FinancialWorkspaceShell } from "@/components/financial/financial-workspace-shell";

export default async function FinancialRulesPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");
  const data = await getFinancialWorkspaceData();
  return (
    <FinancialWorkspaceShell active="rules">
      <div className="mb-5"><h2 className="text-lg font-semibold">Categorization rules</h2><p className="mt-1 text-sm text-muted-foreground">Vendor rules are learned when you approve transactions. Change the destination here to update future suggestions.</p></div>
      <FinancialRulesTable rules={data.rules} autoRules={data.autoRules} accounts={data.accounts} />
    </FinancialWorkspaceShell>
  );
}
