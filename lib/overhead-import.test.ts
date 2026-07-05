import assert from "node:assert/strict";
import test from "node:test";
import {
  parseOverheadCsv,
  validateParsedOverheadImport,
} from "./overhead-import";

test("clamps non-numeric and negative cost cells to 0", () => {
  const csv = [
    "Category,Line Item,Monthly Cost",
    "1. Facilities,,",
    ',Rent,"$2,500.00"',
    ",Water,TBD",
    ",Credit,($500)",
    ",Adjustment,-100",
  ].join("\n");

  const parsed = parseOverheadCsv(csv, "overhead.csv");
  const byName = new Map(parsed.items.map((i) => [i.name, i.monthly_cost_cents]));

  assert.equal(byName.get("Rent"), 250_000);
  assert.equal(byName.get("Water"), 0);
  assert.equal(byName.get("Credit"), 0);
  assert.equal(byName.get("Adjustment"), 0);
  // total must be a finite number, never NaN
  assert.equal(Number.isFinite(parsed.preview.total_monthly_cents), true);
});

test("valid import passes validation", () => {
  const csv = [
    "Category,Line Item,Monthly Cost",
    "1. Facilities,,",
    ',Rent,"$2,500.00"',
    "2. Staff,,",
    ',Wages,"$10,000.00"',
  ].join("\n");

  const parsed = parseOverheadCsv(csv, "overhead.csv");
  assert.equal(validateParsedOverheadImport(parsed), null);
});

test("rejects duplicate category names that collide case-insensitively", () => {
  const parsed = {
    categories: [
      { name: "Facilities", display_order: 0, notes: [] },
      { name: "facilities", display_order: 1, notes: [] },
    ],
    items: [],
    preview: {
      file_name: "x.csv",
      category_count: 2,
      item_count: 0,
      total_monthly_cents: 0,
      category_names: ["Facilities", "facilities"],
      notes: [],
    },
  };

  const error = validateParsedOverheadImport(parsed);
  assert.match(error ?? "", /Duplicate category/i);
});

test("rejects an over-length line item name", () => {
  const parsed = {
    categories: [{ name: "Facilities", display_order: 0, notes: [] }],
    items: [
      {
        category_name: "Facilities",
        name: "x".repeat(201),
        monthly_cost_cents: 100,
        notes: null,
        display_order: 0,
      },
    ],
    preview: {
      file_name: "x.csv",
      category_count: 1,
      item_count: 1,
      total_monthly_cents: 100,
      category_names: ["Facilities"],
      notes: [],
    },
  };

  const error = validateParsedOverheadImport(parsed);
  assert.match(error ?? "", /between 1 and 200/i);
});
