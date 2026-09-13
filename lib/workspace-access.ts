export const WORKSPACE_TYPES = [
  "dental_practice",
  "household",
  "general_business",
] as const;

export type WorkspaceType = (typeof WORKSPACE_TYPES)[number];

export const PLAN_KEYS = [
  "legacy",
  "dental_core",
  "dental_growth",
  "household",
  "business_core",
] as const;

export type PlanKey = (typeof PLAN_KEYS)[number];

export const MODULE_KEYS = [
  "operations",
  "stats",
  "tasks",
  "oic_log",
  "org_board",
  "command_center",
  "budgeting",
  "procedure_costs",
  "supply_management",
  "bills",
  "financial",
  "approved_financing",
  "patient_surveys",
  "export_analyze",
  "team_access",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface ModuleOverride {
  moduleKey: ModuleKey;
  enabled: boolean;
}

export interface WorkspaceAccess {
  workspaceType: WorkspaceType;
  planKey: PlanKey;
  modules: Record<ModuleKey, boolean>;
}

const ALL_MODULES = new Set<ModuleKey>(MODULE_KEYS);

const PLAN_MODULES: Record<PlanKey, ReadonlySet<ModuleKey>> = {
  legacy: ALL_MODULES,
  dental_core: new Set([
    "operations",
    "stats",
    "tasks",
    "oic_log",
    "org_board",
    "command_center",
    "budgeting",
    "bills",
    "team_access",
  ]),
  dental_growth: ALL_MODULES,
  household: new Set([
    "operations",
    "tasks",
    "budgeting",
    "bills",
    "financial",
    "team_access",
  ]),
  business_core: new Set([
    "operations",
    "stats",
    "tasks",
    "oic_log",
    "org_board",
    "command_center",
    "budgeting",
    "bills",
    "financial",
    "export_analyze",
    "team_access",
  ]),
};

const WORKSPACE_LABELS: Partial<
  Record<WorkspaceType, Partial<Record<ModuleKey, string>>>
> = {
  household: {
    operations: "Home",
    budgeting: "Budget",
    team_access: "Household & Access",
    financial: "Finances",
  },
  general_business: {
    budgeting: "Operating Costs",
  },
};

export function isWorkspaceType(value: unknown): value is WorkspaceType {
  return typeof value === "string" && WORKSPACE_TYPES.includes(value as WorkspaceType);
}

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && PLAN_KEYS.includes(value as PlanKey);
}

export function isModuleKey(value: unknown): value is ModuleKey {
  return typeof value === "string" && MODULE_KEYS.includes(value as ModuleKey);
}

export function resolveWorkspaceAccess(input?: {
  workspaceType?: unknown;
  planKey?: unknown;
  overrides?: Array<{ moduleKey: unknown; enabled: boolean }>;
}): WorkspaceAccess {
  const workspaceType = isWorkspaceType(input?.workspaceType)
    ? input.workspaceType
    : "dental_practice";
  const planKey = isPlanKey(input?.planKey) ? input.planKey : "legacy";
  const included = PLAN_MODULES[planKey];
  const modules = Object.fromEntries(
    MODULE_KEYS.map((moduleKey) => [moduleKey, included.has(moduleKey)]),
  ) as Record<ModuleKey, boolean>;

  for (const override of input?.overrides ?? []) {
    if (isModuleKey(override.moduleKey)) {
      modules[override.moduleKey] = override.enabled;
    }
  }

  return { workspaceType, planKey, modules };
}

export function hasModuleAccess(
  access: WorkspaceAccess,
  moduleKey: ModuleKey,
): boolean {
  return access.modules[moduleKey];
}

export function getWorkspaceLabel(
  access: Pick<WorkspaceAccess, "workspaceType">,
  moduleKey: ModuleKey,
  defaultLabel: string,
): string {
  return WORKSPACE_LABELS[access.workspaceType]?.[moduleKey] ?? defaultLabel;
}

export function getWorkspaceEntityLabel(
  access: Pick<WorkspaceAccess, "workspaceType">,
): "Practice" | "Household" | "Business" {
  if (access.workspaceType === "household") return "Household";
  if (access.workspaceType === "general_business") return "Business";
  return "Practice";
}

export function getWorkspaceHomeHref(access: WorkspaceAccess): string {
  if (access.modules.operations) return "/dashboard";
  if (access.modules.stats) return "/stats";
  if (access.modules.tasks) return "/tasks";
  if (access.modules.financial) return "/admin/financial";
  return "/profile";
}

export interface WorkspaceTypeOption {
  value: WorkspaceType;
  label: string;
  description: string;
  defaultPlan: PlanKey;
}

export const WORKSPACE_TYPE_OPTIONS: readonly WorkspaceTypeOption[] = [
  {
    value: "dental_practice",
    label: "Dental Practice",
    description:
      "Weekly stats and conditions, procedure costs, supplies, patient surveys, and financing.",
    defaultPlan: "dental_growth",
  },
  {
    value: "household",
    label: "Household",
    description:
      "Personal budgeting: connected accounts, bills, budget, and shared tasks.",
    defaultPlan: "household",
  },
  {
    value: "general_business",
    label: "Business",
    description:
      "Stats and conditions, operating costs, bills, financial accounts, and reporting.",
    defaultPlan: "business_core",
  },
];

// Plans that belong to each workspace type. Switching types keeps the current
// plan when it already fits; otherwise the type's default plan is used.
const WORKSPACE_PLANS: Record<WorkspaceType, ReadonlySet<PlanKey>> = {
  dental_practice: new Set(["legacy", "dental_core", "dental_growth"]),
  household: new Set(["household"]),
  general_business: new Set(["business_core"]),
};

export function resolvePlanForWorkspaceType(
  workspaceType: WorkspaceType,
  currentPlan?: unknown,
): PlanKey {
  if (isPlanKey(currentPlan) && WORKSPACE_PLANS[workspaceType].has(currentPlan)) {
    return currentPlan;
  }
  const option = WORKSPACE_TYPE_OPTIONS.find((o) => o.value === workspaceType);
  return option?.defaultPlan ?? "legacy";
}

export const MODULE_LABELS: Record<ModuleKey, string> = {
  operations: "Operations",
  stats: "Stats",
  tasks: "Tasks",
  oic_log: "Action Log",
  org_board: "Org Board",
  command_center: "Command Center",
  budgeting: "Overhead",
  procedure_costs: "Procedure Costs",
  supply_management: "Supply Management",
  bills: "Bills",
  financial: "Financial",
  approved_financing: "Approved Financing",
  patient_surveys: "Patient Surveys",
  export_analyze: "Export & Analyze",
  team_access: "Team & Access",
};

export function getPlanModules(planKey: PlanKey): ModuleKey[] {
  const included = PLAN_MODULES[planKey];
  return MODULE_KEYS.filter((moduleKey) => included.has(moduleKey));
}
