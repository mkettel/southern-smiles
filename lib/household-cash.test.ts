import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { CASH_ACCOUNT_ID, cashExpenseSchema, cashTransactions, type CashExpense } from "./household-cash";
import { buildSpendingView, withSpendingCategories } from "./household-spending";
import { buildHouseholdFinanceData } from "./household-finance";

const p = "00000000-0000-4000-8000-000000000001";
const c = "00000000-0000-4000-8000-000000000002";
const u = "00000000-0000-4000-8000-000000000003";
const id = "00000000-0000-4000-8000-000000000004";
const expense: CashExpense = { id, expense_date: "2026-09-15", description: "Electricity", amount_cents: 57659, bookkeeping_account_id: c, version: 1, voided: false };

test("cash validation preserves cents and rejects invalid amounts and dates", () => {
  const input = { id, version: 0, date: "2026-09-15", description: "Electricity", amount: "576.59", categoryId: c };
  assert.equal(cashExpenseSchema.parse(input).amount, 57659);
  for (const amount of ["", "0", "-1", "1.001", "1e3", "Infinity", "999999999"])
    assert.equal(cashExpenseSchema.safeParse({ ...input, amount }).success, false);
  assert.equal(cashExpenseSchema.safeParse({ ...input, date: "2026-02-30" }).success, false);
});

test("cash appears in both reports without inventing balances; voids and bank filters exclude it", () => {
  const rows = cashTransactions([expense, { ...expense, id: u, amount_cents: 6300, description: "Haircut", expense_date: "2026-09-17" }, { ...expense, id: p, voided: true }]);
  const transactions = withSpendingCategories(rows, [{ id: c, name: "Utilities", account_number: null }]);
  const input = { transactions, accounts: [], today: "2026-09-17" };
  const spending = buildSpendingView({ ...input, rangeKey: "this_month" });
  assert.equal(spending.totalCents, 63959);
  assert.equal(buildSpendingView({ ...input, rangeKey: "this_month", accountId: "bank" }).totalCents, 0);
  assert.equal(buildSpendingView({ ...input, rangeKey: "this_month", accountId: CASH_ACCOUNT_ID }).totalCents, 63959);
  const overview = buildHouseholdFinanceData({ ...input, snapshots: [], connectionCount: 0, lastSyncedAt: null });
  assert.equal(overview.months.at(-1)?.spendingCents, 63959);
  assert.equal(overview.accounts.length, 0);
  assert.equal(overview.recentTransactions[0].accountLabel, "Manual · Cash");
  assert.equal(overview.months.at(-1)?.spendingByAccount[0].label, "Manual · Cash");
});

test("cash schema is private, audited atomically, versioned, and tenant constrained", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE practices(id uuid PRIMARY KEY);
      CREATE TABLE profiles(id uuid PRIMARY KEY, practice_id uuid, is_active boolean);
      CREATE TABLE bookkeeping_accounts(id uuid PRIMARY KEY, practice_id uuid, name text, account_type text);
      INSERT INTO practices VALUES ('${p}');
      INSERT INTO profiles VALUES ('${u}', '${p}', true);
      INSERT INTO bookkeeping_accounts VALUES ('${c}', '${p}', 'Electricity', 'Expense');`);
    await db.exec(readFileSync(new URL("../supabase/migrations/20260917060000_household_cash_expenses.sql", import.meta.url), "utf8"));
    await db.query(`INSERT INTO household_cash_expenses(id, practice_id, expense_date, description, amount_cents, bookkeeping_account_id, updated_by)
      VALUES ($1,$2,'2026-09-15','Electricity',57659,$3,$4)`, [id, p, c, u]);
    await assert.rejects(db.query(`INSERT INTO household_cash_expenses(id, practice_id, expense_date, description, amount_cents, bookkeeping_account_id, updated_by)
      VALUES ($1,$2,'2026-09-15','Electricity',57659,$3,$4)`, [id, p, c, u]), /duplicate key/);
    await db.query("UPDATE household_cash_expenses SET amount_cents=6300, voided=true WHERE id=$1 AND version=1", [id]);
    const stale = await db.query("UPDATE household_cash_expenses SET amount_cents=100 WHERE id=$1 AND version=1 RETURNING id", [id]);
    assert.equal(stale.rows.length, 0);
    const history = await db.query<{ version: number; amount_cents: number; voided: boolean }>("SELECT version, amount_cents::int, voided FROM household_cash_history ORDER BY version");
    assert.deepEqual(history.rows, [{ version: 1, amount_cents: 57659, voided: false }, { version: 2, amount_cents: 6300, voided: true }]);
    await assert.rejects(db.query("UPDATE household_cash_expenses SET practice_id=$1 WHERE id=$2", [u, id]), /ownership/);
    await db.exec(`INSERT INTO bookkeeping_accounts VALUES ('${u}', '${u}', 'Other household', 'Expense');`);
    await assert.rejects(db.query("UPDATE household_cash_expenses SET bookkeeping_account_id=$1 WHERE id=$2", [u, id]), /Invalid expense category/);
    await db.exec("SET ROLE authenticated");
    await assert.rejects(db.query("SELECT * FROM household_cash_expenses"), /permission denied/);
    await db.exec("RESET ROLE; SET ROLE anon");
    await assert.rejects(db.query("SELECT * FROM household_cash_history"), /permission denied/);
    await db.exec("RESET ROLE; GRANT SELECT ON profiles, bookkeeping_accounts TO service_role; SET ROLE service_role");
    await db.query("UPDATE household_cash_expenses SET voided=false WHERE id=$1 AND version=2", [id]);
    assert.equal((await db.query("SELECT * FROM household_cash_history")).rows.length, 3);
    await assert.rejects(db.query("DELETE FROM household_cash_expenses"), /permission denied/);
    await assert.rejects(db.query("UPDATE household_cash_history SET description='changed'"), /permission denied/);
  } finally { await db.close(); }
});
