import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSupplyBudgetSnapshots,
  getBusinessDayProgress,
  getSupplyBudgetPaceCondition,
  getSupplyBudgetStatKind,
} from "./supply-budget-stats";
import {
  DEFAULT_SUPPLY_BUDGET_SETTINGS,
  type SavedSupplyWorkspace,
} from "./supply-ordering";

const workspace: SavedSupplyWorkspace = {
  catalog: [],
  orderDraft: [],
  purchases: [
    {
      id: "routine-current",
      catalog_item_id: "gloves",
      vendor: "Net32",
      purchased_at: "2026-07-08",
      quantity: 2,
      unit_cost_cents: 100_000,
      category: "routine",
      case_reference: null,
      notes: null,
    },
    {
      id: "office-current",
      catalog_item_id: "paper",
      vendor: "Amazon",
      purchased_at: "2026-07-09",
      quantity: 1,
      unit_cost_cents: 25_000,
      category: "office",
      case_reference: null,
      notes: null,
    },
    {
      id: "implant-current",
      catalog_item_id: "implant",
      vendor: "Implant vendor",
      purchased_at: "2026-07-10",
      quantity: 1,
      unit_cost_cents: 125_000,
      category: "implant_graft",
      case_reference: "Case 07-A",
      notes: null,
    },
    {
      id: "routine-prior",
      catalog_item_id: "gloves",
      vendor: "Net32",
      purchased_at: "2026-06-30",
      quantity: 1,
      unit_cost_cents: 100_000,
      category: "routine",
      case_reference: null,
      notes: null,
    },
    {
      id: "routine-future",
      catalog_item_id: "gloves",
      vendor: "Net32",
      purchased_at: "2026-07-28",
      quantity: 1,
      unit_cost_cents: 100_000,
      category: "routine",
      case_reference: null,
      notes: null,
    },
  ],
  settings: {
    ...DEFAULT_SUPPLY_BUDGET_SETTINGS,
    routine_baseline_cents: 300_000,
    office_baseline_cents: 100_000,
  },
};

test("calculates month-to-date utilization and excludes implant and prior-month purchases", () => {
  const snapshots = buildSupplyBudgetSnapshots(workspace, "2026-07-10");

  assert.equal(snapshots.routine.spentCents, 200_000);
  assert.equal(snapshots.routine.utilizationPercent, 66.67);
  assert.equal(snapshots.office.spentCents, 25_000);
  assert.equal(snapshots.office.utilizationPercent, 25);
});

test("calculates expected pace from elapsed weekdays", () => {
  assert.equal(getBusinessDayProgress("2026-07", "2026-07-10"), 34.78);
  assert.equal(getBusinessDayProgress("2026-07", "2026-06-30"), 0);
  assert.equal(getBusinessDayProgress("2026-07", "2026-08-01"), 100);
});

test("uses a ten-percent pace tolerance before warning", () => {
  assert.equal(getSupplyBudgetPaceCondition(75), "power");
  assert.equal(getSupplyBudgetPaceCondition(89), "affluence");
  assert.equal(getSupplyBudgetPaceCondition(100), "normal");
  assert.equal(getSupplyBudgetPaceCondition(110), "normal");
  assert.equal(getSupplyBudgetPaceCondition(111), "emergency");
  assert.equal(getSupplyBudgetPaceCondition(130), "danger");
  assert.equal(getSupplyBudgetPaceCondition(151), "non_existence");
});

test("matches only the intended supply budget stats", () => {
  assert.equal(getSupplyBudgetStatKind({
    name: "Dental Budget Target",
    abbreviation: "DBT",
    post: { title: "Dental Supplies Officer", division: { number: 4 } },
  }), "routine");
  assert.equal(getSupplyBudgetStatKind({
    name: "Supply budget target",
    abbreviation: "SBT",
    post: { title: "Supplies Officer", division: { number: 3 } },
  }), "office");
  assert.equal(getSupplyBudgetStatKind({
    name: "Budget",
    abbreviation: "B",
    post: { title: "Owner", division: { number: 7 } },
  }), null);
});
