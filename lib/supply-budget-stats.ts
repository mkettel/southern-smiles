import type { ConditionName } from "@/lib/conditions";
import {
  calculateSupplyBudgetCents,
  type SavedSupplyWorkspace,
  type SupplyCategory,
} from "@/lib/supply-ordering";

export type SupplyBudgetStatKind = Extract<SupplyCategory, "routine" | "office">;

export interface SupplyBudgetSnapshot {
  spentCents: number;
  budgetCents: number;
  utilizationPercent: number;
  expectedPercent: number;
  paceIndexPercent: number;
  condition: ConditionName;
}

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}

function parseDateParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

export function getBusinessDayProgress(month: string, asOfDate: string) {
  const monthParts = parseDateParts(`${month}-01`);
  const asOfParts = parseDateParts(asOfDate);
  if (!monthParts.year || !monthParts.month || !asOfParts.year || !asOfParts.month || !asOfParts.day) {
    return 0;
  }

  const monthIndex = monthParts.year * 12 + monthParts.month;
  const asOfMonthIndex = asOfParts.year * 12 + asOfParts.month;
  if (asOfMonthIndex < monthIndex) return 0;
  if (asOfMonthIndex > monthIndex) return 100;

  const daysInMonth = new Date(Date.UTC(monthParts.year, monthParts.month, 0)).getUTCDate();
  let totalBusinessDays = 0;
  let elapsedBusinessDays = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const weekday = new Date(Date.UTC(monthParts.year, monthParts.month - 1, day)).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    totalBusinessDays += 1;
    if (day <= asOfParts.day) elapsedBusinessDays += 1;
  }

  return totalBusinessDays > 0
    ? roundPercent((elapsedBusinessDays / totalBusinessDays) * 100)
    : 0;
}

export function getSupplyBudgetPaceCondition(paceIndexPercent: number): ConditionName {
  if (paceIndexPercent <= 75) return "power";
  if (paceIndexPercent < 90) return "affluence";
  if (paceIndexPercent <= 110) return "normal";
  if (paceIndexPercent <= 125) return "emergency";
  if (paceIndexPercent <= 150) return "danger";
  return "non_existence";
}

export function buildSupplyBudgetSnapshots(
  workspace: SavedSupplyWorkspace,
  asOfDate: string,
): Record<SupplyBudgetStatKind, SupplyBudgetSnapshot> {
  const month = asOfDate.slice(0, 7);
  const spent = workspace.purchases.reduce(
    (totals, purchase) => {
      if (
        !purchase.purchased_at.startsWith(month)
        || purchase.purchased_at > asOfDate
        || purchase.category === "implant_graft"
      ) {
        return totals;
      }
      totals[purchase.category] += purchase.quantity * purchase.unit_cost_cents;
      return totals;
    },
    { routine: 0, office: 0 } as Record<SupplyBudgetStatKind, number>,
  );

  const routineBudget = workspace.settings.routine_baseline_cents
    || calculateSupplyBudgetCents(
      workspace.settings.collections_cents,
      workspace.settings.routine_target_percent,
    );
  const officeBudget = workspace.settings.office_baseline_cents
    || calculateSupplyBudgetCents(
      workspace.settings.collections_cents,
      workspace.settings.office_target_percent,
    );
  const expectedPercent = getBusinessDayProgress(month, asOfDate);

  function snapshot(kind: SupplyBudgetStatKind, budgetCents: number): SupplyBudgetSnapshot {
    const utilizationPercent = budgetCents > 0
      ? roundPercent((spent[kind] / budgetCents) * 100)
      : 0;
    const paceIndexPercent = expectedPercent > 0
      ? roundPercent((utilizationPercent / expectedPercent) * 100)
      : 0;

    return {
      spentCents: spent[kind],
      budgetCents,
      utilizationPercent,
      expectedPercent,
      paceIndexPercent,
      condition: getSupplyBudgetPaceCondition(paceIndexPercent),
    };
  }

  return {
    routine: snapshot("routine", routineBudget),
    office: snapshot("office", officeBudget),
  };
}

export function getSupplyBudgetStatKind(stat: {
  name?: string | null;
  abbreviation?: string | null;
  post?: {
    title?: string | null;
    division?: { number?: number | null } | null;
  } | null;
}): SupplyBudgetStatKind | null {
  const name = stat.name?.trim().toLocaleLowerCase() ?? "";
  const abbreviation = stat.abbreviation?.trim().toLocaleLowerCase() ?? "";
  const postTitle = stat.post?.title?.trim().toLocaleLowerCase() ?? "";
  const division = stat.post?.division?.number;

  if (
    (abbreviation === "dbt" || name === "dental budget target")
    && (postTitle === "dental supplies officer" || division === 4)
  ) {
    return "routine";
  }

  if (
    (abbreviation === "sbt" || name === "supply budget target")
    && (postTitle === "supplies officer" || division === 3)
  ) {
    return "office";
  }

  return null;
}
