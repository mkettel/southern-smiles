import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(new URL(
  "../supabase/migrations/20260911120000_financial_recurring_overrides.sql",
  import.meta.url,
), "utf8");
const practice = "00000000-0000-4000-8000-000000000001";

for (const legacyDefaults of [false, true]) {
  test(`recurring decisions remain server-only with ${legacyDefaults ? "legacy" : "no automatic"} grants`, async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE anon;
        CREATE ROLE authenticated;
        CREATE ROLE service_role BYPASSRLS;
        CREATE TABLE practices(id uuid PRIMARY KEY);
        CREATE TABLE profiles(id uuid PRIMARY KEY);
        INSERT INTO practices VALUES ('${practice}');
      `);
      if (legacyDefaults) {
        await db.exec(`ALTER DEFAULT PRIVILEGES IN SCHEMA public
          GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;`);
      }
      await db.exec(migration);
      const security = await db.query<{ relrowsecurity: boolean }>(
        "SELECT relrowsecurity FROM pg_class WHERE oid='financial_recurring_overrides'::regclass",
      );
      assert.equal(security.rows[0].relrowsecurity, true);

      await db.exec("SET ROLE service_role");
      // Same upsert/reset operations used by the recurring-bill server action.
      const upsert = `INSERT INTO financial_recurring_overrides(practice_id, stream_key, status)
        VALUES ($1, 'test-stream', $2)
        ON CONFLICT (practice_id, stream_key) DO UPDATE SET status=excluded.status
        RETURNING status`;
      assert.deepEqual((await db.query(upsert, [practice, "confirmed"])).rows, [{ status: "confirmed" }]);
      assert.deepEqual((await db.query(upsert, [practice, "dismissed"])).rows, [{ status: "dismissed" }]);
      assert.equal((await db.query("SELECT * FROM financial_recurring_overrides")).rows.length, 1);
      await db.exec("RESET ROLE");
      // Replaying the setup preserves existing decisions and remains idempotent.
      await db.exec(migration);
      await db.exec("SET ROLE service_role");
      assert.deepEqual((await db.query("SELECT status FROM financial_recurring_overrides")).rows, [{ status: "dismissed" }]);
      await db.query("DELETE FROM financial_recurring_overrides WHERE practice_id=$1 AND stream_key='test-stream'", [practice]);
      assert.equal((await db.query("SELECT * FROM financial_recurring_overrides")).rows.length, 0);
      await db.exec("RESET ROLE");

      for (const role of ["anon", "authenticated"]) {
        for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
          const result = await db.query<{ allowed: boolean }>(
            "SELECT has_table_privilege($1, 'financial_recurring_overrides', $2) AS allowed",
            [role, privilege],
          );
          assert.equal(result.rows[0].allowed, false, `${role} must not have ${privilege}`);
        }
        await db.exec(`SET ROLE ${role}`);
        await assert.rejects(db.query("SELECT * FROM financial_recurring_overrides"), /permission denied/);
        await db.exec("RESET ROLE");
      }
    } finally {
      await db.close();
    }
  });
}
