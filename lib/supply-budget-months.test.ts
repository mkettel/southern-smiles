import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSupplyBudgetSettingsByMonth,
  createSupplyBudgetSettingsForMonth,
  DEFAULT_SUPPLY_BUDGET_SETTINGS,
} from "./supply-ordering";

test("keeps July settings when a separate August budget is added", () => {
  const august = createSupplyBudgetSettingsForMonth(
    "2026-08",
    DEFAULT_SUPPLY_BUDGET_SETTINGS,
  );
  august.collections_cents = 6_000_000;
  august.routine_target_percent = 4;

  const settingsByMonth = buildSupplyBudgetSettingsByMonth({
    settings: august,
    budget_settings_by_month: {
      "2026-07": DEFAULT_SUPPLY_BUDGET_SETTINGS,
    },
  });

  assert.equal(settingsByMonth["2026-07"].collections_cents, 5_286_500);
  assert.equal(settingsByMonth["2026-07"].routine_target_percent, 5.5);
  assert.equal(settingsByMonth["2026-08"].collections_cents, 6_000_000);
  assert.equal(settingsByMonth["2026-08"].routine_target_percent, 4);
});

test("creates an unpublished monthly draft without mutating its template", () => {
  const template = { ...DEFAULT_SUPPLY_BUDGET_SETTINGS };
  const august = createSupplyBudgetSettingsForMonth("2026-08", template);

  assert.equal(august.budget_month, "2026-08");
  assert.equal(august.published_at, null);
  assert.equal(august.published_by, null);
  assert.equal(template.budget_month, "2026-07");
  assert.equal(template.published_at, "2026-07-07");
});

test("restores the known July budget when upgrading a legacy August workspace", () => {
  const august = createSupplyBudgetSettingsForMonth(
    "2026-08",
    DEFAULT_SUPPLY_BUDGET_SETTINGS,
  );
  august.office_target_percent = 1.25;

  const settingsByMonth = buildSupplyBudgetSettingsByMonth({ settings: august });

  assert.equal(settingsByMonth["2026-07"].office_target_percent, 2);
  assert.equal(settingsByMonth["2026-08"].office_target_percent, 1.25);
});
