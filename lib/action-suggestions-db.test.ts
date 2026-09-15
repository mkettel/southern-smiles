import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { initialSuggestions, toOicEntry } from "./action-log-suggestions";

test("shared Action Log transactions and access boundaries", async (t) => {
  const db = new PGlite();
  const practice = "00000000-0000-4000-8000-000000000001";
  const otherPractice = "00000000-0000-4000-8000-000000000002";
  const admin = "00000000-0000-4000-8000-000000000011";
  const employee = "00000000-0000-4000-8000-000000000012";
  const otherAdmin = "00000000-0000-4000-8000-000000000013";
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table practices(id uuid primary key);
      create table profiles(id uuid primary key, practice_id uuid, role text, is_active boolean);
      create table oic_log(id uuid primary key default gen_random_uuid(), practice_id uuid, profile_id uuid, effective_date date, area text, post_affected text, entry_text text);
      insert into practices values('${practice}'),('${otherPractice}');
      insert into profiles values('${admin}','${practice}','admin',true),('${employee}','${practice}','employee',true),('${otherAdmin}','${otherPractice}','admin',true);
      grant usage on schema public to service_role, anon, authenticated;
      grant select on profiles to service_role;
      grant select, insert on oic_log to service_role;
    `);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20260914001812_action_log_suggestions.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec("set role service_role");
    const run = (
      operation: string,
      items: unknown[],
      actor = admin,
      tenant = practice,
    ) =>
      db.query<{ changed: number }>(
        "select public.manage_oic_action_suggestions($1::uuid,$2::uuid,$3,$4::jsonb) as changed",
        [tenant, actor, operation, JSON.stringify(items)],
      );
    const count = async () =>
      (
        await db.query<{ count: number }>(
          "select count(*)::integer as count from oic_log",
        )
      ).rows[0].count;
    const draft = initialSuggestions.items[0];
    const ready = {
      ...draft,
      implementation: "implemented" as const,
      date_confirmed: true,
    };

    await t.test(
      "imports stay pending and retries skip duplicates",
      async () => {
        assert.equal((await run("import", [ready])).rows[0].changed, 1);
        assert.equal((await run("import", [ready])).rows[0].changed, 0);
        await assert.rejects(
          run("accept", [{ id: draft.id, version: 1 }]),
          /Confirm implementation/,
        );
        assert.equal(await count(), 0);
      },
    );
    await t.test(
      "cross-practice, employee, and inactive reviewers are denied",
      async () => {
        await assert.rejects(
          run("dismiss", [{ id: draft.id, version: 1 }], otherAdmin),
          /administrator required/,
        );
        await assert.rejects(
          run("dismiss", [{ id: draft.id, version: 1 }], employee),
          /administrator required/,
        );
        await assert.rejects(
          run(
            "dismiss",
            [{ id: draft.id, version: 1 }],
            otherAdmin,
            otherPractice,
          ),
          /not found/,
        );
        await db.exec(
          `reset role; update profiles set is_active=false where id='${admin}'; set role service_role;`,
        );
        await assert.rejects(run("import", [ready]), /administrator required/);
        await db.exec(
          `reset role; update profiles set is_active=true where id='${admin}'; set role service_role;`,
        );
      },
    );
    await t.test(
      "save preserves original provenance and checks stale versions",
      async () => {
        await run("save", [{ id: draft.id, version: 1, draft: ready }]);
        await assert.rejects(
          run("save", [{ id: draft.id, version: 1, draft: ready }]),
          /changed/,
        );
        const row = (
          await db.query<{ original_draft: typeof draft }>(
            "select original_draft from oic_action_suggestions",
          )
        ).rows[0];
        assert.equal(row.original_draft.date_confirmed, true);
        assert.equal(row.original_draft.evidence, draft.evidence);
      },
    );
    await t.test(
      "accept creates exactly one entry, matching the OIC export contract",
      async () => {
        assert.equal(
          (await run("accept", [{ id: draft.id, version: 2 }])).rows[0].changed,
          1,
        );
        assert.equal(
          (await run("accept", [{ id: draft.id, version: 2 }])).rows[0].changed,
          0,
        );
        assert.equal(await count(), 1);
        const entry = (
          await db.query<{ entry_text: string }>(
            "select entry_text from oic_log",
          )
        ).rows[0];
        assert.equal(entry.entry_text, toOicEntry(ready).entry_text);
        await assert.rejects(
          run("restore", [{ id: draft.id, version: 3 }]),
          /Edit accepted entries/,
        );
      },
    );
    await t.test(
      "a failed batch rolls back earlier entry creation and audit events",
      async () => {
        const second = {
          ...ready,
          id: "second",
          source_key: "second",
          entry_text: "Second distinct change",
        };
        const third = {
          ...ready,
          id: "third",
          source_key: "third",
          entry_text: "Third distinct change",
        };
        await run("import", [second, third]);
        await run("save", [{ id: second.id, version: 1, draft: second }]);
        await assert.rejects(
          run("accept", [
            { id: second.id, version: 2 },
            { id: third.id, version: 1 },
          ]),
          /Confirm implementation/,
        );
        assert.equal(await count(), 1);
        const row = (
          await db.query<{ status: string }>(
            "select status from oic_action_suggestions where id='second'",
          )
        ).rows[0];
        assert.equal(row.status, "pending");
        assert.equal(
          (
            await db.query(
              "select * from oic_action_suggestion_events where suggestion_id='second' and operation='accept'",
            )
          ).rows.length,
          0,
        );
      },
    );
    await t.test("matching existing manual entries are blocked", async () => {
      await db.query(
        "insert into oic_log(practice_id,profile_id,effective_date,entry_text) values($1,$2,$3,$4)",
        [practice, admin, ready.effective_date, "Second distinct change"],
      );
      await assert.rejects(
        run("accept", [{ id: "second", version: 2 }]),
        /matching action/,
      );
    });
    await t.test(
      "dismissed entries do not reappear on import and can be restored",
      async () => {
        await run("dismiss", [{ id: "third", version: 1 }]);
        assert.equal(
          (
            await run("import", [
              { ...ready, id: "third", source_key: "third" },
            ])
          ).rows[0].changed,
          0,
        );
        await run("restore", [{ id: "third", version: 2 }]);
      },
    );
    await t.test(
      "browser roles cannot read the inbox or call privileged operations",
      async () => {
        for (const role of ["anon", "authenticated"]) {
          await db.exec(`reset role; set role ${role}`);
          await assert.rejects(
            db.query("select * from oic_action_suggestions"),
            /permission denied/,
          );
          await assert.rejects(run("import", [ready]), /permission denied/);
        }
      },
    );
  } finally {
    await db.close();
  }
});
