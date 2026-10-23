import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  CARE_CALL_STAT as stat,
  CARE_CALL_PRACTICE as tenant,
  CARE_CALL_ACTOR as actor,
} from "./care-call-sync";
test("aggregate sync is atomic, preserves history and manual amounts, and enforces cutoff/access", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create type condition_name as enum('power','affluence','normal','emergency','danger','non_existence');
 create table profiles(id uuid primary key,practice_id uuid,role text);
 create table stats(id uuid primary key,practice_id uuid,stat_type text,weekly_formula text,good_direction text,post_id uuid);
 create table employee_posts(profile_id uuid,post_id uuid);
 create table daily_stat_entries(id uuid primary key default gen_random_uuid(),practice_id uuid,stat_id uuid,profile_id uuid,entry_date date,week_start date,input_value numeric,value numeric,updated_at timestamptz,unique(stat_id,entry_date));
 create table stat_entries(id uuid primary key default gen_random_uuid(),stat_id uuid,profile_id uuid,practice_id uuid,week_start date,value numeric,calculated_value numeric,is_manual_override boolean default false,updated_by uuid,updated_at timestamptz,previous_value numeric,percent_change numeric,auto_condition condition_name,self_condition condition_name,unique(stat_id,week_start));
 insert into profiles values('${actor}','${tenant}','admin');insert into stats values('${stat}','${tenant}','count','sum','up','00000000-0000-4000-8000-000000000001');
 insert into stat_entries(stat_id,week_start,value) values('${stat}','2026-10-19',44),('${stat}','2026-11-02',77);
 insert into daily_stat_entries(stat_id,entry_date,week_start,value) values('${stat}','2026-10-19','2026-10-19',9);
 grant usage on schema public to service_role,anon,authenticated;grant all on all tables in schema public to service_role;`);
    const sql = await readFile(
      new URL(
        "../supabase/migrations/20261023033719_care_call_vault_sync.sql",
        import.meta.url,
      ),
      "utf8",
    );
    // Pin database time for deterministic future-cutover tests, not production code.
    await db.exec(
      sql.replaceAll("now()", "'2026-11-04T08:00:00Z'::timestamptz"),
    );
    await db.exec("set role service_role");
    const run = (
      op: string,
      date: string,
      value: number | null = null,
      revision: number | null = null,
      who = actor,
      reason: string | null = null,
    ) =>
      db.query(
        "select manage_care_call_sync($1,$2::date,$3::integer,$4::bigint,$5::uuid,$6)",
        [op, date, value, revision, who, reason],
      );
    const weekly = async () =>
      (
        await db.query<{
          value: number;
          calculated_value: number;
          percent_change: number;
          is_manual_override: boolean;
        }>("select * from stat_entries where week_start='2026-10-26'")
      ).rows[0];
    await assert.rejects(run("snapshot", "2026-10-25", 100, 1));
    await run("snapshot", "2026-10-26", 18, 100);
    await run("additional", "2026-10-26", 3);
    assert.equal(Number((await weekly()).value), 21);
    await run("snapshot", "2026-10-26", 18, 100);
    await run("snapshot", "2026-10-26", 99, 99);
    assert.equal(Number((await weekly()).value), 21);
    await run("snapshot", "2026-10-26", 20, 101);
    assert.equal(Number((await weekly()).value), 23);
    await assert.rejects(run("snapshot", "2026-10-26", 19, 102));
    await run("override", "2026-10-26", 50, null, actor, "Verified correction");
    await run("snapshot", "2026-10-27", 10, 103);
    assert.equal(Number((await weekly()).value), 50);
    assert.equal(Number((await weekly()).calculated_value), 33);
    assert.equal(Number((await weekly()).percent_change), 13.64);
    await run("reset", "2026-10-26");
    assert.equal(Number((await weekly()).value), 33);
    assert.equal(Number((await weekly()).percent_change), -25);
    await assert.rejects(
      run(
        "additional",
        "2026-10-26",
        1,
        null,
        "00000000-0000-4000-8000-000000000099",
      ),
    );
    await assert.rejects(run("override", "2026-10-26", 30, null, actor, ""));
    await assert.rejects(
      run("override", "2026-10-27", 30, null, actor, "bad week"),
    );
    assert.equal(
      Number(
        (
          await db.query<{ value: number }>(
            "select value from stat_entries where week_start='2026-10-19'",
          )
        ).rows[0].value,
      ),
      44,
    );
    assert.equal(
      Number(
        (
          await db.query<{ value: number }>(
            "select value from daily_stat_entries where entry_date='2026-10-19'",
          )
        ).rows[0].value,
      ),
      9,
    );
    await assert.rejects(
      db.exec(
        `update daily_stat_entries set value=999 where stat_id='${stat}' and entry_date='2026-10-26'`,
      ),
    );
    await assert.rejects(run("snapshot", "2026-11-02", 18, 105));
    assert.equal(
      (
        await db.query(
          "select * from care_call_sync_days where entry_date='2026-11-02'",
        )
      ).rows.length,
      0,
    );
    await db.exec("reset role;set role authenticated");
    await assert.rejects(run("snapshot", "2026-10-26", 22, 110));
    await assert.rejects(db.query("select * from care_call_sync_days"));
  } finally {
    await db.close();
  }
});
