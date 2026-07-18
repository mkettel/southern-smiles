import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SUPPLY_BUDGET_SETTINGS,
  DEFAULT_SUPPLY_CATALOG,
} from "./supply-ordering";
import { supplyWorkspaceSchema } from "./validators";

test("accepts the seeded shared supply workspace", () => {
  const result = supplyWorkspaceSchema.safeParse({
    catalog: DEFAULT_SUPPLY_CATALOG,
    purchases: [],
    settings: DEFAULT_SUPPLY_BUDGET_SETTINGS,
    orderDraft: [],
  });

  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.catalog.length, 151);
});

test("rejects an invalid supply draft quantity", () => {
  const result = supplyWorkspaceSchema.safeParse({
    catalog: DEFAULT_SUPPLY_CATALOG,
    purchases: [],
    settings: DEFAULT_SUPPLY_BUDGET_SETTINGS,
    orderDraft: [{
      id: "draft-line",
      catalog_item_id: DEFAULT_SUPPLY_CATALOG[0].id,
      vendor: "Net32",
      quantity: 0,
      added_at: "2026-07-18",
    }],
  });

  assert.equal(result.success, false);
});
