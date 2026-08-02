import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSupplyVendorDirectory,
  DEFAULT_SUPPLY_BUDGET_SETTINGS,
  DEFAULT_SUPPLY_CATALOG,
  DEFAULT_SUPPLY_VENDORS,
  getSupplyPurchasesForMonth,
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

test("deduplicates vendor names without regard to capitalization or spacing", () => {
  const item = DEFAULT_SUPPLY_CATALOG[0];
  const vendors = buildSupplyVendorDirectory([
    { ...item, id: "amazon-1", vendor: "Amazon" },
    { ...item, id: "amazon-2", vendor: "amazon" },
    { ...item, id: "amazon-3", vendor: "Amaazon" },
    { ...item, id: "net32-1", vendor: "Net32" },
    { ...item, id: "net32-2", vendor: "Net 32" },
    { ...item, id: "net32-3", vendor: "N3t32" },
    { ...item, id: "net32-4", vendor: "Net" },
  ]);

  assert.deepEqual(vendors.map((vendor) => vendor.name), ["Amazon", "Net32"]);
});

test("accepts vendor directory and frozen purchase snapshots", () => {
  const item = DEFAULT_SUPPLY_CATALOG[0];
  const vendor = DEFAULT_SUPPLY_VENDORS.find((entry) => entry.name === item.vendor)
    ?? DEFAULT_SUPPLY_VENDORS[0];
  const result = supplyWorkspaceSchema.safeParse({
    catalog: [{
      ...item,
      vendor_id: vendor.id,
      order_method: "in_person",
      ordering_instructions: "Buy locally when stock is low",
    }],
    purchases: [{
      id: "purchase-snapshot",
      catalog_item_id: item.id,
      item_name: item.name,
      vendor: vendor.name,
      vendor_id: vendor.id,
      order_method: "in_person",
      purchased_at: "2026-07-20",
      quantity: 1,
      unit_cost_cents: 1200,
      category: "routine",
      case_reference: null,
      notes: null,
    }],
    settings: DEFAULT_SUPPLY_BUDGET_SETTINGS,
    orderDraft: [],
    vendors: [vendor],
  });

  assert.equal(result.success, true);
});

test("filters supply purchases to the selected budget month", () => {
  const purchases = [
    {
      id: "july-purchase",
      catalog_item_id: "gloves",
      vendor: "Net32",
      purchased_at: "2026-07-31",
      quantity: 1,
      unit_cost_cents: 1000,
      category: "routine" as const,
      case_reference: null,
      notes: null,
    },
    {
      id: "august-purchase",
      catalog_item_id: "paper",
      vendor: "Amazon",
      purchased_at: "2026-08-01",
      quantity: 1,
      unit_cost_cents: 2000,
      category: "office" as const,
      case_reference: null,
      notes: null,
    },
  ];

  assert.deepEqual(
    getSupplyPurchasesForMonth(purchases, "2026-08").map((purchase) => purchase.id),
    ["august-purchase"],
  );
});
