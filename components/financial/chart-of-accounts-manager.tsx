"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createBookkeepingAccount,
  deleteBookkeepingAccount,
  updateBookkeepingAccount,
} from "@/actions/financial-workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { BookkeepingAccount } from "@/lib/financial-transactions";

const DEFAULT_ACCOUNT_TYPES = [
  "Income",
  "Other Income",
  "Expense",
  "Cost of Goods Sold",
  "Bank",
  "Accounts Receivable",
  "Other Current Asset",
  "Fixed Asset",
  "Accounts Payable",
  "Credit Card",
  "Other Current Liability",
  "Long Term Liability",
  "Equity",
];

type AccountForm = {
  accountNumber: string;
  name: string;
  accountType: string;
  detailType: string;
};

const EMPTY_FORM: AccountForm = {
  accountNumber: "",
  name: "",
  accountType: "Expense",
  detailType: "",
};

export function ChartOfAccountsManager({ accounts }: { accounts: BookkeepingAccount[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BookkeepingAccount | null>(null);
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isRefreshing, startTransition] = useTransition();

  const accountTypes = useMemo(
    () => [...new Set([...accounts.map((account) => account.accountType), ...DEFAULT_ACCOUNT_TYPES])].sort(),
    [accounts],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return accounts;
    return accounts.filter((account) =>
      [account.accountNumber, account.name, account.accountType, account.detailType]
        .some((value) => value?.toLowerCase().includes(normalized)),
    );
  }, [accounts, query]);

  function openAddDialog() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEditDialog(account: BookkeepingAccount) {
    setEditing(account);
    setForm({
      accountNumber: account.accountNumber ?? "",
      name: account.name,
      accountType: account.accountType,
      detailType: account.detailType ?? "",
    });
    setDialogOpen(true);
  }

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function saveAccount() {
    if (!form.name.trim()) return toast.error("Account name is required");
    if (!form.accountType.trim()) return toast.error("Account type is required");
    setSaving(true);
    const result = editing
      ? await updateBookkeepingAccount({ accountId: editing.id, ...form })
      : await createBookkeepingAccount(form);
    setSaving(false);
    if (result.error) return toast.error(result.error);
    setDialogOpen(false);
    const wasRestored = "disposition" in result && result.disposition === "restored";
    toast.success(editing ? "Account updated" : wasRestored ? "Account restored" : "Account added");
    refresh();
  }

  async function removeAccount(account: BookkeepingAccount) {
    const confirmed = window.confirm(
      `Delete "${account.name}"? If it has bookkeeping history, it will be archived so prior reports stay accurate.`,
    );
    if (!confirmed) return;
    setBusyId(account.id);
    const result = await deleteBookkeepingAccount(account.id);
    setBusyId(null);
    if (result.error) return toast.error(result.error);
    toast.success(result.disposition === "archived" ? "Account archived to preserve its history" : "Account deleted");
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search accounts"
            className="pl-9"
          />
        </div>
        <Button onClick={openAddDialog} disabled={isRefreshing}>
          <Plus data-icon="inline-start" />
          Add account
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-28">Number</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Detail type</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="w-20 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="font-mono text-muted-foreground">{account.accountNumber ?? "—"}</TableCell>
                <TableCell className="font-medium">{account.name}</TableCell>
                <TableCell>{account.accountType}</TableCell>
                <TableCell className="text-muted-foreground">{account.detailType ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline">{account.externalSource === "quickbooks" ? "QuickBooks" : "Manual"}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Tooltip>
                      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" />} onClick={() => openEditDialog(account)}>
                        <Pencil />
                        <span className="sr-only">Edit {account.name}</span>
                      </TooltipTrigger>
                      <TooltipContent>Edit account</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={<Button variant="ghost" size="icon-sm" />}
                        onClick={() => removeAccount(account)}
                        disabled={busyId !== null || isRefreshing}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 />
                        <span className="sr-only">Delete {account.name}</span>
                      </TooltipTrigger>
                      <TooltipContent>Delete account</TooltipContent>
                    </Tooltip>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!filtered.length && (
          <div className="px-5 py-14 text-center text-sm text-muted-foreground">
            {accounts.length ? "No accounts match this search." : "No chart-of-accounts entries yet."}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit account" : "Add account"}</DialogTitle>
            <DialogDescription>
              Accounts organize reviewed transactions and feed your financial reports.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
              <div className="space-y-2">
                <Label htmlFor="account-number">Number</Label>
                <Input
                  id="account-number"
                  value={form.accountNumber}
                  onChange={(event) => setForm((current) => ({ ...current, accountNumber: event.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-name">Account name</Label>
                <Input
                  id="account-name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  autoFocus
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-type">Account type</Label>
              <select
                id="account-type"
                value={form.accountType}
                onChange={(event) => setForm((current) => ({ ...current, accountType: event.target.value }))}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {accountTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="detail-type">Detail type</Label>
              <Input
                id="detail-type"
                value={form.detailType}
                onChange={(event) => setForm((current) => ({ ...current, detailType: event.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />} disabled={saving}>Cancel</DialogClose>
            <Button onClick={saveAccount} disabled={saving}>
              {saving ? "Saving..." : editing ? "Save changes" : "Add account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
