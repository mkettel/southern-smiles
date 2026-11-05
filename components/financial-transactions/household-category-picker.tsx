"use client";

import { useState } from "react";
import type { BookkeepingAccount, FinancialTransaction } from "@/lib/financial-transactions";
import { householdCategoryName, householdCategoryOptions } from "@/lib/household-category-picker";

export function HouseholdCategoryPicker({ accounts, transactions, value, onChange, disabled }: {
  accounts: BookkeepingAccount[];
  transactions: FinancialTransaction[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const options = householdCategoryOptions(accounts, transactions, value, showAll, search);
  return <div className="space-y-2">
    <input aria-label="Search categories" placeholder="Search categories" value={search} disabled={disabled} onChange={event => setSearch(event.target.value)} className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm" />
    <select aria-label="Category" value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className="min-h-12 w-full min-w-0 rounded-md border bg-background px-3 text-sm">
      <option value="">Choose a category</option>
      {options.map(account => <option key={account.id} value={account.id}>{householdCategoryName(account)}</option>)}
    </select>
    <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={showAll} disabled={disabled} onChange={event => setShowAll(event.target.checked)} />Show all categories</label>
  </div>;
}
