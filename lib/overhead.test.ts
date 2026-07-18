import assert from "node:assert/strict";
import test from "node:test";
import type { OverheadItem, OverheadSettings } from "./types";
import { buildOverheadSummary } from "./overhead";

const settings: OverheadSettings = {
  practice_id: "practice-1",
  operatories_count: 2,
  days_per_week: 5,
  clinical_hours_per_day: 10,
  weeks_per_month: 4,
  utilization_percent: 50,
  notes: null,
  created_at: "",
  updated_at: "",
};

function item(
  id: string,
  monthlyCostCents: number,
  costType: "fixed" | "variable",
  isActive = true,
): OverheadItem {
  return {
    id,
    practice_id: "practice-1",
    category_id: "category-1",
    name: id,
    monthly_cost_cents: monthlyCostCents,
    cost_type: costType,
    notes: null,
    display_order: 0,
    is_active: isActive,
    created_at: "",
    updated_at: "",
  };
}

test("separates fixed and variable overhead without changing the total", () => {
  const summary = buildOverheadSummary(settings, [
    item("rent", 100_000, "fixed"),
    item("supplies", 40_000, "variable"),
    item("excluded", 99_000, "variable", false),
  ]);

  assert.equal(summary.fixed_monthly_cents, 100_000);
  assert.equal(summary.variable_monthly_cents, 40_000);
  assert.equal(summary.total_monthly_cents, 140_000);
  assert.equal(summary.total_weekly_cents, 32_308);
  assert.equal(summary.total_annual_cents, 1_680_000);
});

test("uses fixed plus variable costs for cost per operatory hour", () => {
  const summary = buildOverheadSummary(settings, [
    item("fixed", 100_000, "fixed"),
    item("variable", 40_000, "variable"),
  ]);

  assert.equal(summary.full_capacity_monthly_operatory_hours, 400);
  assert.equal(summary.configured_monthly_operatory_hours, 200);
  assert.equal(summary.full_capacity_cost_per_operatory_hour_cents, 350);
  assert.equal(summary.cost_per_operatory_hour_cents, 700);
});
