"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteFinancialRule, updateFinancialRule } from "@/actions/financial-workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BookkeepingAccount } from "@/lib/financial-transactions";
import type { FinancialWorkspaceRule } from "@/lib/financial-workspace";

export function FinancialRulesTable({ rules, accounts }: { rules: FinancialWorkspaceRule[]; accounts: BookkeepingAccount[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? rules.filter((rule) => rule.normalizedVendor.includes(normalized)) : rules;
  }, [query, rules]);
  const grouped = useMemo(() => {
    const byType = new Map<string, BookkeepingAccount[]>();
    for (const account of accounts) {
      const group = byType.get(account.accountType) ?? [];
      group.push(account);
      byType.set(account.accountType, group);
    }
    return [...byType.entries()];
  }, [accounts]);

  async function changeAccount(ruleId: string, bookkeepingAccountId: string) {
    setBusyId(ruleId);
    const result = await updateFinancialRule({ ruleId, bookkeepingAccountId });
    setBusyId(null);
    if (result.error) return toast.error(result.error);
    toast.success("Rule updated");
    startTransition(() => router.refresh());
  }

  async function remove(ruleId: string) {
    if (!window.confirm("Delete this categorization rule? Future transactions from this vendor will no longer be suggested automatically.")) return;
    setBusyId(ruleId);
    const result = await deleteFinancialRule(ruleId);
    setBusyId(null);
    if (result.error) return toast.error(result.error);
    toast.success("Rule deleted");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search vendor rules" className="pl-9" />
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead>Match</TableHead><TableHead>Send to</TableHead><TableHead>Source</TableHead><TableHead>Learned from</TableHead><TableHead className="w-16" /></TableRow></TableHeader>
          <TableBody>
            {filtered.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell><div className="font-medium capitalize">{rule.normalizedVendor}</div><div className="mt-0.5 text-xs text-muted-foreground">{rule.matchType === "contains" ? "Description contains" : "Exact vendor"}</div></TableCell>
                <TableCell className="w-[360px]">
                  <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={rule.bookkeepingAccountId} disabled={isPending || busyId === rule.id} onChange={(event) => changeAccount(rule.id, event.target.value)} aria-label={`Account for ${rule.normalizedVendor}`}>
                    {grouped.map(([type, entries]) => <optgroup key={type} label={type}>{entries.map((account) => <option key={account.id} value={account.id}>{account.accountNumber ? `${account.accountNumber} ` : ""}{account.name}</option>)}</optgroup>)}
                  </select>
                </TableCell>
                <TableCell><Badge variant="outline">{rule.source === "review" ? "Bookkeeping review" : "Imported history"}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{rule.sampleCount} transaction{rule.sampleCount === 1 ? "" : "s"}</TableCell>
                <TableCell><Button variant="ghost" size="icon-sm" title="Delete rule" aria-label={`Delete ${rule.normalizedVendor} rule`} disabled={isPending || busyId !== null} onClick={() => remove(rule.id)}><Trash2 /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!filtered.length && <div className="px-5 py-14 text-center text-sm text-muted-foreground">No rules match this search.</div>}
      </div>
    </div>
  );
}
