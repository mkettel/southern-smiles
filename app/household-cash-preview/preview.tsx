"use client";
import { useState } from "react";
import { HouseholdCashExpenses } from "@/components/financial/household-cash-expenses";
import { cashExpenseSchema, type CashExpenseData } from "@/lib/household-cash";

export function CashPreview() {
  const [data, setData] = useState<CashExpenseData>({ today: "2026-09-17", ready: true, expenses: [], history: [], categories: [
    { id: "00000000-0000-4000-8000-000000000001", name: "Electricity", is_active: true },
    { id: "00000000-0000-4000-8000-000000000002", name: "Entertainment", is_active: true },
  ] });
  return <main className="mx-auto max-w-5xl p-6"><h1 className="mb-6 text-xl font-semibold">Cash expenses preview · Sample data only</h1><HouseholdCashExpenses data={data} save={async (input) => {
    const v = cashExpenseSchema.parse(input);
    const row = { id: v.id, version: v.version + 1, expense_date: v.date, amount_cents: v.amount, bookkeeping_account_id: v.categoryId, description: v.description, voided: v.voided };
    setData((old) => ({ ...old, expenses: [row, ...old.expenses.filter((r) => r.id !== row.id)], history: [{ ...row, changed_at: new Date().toISOString(), actor_name: "Sample user", category_name: old.categories.find((c) => c.id === v.categoryId)!.name }, ...old.history] }));
    return { success: true };
  }} /></main>;
}
