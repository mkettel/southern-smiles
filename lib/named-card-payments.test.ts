import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const sql = (name: string) => readFileSync(new URL("../supabase/migrations/" + name, import.meta.url), "utf8");
const id = (n: number) => "'00000000-0000-0000-0000-" + String(n).padStart(12, "0") + "'";
const journal = sql("20260809200929_add_accounting_journal.sql");
const run = async (db: PGlite) =>
  (await db.query<{ n: number }>(`SELECT auto_post_named_card_payments(${id(1)}) AS n`)).rows[0].n;

test("named card payment uses the real transfer journal, or leaves both imports alone", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE practices(id uuid PRIMARY KEY, slug text);
      CREATE TABLE profiles(id uuid PRIMARY KEY);
      CREATE TABLE bookkeeping_accounts(id uuid PRIMARY KEY);
      CREATE TABLE financial_accounts(id uuid PRIMARY KEY, practice_id uuid, name text, official_name text,
        mask text, account_type text, account_subtype text, is_active boolean, included_in_bookkeeping boolean);
      CREATE TABLE financial_transactions(id uuid PRIMARY KEY, practice_id uuid, account_id uuid, name text,
        amount_cents bigint, transaction_date date, original_description text, currency_code text DEFAULT 'USD',
        pending boolean DEFAULT false, is_removed boolean DEFAULT false, review_status text DEFAULT 'pending',
        bookkeeping_category text, bookkeeping_account_id uuid, category_source text, reviewed_by uuid,
        review_note text, reviewed_at timestamptz, updated_at timestamptz DEFAULT now());
      ${journal.slice(journal.indexOf("CREATE TABLE accounting_journal_entries"), journal.indexOf("ALTER TABLE accounting_journal_entries ENABLE"))}
      ${journal.slice(journal.indexOf("CREATE OR REPLACE FUNCTION post_financial_transfer"), journal.indexOf("CREATE OR REPLACE FUNCTION exclude_financial_transaction"))}
      INSERT INTO practices VALUES (${id(1)},'ssmiles'), (${id(20)},'household');
      INSERT INTO financial_accounts VALUES
        (${id(2)},${id(1)},'Business income',NULL,'2625','depository','checking',true,true),
        (${id(3)},${id(1)},'Example Business Cash Card ...1240',NULL,'1240','credit','credit card',true,true);
      INSERT INTO financial_transactions(id,practice_id,account_id,name,amount_cents,transaction_date,original_description)
      VALUES (${id(4)},${id(1)},${id(2)},'Bank',50000,'2026-11-06',
        'ONLINE TRANSFER REF #ABC123 TO EXAMPLE BUSINESS CASH CARD XXXXXXXXXXXX1240 ON 11/06/26'),
        (${id(5)},${id(1)},${id(3)},'ONLINE PAYMENT THANK YOU',-50000,'2026-11-11',NULL),
        (${id(6)},${id(1)},${id(2)},'ONLINE TRANSFER REF #ABC122 TO BUSINESSLINE LINE OF CREDIT XXXXXXXXXXXX5483 ON 11/06/26',50000,'2026-11-06',NULL);
    `);
    await db.exec(sql("20261113045926_auto_post_named_card_payments.sql"));
    const debit = ` WHERE id=${id(4)}`;
    const receipt = ` WHERE id=${id(5)}`;
    const update = "UPDATE financial_transactions SET ";
    const duplicate = (n: number) => `INSERT INTO financial_transactions(id,practice_id,account_id,name,amount_cents,
      transaction_date,original_description) SELECT ${id(9)},practice_id,account_id,name,amount_cents,
      transaction_date,original_description FROM financial_transactions WHERE id=${id(n)}`;
    const blocked = {
      "two possible withdrawals": duplicate(4),
      "two possible receipts": duplicate(5),
      "reviewed lookalike": duplicate(5) + ";" + update + "review_status='reviewed' WHERE id=" + id(9),
      "missing leg": "DELETE FROM financial_transactions" + receipt,
      "pending withdrawal": update + "pending=true" + debit,
      "removed receipt": update + "is_removed=true" + receipt,
      "excluded receipt": update + "review_status='excluded'" + receipt,
      "already reviewed withdrawal": update + "review_status='reviewed'" + debit,
      "unidentified card": update + "original_description='CAPITAL ONE MOBILE PMT REF 1240'" + debit,
      "different named card with same digits": update + "original_description='PAYMENT TO DIFFERENT CARD ENDING IN 1240'" + debit,
      "refund not payment": update + "name='PAYMENT REVERSAL'" + receipt,
      "currency mismatch": update + "currency_code='CAD'" + receipt,
      "one cent off": update + "amount_cents=-49999" + receipt,
      "four weekdays apart": update + "transaction_date='2026-11-12'" + receipt,
      "historical records": update + "transaction_date='2026-10-15'",
      "different practice": update + "practice_id=" + id(20) + receipt,
      "other workspace": "UPDATE practices SET slug='other' WHERE id=" + id(1),
      "excluded checking": "UPDATE financial_accounts SET included_in_bookkeeping=false WHERE id=" + id(2),
      "duplicate card mask": `INSERT INTO financial_accounts SELECT ${id(9)},practice_id,name,official_name,mask,
        account_type, account_subtype,true,true FROM financial_accounts WHERE id=${id(3)}`,
      "previously posted one-sided payment": `SELECT post_financial_transfer(${id(1)},${id(4)},${id(3)},NULL,'credit_card_payment',NULL,NULL);
        UPDATE financial_transactions SET review_status='pending' WHERE id=${id(4)}`,
    };
    for (const [name, setup] of Object.entries(blocked)) {
      await t.test(name, async () => {
        await db.exec("BEGIN");
        try { await db.exec(setup); assert.equal(await run(db), 0); }
        finally { await db.exec("ROLLBACK"); }
      });
    }
    assert.equal(await run(db), 1);
    assert.equal(await run(db), 0);
    assert.deepEqual((await db.query("SELECT transfer_kind FROM accounting_journal_entries")).rows,
      [{ transfer_kind: "credit_card_payment" }]);
    assert.deepEqual((await db.query<{ review_status: string }>("SELECT review_status FROM financial_transactions ORDER BY id")).rows.map(r => r.review_status),
      ["reviewed", "reviewed", "pending"]);
    assert.equal((await db.query("SELECT * FROM accounting_transaction_links")).rows.length, 2);
    assert.deepEqual((await db.query("SELECT debit_cents::int AS dr, credit_cents::int AS cr FROM accounting_journal_lines ORDER BY financial_account_id")).rows,
      [{ dr: 0, cr: 50000 }, { dr: 50000, cr: 0 }]);
  } finally { await db.close(); }
});
