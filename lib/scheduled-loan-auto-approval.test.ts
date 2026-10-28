import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(new URL("../supabase/migrations/20261028051810_scheduled_loan_auto_approval.sql", import.meta.url), "utf8");
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE practices(id uuid PRIMARY KEY);
    CREATE TABLE financial_accounts(id uuid PRIMARY KEY, practice_id uuid);
    CREATE TABLE bookkeeping_accounts(id uuid PRIMARY KEY, practice_id uuid, is_active boolean, account_type text);
    CREATE TABLE financial_loans(id uuid PRIMARY KEY, practice_id uuid, lender_name text,
      status text, terms_status text, payment_frequency text, interest_method text,
      scheduled_payment_cents bigint, current_balance_cents bigint, balance_anchor_date date);
    CREATE TABLE financial_transactions(id uuid PRIMARY KEY, practice_id uuid, account_id uuid,
      pending boolean, is_removed boolean, review_status text, amount_cents bigint,
      original_description text, name text, transaction_date date);
    CREATE TABLE financial_loan_schedule_entries(id uuid PRIMARY KEY, practice_id uuid, loan_id uuid,
      payment_number integer, due_date date, payment_cents bigint, principal_cents bigint,
      interest_cents bigint, fee_cents bigint, source_document text);
    CREATE TABLE accounting_transaction_links(financial_transaction_id uuid);
    CREATE TABLE financial_loan_payments(loan_id uuid, payment_date date, activity_kind text);
    CREATE TABLE posted_allocations(transaction_id uuid, allocations jsonb);
    -- Capture the existing posting API contract; the wrapper must supply the exact schedule split.
    CREATE FUNCTION post_financial_loan_allocations(uuid, uuid, text, jsonb, uuid, uuid, text, uuid)
    RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN
      INSERT INTO posted_allocations VALUES ($2, $4);
      INSERT INTO accounting_transaction_links VALUES ($2);
      UPDATE financial_transactions SET review_status = 'reviewed' WHERE id = $2;
      RETURN $2;
    END $$;
    INSERT INTO practices VALUES ('${id(1)}');
    INSERT INTO financial_accounts VALUES ('${id(2)}','${id(1)}');
    INSERT INTO bookkeeping_accounts VALUES ('${id(3)}','${id(1)}',true,'Expense');
    INSERT INTO financial_loans VALUES ('${id(4)}','${id(1)}','EverBank','active','verified',
      'monthly','amortizing',10000,100000,'2026-09-30');
    INSERT INTO financial_transactions VALUES ('${id(5)}','${id(1)}','${id(2)}',false,false,'pending',10000,
      'BUSINESS TO BUSINESS ACH EverBank, N.A. EverBank 261016 AC-BUND123456 TEST','EverBank','2026-10-21');
    INSERT INTO financial_loan_schedule_entries VALUES ('${id(6)}','${id(1)}','${id(4)}',10,
      '2026-10-20',10000,9600,400,0,'Verified lender schedule');
  `);
  await db.exec(migration);
  await db.exec(`INSERT INTO financial_loan_auto_rules VALUES ('${id(4)}','${id(1)}','${id(2)}','${id(3)}','2026-10-01',true)`);
  return db;
}

async function post(db: PGlite, transaction = 5, practice = 1) {
  const result = await db.query<{ posted: boolean }>("SELECT auto_post_scheduled_loan_payment($1,$2) AS posted", [id(practice), id(transaction)]);
  return result.rows[0].posted;
}

test("scheduled loan posting uses exact split and is idempotent", async () => {
  const db = await fixture();
  try {
    assert.equal(await post(db), true);
    assert.equal(await post(db), false);
    const result = await db.query<{ allocations: unknown }>("SELECT allocations FROM posted_allocations");
    assert.deepEqual(result.rows, [{ allocations: [{ loan_id: id(4), principal_cents: 9600, interest_cents: 400, fee_cents: 0 }] }]);
    await db.exec(`INSERT INTO financial_transactions SELECT '${id(7)}', practice_id,account_id,pending,is_removed,'pending',amount_cents,original_description,name,transaction_date FROM financial_transactions WHERE id='${id(5)}'`);
    assert.equal(await post(db, 7), false, "same installment cannot be used for another bank row");
  } finally { await db.close(); }
});

const blockedCases = {
  pending: "UPDATE financial_transactions SET pending=true",
  removed: "UPDATE financial_transactions SET is_removed=true",
  excluded: "UPDATE financial_transactions SET review_status='excluded'",
  refund: "UPDATE financial_transactions SET amount_cents=-10000",
  extraPayment: "UPDATE financial_transactions SET amount_cents=12000",
  disabled: "UPDATE financial_loan_auto_rules SET is_enabled=false",
  beforeOptIn: "UPDATE financial_loan_auto_rules SET starts_on='2026-11-01'",
  otherAccount: `UPDATE financial_transactions SET account_id='${id(99)}'`,
  wrongTenantRule: `UPDATE financial_loan_auto_rules SET practice_id='${id(2)}'`,
  wrongExpenseTenant: `UPDATE bookkeeping_accounts SET practice_id='${id(2)}'`,
  unverified: "UPDATE financial_loans SET terms_status='partial'",
  fixedFee: "UPDATE financial_loans SET interest_method='fixed_fee'",
  frequencyChanged: "UPDATE financial_loans SET payment_frequency='biweekly'",
  scheduleMissing: "DELETE FROM financial_loan_schedule_entries",
  noSource: "UPDATE financial_loan_schedule_entries SET source_document=NULL",
  badSplit: "UPDATE financial_loan_schedule_entries SET interest_cents=500",
  pastAnchor: "UPDATE financial_loans SET balance_anchor_date='2026-10-20'",
  staleSchedule: "UPDATE financial_loan_schedule_entries SET due_date='2026-11-20'",
  otherLender: "UPDATE financial_transactions SET original_description='BUSINESS TO BUSINESS ACH OTHER BANK'",
  previouslyManual: `INSERT INTO financial_loan_payments VALUES ('${id(4)}','2026-10-19','payment')`,
  ambiguous: `INSERT INTO financial_loan_schedule_entries SELECT '${id(7)}',practice_id,loan_id,11,due_date,payment_cents,principal_cents,interest_cents,fee_cents,source_document FROM financial_loan_schedule_entries`,
};
for (const [name, sql] of Object.entries(blockedCases)) {
  test(`scheduled loan leaves ${name} for review`, async () => {
    const db = await fixture();
    try {
      // A second valid practice allows testing mismatched configuration without invalid FKs.
      await db.exec(`INSERT INTO practices VALUES ('${id(2)}')`);
      await db.exec(sql);
      assert.equal(await post(db), false);
      assert.deepEqual((await db.query("SELECT * FROM posted_allocations")).rows, []);
    } finally { await db.close(); }
  });
}

test("posting errors roll back without consuming an installment", async () => {
  const db = await fixture();
  try {
    await db.exec(`CREATE OR REPLACE FUNCTION post_financial_loan_allocations(uuid,uuid,text,jsonb,uuid,uuid,text,uuid)
      RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'posting failed'; END $$`);
    await assert.rejects(() => post(db), /posting failed/);
    assert.deepEqual((await db.query("SELECT * FROM financial_loan_auto_postings")).rows, []);
    assert.equal(await post(db, 5, 2), false);
    const permissions = await db.query<{ permitted: boolean }>("SELECT has_function_privilege('authenticated','auto_post_scheduled_loan_payment(uuid,uuid)','EXECUTE') AS permitted");
    assert.equal(permissions.rows[0].permitted, false);
  } finally { await db.close(); }
});
