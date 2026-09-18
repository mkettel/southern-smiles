import { z } from "zod";
import type { HouseholdTransactionRow } from "./household-finance";

export const CASH_ACCOUNT_ID = "manual-cash";
export const cashExpenseSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().nonnegative(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => {
    const d = new Date(`${v}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Choose a valid date"),
  description: z.string().trim().min(1).max(300),
  amount: z.string().regex(/^\d{1,8}(\.\d{1,2})?$/, "Enter dollars with at most two decimals")
    .transform((v) => Math.round(Number(v) * 100)).refine((v) => v > 0, "Amount must be positive"),
  categoryId: z.string().uuid(),
  voided: z.boolean().default(false),
});
export type CashExpenseInput = z.input<typeof cashExpenseSchema>;
export interface CashExpense {
  id: string;
  expense_date: string;
  description: string;
  amount_cents: number;
  bookkeeping_account_id: string;
  version: number;
  voided: boolean;
}
export interface CashRevision extends CashExpense {
  changed_at: string;
  actor_name: string;
  category_name: string;
}
export interface CashExpenseData {
  today: string;
  categories: { id: string; name: string; is_active: boolean }[];
  expenses: CashExpense[];
  history: CashRevision[];
  ready: boolean;
}
export function cashTransactions(rows: CashExpense[]): HouseholdTransactionRow[] {
  return rows.filter((r) => !r.voided).map((r) => ({
    id: `cash:${r.id}`, account_id: CASH_ACCOUNT_ID, transaction_date: r.expense_date,
    name: r.description, merchant_name: null, amount_cents: r.amount_cents,
    pending: false, plaid_category_primary: null, bookkeeping_account_id: r.bookkeeping_account_id,
  }));
}
