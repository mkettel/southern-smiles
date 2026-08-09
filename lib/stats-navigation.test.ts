import assert from "node:assert/strict";
import test from "node:test";
import { buildStatsHref } from "./stats-navigation";

test("buildStatsHref preserves a selected division", () => {
  assert.equal(
    buildStatsHref({
      mode: "weekly",
      week: "2026-08-03",
      division: "division-2",
    }),
    "/stats?mode=weekly&week=2026-08-03&division=division-2",
  );
});

test("buildStatsHref omits the division parameter for the All filter", () => {
  assert.equal(
    buildStatsHref({
      mode: "daily",
      week: "2026-08-03",
      division: "all",
    }),
    "/stats?mode=daily&week=2026-08-03",
  );
});
