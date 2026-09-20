"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Check, Pencil, RotateCcw, X } from "lucide-react";
import { saveCashExpense } from "@/actions/household-cash";
import { type CashExpense, type CashExpenseData, type CashExpenseInput } from "@/lib/household-cash";
import { formatCents } from "@/lib/household-finance";

export function HouseholdCashExpenses({ data, save = saveCashExpense }: {
  data: CashExpenseData;
  save?: (input: CashExpenseInput) => Promise<{ error?: string; success?: boolean }>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CashExpense | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmVoid, setConfirmVoid] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const names = new Map(data.categories.map((c) => [c.id, c.name]));
  function reset() { setEditing(null); setRequestId(null); setFormKey((v) => v + 1); }
  async function persist(input: CashExpenseInput) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const result = await save(input);
      if (result.error) { setError(result.error); return; }
      reset(); setConfirmVoid(null); setMessage(input.voided ? "Expense voided" : "Expense saved"); router.refresh();
    } catch { setError("Could not save. Your entry is still here; please try again."); }
    finally { locked.current = false; setBusy(false); }
  }
  const field = "mt-1 block h-10 w-full rounded-md border bg-background px-3 text-sm";
  return <div className="space-y-8">
    <section>
      <h2 className="text-lg font-semibold">{editing ? "Edit expense" : "Add expense"}</h2>
      <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><Banknote className="h-4 w-4" aria-hidden />Manual · Cash</p>
      {!data.ready && <p role="alert" className="mt-3 text-sm">Cash expenses are awaiting database setup. No entries have been saved.</p>}
      <form key={formKey} ref={formRef} className="mt-4 max-w-3xl" onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const id = editing?.id ?? requestId ?? crypto.randomUUID();
        setRequestId(id);
        void persist({ id, version: editing?.version ?? 0, date: String(fields.get("date")),
          amount: String(fields.get("amount")), description: String(fields.get("description")),
          categoryId: String(fields.get("categoryId")), voided: false });
      }}>
        <fieldset disabled={busy || !data.ready} className="grid gap-4 sm:grid-cols-2 disabled:opacity-60">
          <label className="text-sm">Date<input name="date" type="date" required max={data.today} defaultValue={editing?.expense_date ?? data.today} className={field} /></label>
          <label className="text-sm">Amount ($)<input name="amount" inputMode="decimal" required pattern="[0-9]{1,8}(\.[0-9]{1,2})?" placeholder="0.00" defaultValue={editing ? (editing.amount_cents / 100).toFixed(2) : ""} className={field} /></label>
          <label className="text-sm">Description<input name="description" required maxLength={300} defaultValue={editing?.description ?? ""} className={field} /></label>
          <label className="text-sm">Category<select aria-label="Category" name="categoryId" required defaultValue={editing?.bookkeeping_account_id ?? ""} className={field}>
            <option value="" disabled>Select category</option>
            {data.categories.filter((c) => c.is_active || c.id === editing?.bookkeeping_account_id).map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_active ? "" : " (archived)"}</option>)}
          </select></label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm text-background"><Check className="h-4 w-4" aria-hidden />{busy ? "Saving..." : editing ? "Save changes" : "Save expense"}</button>
            {editing && <button type="button" onClick={reset} className="rounded-md border px-4 py-2 text-sm">Cancel</button>}
          </div>
        </fieldset>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    </section>
    <section className="border-t pt-5">
      <h2 className="text-lg font-semibold">Cash expenses</h2>
      {!data.expenses.length && <p className="mt-3 text-sm text-muted-foreground">No cash expenses yet.</p>}
      <ul className="mt-3 divide-y">
        {data.expenses.map((expense) => <li key={expense.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0"><p className="break-words font-medium">{expense.description}{expense.voided && <span className="ml-2 text-sm text-muted-foreground">Voided</span>}</p>
            <p className="text-sm text-muted-foreground">{expense.expense_date} · {names.get(expense.bookkeeping_account_id)} · Manual · Cash</p></div>
          <div className="flex items-center gap-2"><span className="mr-2 tabular-nums">{formatCents(expense.amount_cents)}</span>
            <button disabled={busy} type="button" title={expense.voided ? "Restore and edit expense" : "Edit expense"} aria-label={`Edit ${expense.description}`} className="rounded p-2 hover:bg-accent" onClick={() => { setEditing(expense); setFormKey((v) => v + 1); setError(""); setMessage(""); formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>{expense.voided ? <RotateCcw className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}</button>
            {!expense.voided && <button disabled={busy} type="button" title="Void expense" aria-label={`Void ${expense.description}`} className="rounded p-2 hover:bg-accent" onClick={() => setConfirmVoid(expense.id)}><X className="h-4 w-4" /></button>}
          </div>
          {confirmVoid === expense.id && <div className="flex w-full flex-wrap items-center gap-3 text-sm"><span>Void this expense?</span><button disabled={busy} className="rounded border px-3 py-1" onClick={() => void persist({ id: expense.id, version: expense.version, date: expense.expense_date, description: expense.description, amount: (expense.amount_cents / 100).toFixed(2), categoryId: expense.bookkeeping_account_id, voided: true })}>Confirm void</button><button disabled={busy} onClick={() => setConfirmVoid(null)}>Cancel</button></div>}
        </li>)}
      </ul>
    </section>
    <section className="border-t pt-5">
      <h2 className="text-lg font-semibold">History <span className="text-sm font-normal text-muted-foreground">Latest 100 changes</span></h2>
      {!data.history.length && <p className="mt-3 text-sm text-muted-foreground">No changes yet.</p>}
      <ul className="mt-3 divide-y">{data.history.map((r) => <li key={`${r.id}:${r.version}`} className="py-3 text-sm">
        <p className="break-words">{r.voided ? "Voided" : r.version === 1 ? "Added" : "Updated"}: {r.description} · {formatCents(r.amount_cents)} · {r.category_name} · {r.expense_date}</p>
        <p className="text-muted-foreground">{r.actor_name} · {new Date(r.changed_at).toLocaleString("en-US", { timeZone: "America/Phoenix" })} (Arizona) · Revision {r.version}</p>
      </li>)}</ul>
    </section>
  </div>;
}
