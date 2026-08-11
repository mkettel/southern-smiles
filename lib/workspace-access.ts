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
