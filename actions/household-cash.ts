"use server";

import { revalidatePath } from "next/cache";
import { requireMemberModuleAccess } from "@/actions/member-module-access";
import { getWorkspaceAccess } from "@/actions/workspace-access";
import { cashExpenseSchema, type CashExpenseInput, type CashExpenseData } from "@/lib/household-cash";
import { toPhoenixDate } from "@/lib/household-finance-queries";

async function context() {
  const ctx = await requireMemberModuleAccess("financial");
  if ((await getWorkspaceAccess()).workspaceType !== "household") throw new Error("Household access required");
  return ctx;
}

export async function getCashExpenseData(): Promise<CashExpenseData> {
  const { supabase, practiceId } = await context();
  const categories = await supabase.from("bookkeeping_accounts").select("id, name, is_active")
    .eq("practice_id", practiceId).ilike("account_type", "%expense%").order("name");
  if (categories.error) throw new Error(categories.error.message);
  const data: CashExpenseData = { today: toPhoenixDate(new Date()), categories: categories.data ?? [], expenses: [], history: [], ready: true };
  for (let from = 0; ; from += 1000) {
    const result = await supabase.from("household_cash_expenses")
      .select("id, expense_date, description, amount_cents, bookkeeping_account_id, version, voided")
      .eq("practice_id", practiceId).order("expense_date", { ascending: false }).order("id").range(from, from + 999);
    if (result.error?.code === "42P01" || result.error?.code === "PGRST205") return { ...data, ready: false };
    if (result.error) throw new Error(result.error.message);
    data.expenses.push(...result.data);
    if (result.data.length < 1000) break;
  }
  const history = await supabase.from("household_cash_history")
    .select("expense_id, version, expense_date, description, amount_cents, bookkeeping_account_id, category_name, voided, changed_at, changed_by")
    .eq("practice_id", practiceId).order("changed_at", { ascending: false }).limit(100);
  if (history.error) throw new Error(history.error.message);
  const authors = [...new Set(history.data.map((r) => r.changed_by))];
  const profiles = authors.length ? await supabase.from("profiles").select("id, full_name").eq("practice_id", practiceId).in("id", authors) : null;
  if (profiles?.error) throw new Error(profiles.error.message);
  const names = new Map((profiles?.data ?? []).map((p) => [p.id, p.full_name]));
  data.history = history.data.map((r) => ({ ...r, id: r.expense_id, actor_name: names.get(r.changed_by) || "Household member" }));
  return data;
}

export async function saveCashExpense(input: CashExpenseInput) {
  const { supabase, practiceId, userId } = await context();
  const parsed = cashExpenseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid expense" };
  const v = parsed.data;
  if (v.date > toPhoenixDate(new Date())) return { error: "Choose today or an earlier date" };
  const category = await supabase.from("bookkeeping_accounts").select("id, is_active")
    .eq("practice_id", practiceId).eq("id", v.categoryId).ilike("account_type", "%expense%").maybeSingle();
  if (category.error || !category.data) return { error: "Choose a household expense category" };
  const existing = await supabase.from("household_cash_expenses").select("id, version, bookkeeping_account_id, expense_date, description, amount_cents, voided")
    .eq("practice_id", practiceId).eq("id", v.id).maybeSingle();
  if (existing.error) return { error: "Cash expenses are not available yet. Please try again after setup." };
  if (!category.data.is_active && existing.data?.bookkeeping_account_id !== v.categoryId) return { error: "Choose an active category" };
  // A retry of the same create request must not duplicate the expense.
  if (v.version === 0 && existing.data) {
    const row = existing.data;
    if (row.expense_date !== v.date || row.description !== v.description || Number(row.amount_cents) !== v.amount || row.bookkeeping_account_id !== v.categoryId || row.voided !== v.voided) {
      return { error: "This entry was already saved with different values. Refresh and edit the saved expense." };
    }
    revalidatePath("/admin/financial", "layout");
    return { success: true };
  }
  if (v.version > 0 && existing.data?.version !== v.version) return { error: "This expense changed. Refresh before editing it again." };
  if (v.version === 0 && v.voided) return { error: "A new expense cannot be voided" };
  const values = { expense_date: v.date, description: v.description, amount_cents: v.amount,
    bookkeeping_account_id: v.categoryId, voided: v.voided, updated_by: userId };
  const result = v.version === 0
    ? await supabase.from("household_cash_expenses").insert({ ...values, id: v.id, practice_id: practiceId }).select("id").single()
    : await supabase.from("household_cash_expenses").update(values).eq("practice_id", practiceId).eq("id", v.id).eq("version", v.version).select("id").maybeSingle();
  if (result.error || !result.data) return { error: "Could not save. Refresh to check whether the expense was already saved." };
  revalidatePath("/admin/financial", "layout");
  return { success: true };
}
