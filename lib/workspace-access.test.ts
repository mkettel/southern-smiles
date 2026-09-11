import assert from "node:assert/strict";
import test from "node:test";
import {
  MODULE_KEYS,
  getPlanModules,
  resolvePlanForWorkspaceType,
  getWorkspaceHomeHref,
  getWorkspaceLabel,
  resolveWorkspaceAccess,
} from "./workspace-access";

test("legacy organizations retain access to every current module", () => {
  const access = resolveWorkspaceAccess();

  assert.equal(access.planKey, "legacy");
  assert.equal(Object.values(access.modules).every(Boolean), true);
});

test("household workspaces receive the household bundle and terminology", () => {
  const access = resolveWorkspaceAccess({
    workspaceType: "household",
    planKey: "household",
  });

  assert.equal(access.modules.financial, true);
  assert.equal(access.modules.budgeting, true);
  assert.equal(access.modules.procedure_costs, false);
  assert.equal(access.modules.patient_surveys, false);
  assert.equal(getWorkspaceLabel(access, "budgeting", "Overhead"), "Budget");
});

test("organization overrides win over the plan bundle", () => {
  const access = resolveWorkspaceAccess({
    workspaceType: "household",
    planKey: "household",
    overrides: [
      { moduleKey: "stats", enabled: true },
      { moduleKey: "bills", enabled: false },
    ],
  });

  assert.equal(access.modules.stats, true);
  assert.equal(access.modules.bills, false);
});

test("a disabled operations module falls back to another enabled home", () => {
  const access = resolveWorkspaceAccess({
    planKey: "household",
    overrides: [{ moduleKey: "operations", enabled: false }],
  });

  assert.equal(getWorkspaceHomeHref(access), "/tasks");
});

test("unknown database values fall back to the backward-compatible legacy bundle", () => {
  const access = resolveWorkspaceAccess({
    workspaceType: "unknown",
    planKey: "unknown",
    overrides: [{ moduleKey: "not-a-module", enabled: false }],
  });

  assert.equal(access.workspaceType, "dental_practice");
  assert.equal(access.planKey, "legacy");
  assert.equal(Object.values(access.modules).every(Boolean), true);
});

test("switching workspace type keeps a plan that already fits the type", () => {
  assert.equal(resolvePlanForWorkspaceType("dental_practice", "legacy"), "legacy");
  assert.equal(resolvePlanForWorkspaceType("dental_practice", "dental_core"), "dental_core");
  assert.equal(resolvePlanForWorkspaceType("household", "household"), "household");
});

test("switching workspace type falls back to the type's default plan", () => {
  assert.equal(resolvePlanForWorkspaceType("household", "legacy"), "household");
  assert.equal(resolvePlanForWorkspaceType("general_business", "household"), "business_core");
  assert.equal(resolvePlanForWorkspaceType("dental_practice", "household"), "dental_growth");
  assert.equal(resolvePlanForWorkspaceType("dental_practice", undefined), "dental_growth");
});

test("plan module lists match the plan bundles", () => {
  assert.deepEqual(getPlanModules("household"), [
    "operations",
    "tasks",
    "budgeting",
    "bills",
    "financial",
    "team_access",
  ]);
  assert.equal(getPlanModules("legacy").length, MODULE_KEYS.length);
});
