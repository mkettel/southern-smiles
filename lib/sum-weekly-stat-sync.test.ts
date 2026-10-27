import { test } from "node:test";
import assert from "node:assert/strict";
import { refreshSumOfWeeklyTotalDependents } from "./sum-weekly-stat-sync";

test("dependent refresh preserves overrides and reports database failures", async () => {
  const originalFetch = globalThis.fetch;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  try {
    for (const override of [false, true]) {
      let written: Record<string, unknown> | undefined;
      globalThis.fetch = async (input, init) => {
        const url = new URL(String(input));
        let data: unknown;
        if (init?.method === "POST") {
          written = JSON.parse(String(init.body));
          return new Response(null, { status: 201 });
        }
        if (url.pathname.endsWith("/stats")) {
          assert.equal(url.searchParams.get("practice_id"), "eq.practice");
          data = [{ id: "outflow", formula_source_stat_ids: ["care", "other"], good_direction: "up" }];
        } else if (url.searchParams.get("stat_id")?.startsWith("in.")) {
          assert.equal(url.searchParams.get("practice_id"), "eq.practice");
          data = [{ value: 10 }, { value: 90 }];
        } else if (url.searchParams.get("week_start")?.startsWith("lt.")) {
          data = { value: 100 };
        } else {
          data = { id: "entry", value: 200, is_manual_override: override };
        }
        return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
      };
      await refreshSumOfWeeklyTotalDependents("care", "2026-10-26", "actor", "practice");
      assert.equal(written?.calculated_value, 100);
      assert.equal(written?.value, override ? 200 : 100);
      assert.equal(written?.auto_condition, override ? "power" : "emergency");
    }
    globalThis.fetch = async () => new Response(JSON.stringify({ message: "read denied" }), { status: 403 });
    await assert.rejects(refreshSumOfWeeklyTotalDependents("care", "2026-10-26", "actor", "practice"));
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});
