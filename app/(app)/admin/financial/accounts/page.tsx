import { redirect } from "next/navigation";
import { getProfile } from "@/actions/auth";
import { getFinancialWorkspaceData } from "@/actions/financial-workspace";
import { Badge } from "@/components/ui/badge";
import { FinancialWorkspaceShell } from "@/components/financial/financial-workspace-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function FinancialAccountsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");
  const data = await getFinancialWorkspaceData();
  return (
    <FinancialWorkspaceShell active="accounts">
      <div className="mb-5"><h2 className="text-lg font-semibold">Chart of accounts</h2><p className="mt-1 text-sm text-muted-foreground">The accounts used to classify reviewed bank activity and build financial reports.</p></div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table><TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead className="w-28">Number</TableHead><TableHead>Account</TableHead><TableHead>Type</TableHead><TableHead>Detail type</TableHead><TableHead>Source</TableHead></TableRow></TableHeader><TableBody>
          {data.accounts.map((account) => <TableRow key={account.id}><TableCell className="font-mono text-muted-foreground">{account.accountNumber ?? "—"}</TableCell><TableCell className="font-medium">{account.name}</TableCell><TableCell>{account.accountType}</TableCell><TableCell className="text-muted-foreground">{account.detailType ?? "—"}</TableCell><TableCell><Badge variant="outline">{account.externalSource === "quickbooks" ? "QuickBooks" : "Manual"}</Badge></TableCell></TableRow>)}
        </TableBody></Table>
        {!data.accounts.length && <div className="px-5 py-14 text-center text-sm text-muted-foreground">No chart-of-accounts entries have been imported yet.</div>}
      </div>
    </FinancialWorkspaceShell>
  );
}
