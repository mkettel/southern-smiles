export type SupplyCategory = "routine" | "office" | "implant_graft";
export type SupplyCatalogGroup =
  | "lab"
  | "office_cleaning"
  | "general"
  | "oral_surgery"
  | "ortho";

export interface SupplyProcedureLink {
  procedure_name: string;
  units_per_procedure: number;
}

export interface SupplyCatalogItem {
  id: string;
  name: string;
  category: SupplyCategory;
  catalog_group: SupplyCatalogGroup;
  vendor: string;
  product_url: string | null;
  alternative_urls: string[];
  unit_label: string;
  current_unit_cost_cents: number | null;
  last_price_note: string | null;
  prior_unit_cost_cents: number | null;
  reorder_level: number;
  quantity_on_hand: number | null;
  procedure_links: SupplyProcedureLink[];
  updated_at: string;
}

export interface SupplyPurchase {
  id: string;
  catalog_item_id: string;
  vendor: string;
  purchased_at: string;
  quantity: number;
  unit_cost_cents: number;
  category: SupplyCategory;
  case_reference: string | null;
  notes: string | null;
}

export interface SupplyOrderDraftLine {
  id: string;
  catalog_item_id: string;
  vendor: string;
  quantity: number;
  added_at: string;
}

export interface SupplyBudgetSettings {
  budget_month: string;
  published_at: string | null;
  published_by: string | null;
  collections_cents: number;
  routine_target_percent: number;
  office_target_percent: number;
  routine_baseline_cents: number;
  office_baseline_cents: number;
}

export interface SavedSupplyWorkspace {
  catalog: SupplyCatalogItem[];
  purchases: SupplyPurchase[];
  settings: SupplyBudgetSettings;
  orderDraft: SupplyOrderDraftLine[];
}

export const SUPPLY_CATEGORY_META: Record<
  SupplyCategory,
  { label: string; short_label: string; description: string }
> = {
  routine: {
    label: "Operating budget - Clinical",
    short_label: "Clinical",
    description: "Everyday dental and medical items that belong in the operating-supply budget.",
  },
  office: {
    label: "Operating budget - Office",
    short_label: "Office",
    description: "Non-clinical supplies needed to run the office.",
  },
  implant_graft: {
    label: "Case material - Implant/Graft",
    short_label: "Case material",
    description: "Case-specific clinical materials tracked outside the monthly operating budget.",
  },
};

export const SUPPLY_CATALOG_GROUP_META: Record<
  SupplyCatalogGroup,
  { label: string; description: string }
> = {
  lab: {
    label: "Lab Supplies",
    description: "Lab, sterilization, and supporting clinical supplies.",
  },
  office_cleaning: {
    label: "Office / Cleaning",
    description: "Office operations, cleaning, and non-clinical supplies.",
  },
  general: {
    label: "General Supplies",
    description: "General clinical supplies used across the practice.",
  },
  oral_surgery: {
    label: "Oral Surgery",
    description: "Oral surgery and implant-related clinical supplies.",
  },
  ortho: {
    label: "Ortho",
    description: "Orthodontic supplies and materials.",
  },
};

export const DEFAULT_SUPPLY_BUDGET_SETTINGS: SupplyBudgetSettings = {
  budget_month: "2026-07",
  published_at: "2026-07-07",
  published_by: "Dr. Monzer Shakally",
  collections_cents: 5_286_500,
  routine_target_percent: 5.5,
  office_target_percent: 2,
  routine_baseline_cents: 301_000,
  office_baseline_cents: 108_700,
};

const PROCEDURE_COST_SEED: SupplyCatalogItem[] = [
  {
    id: "patient-bib",
    name: "Patient bib",
    category: "routine",
    catalog_group: "general",
    vendor: "Net32",
    product_url: null,
    alternative_urls: [],
    unit_label: "each",
    current_unit_cost_cents: 13,
    last_price_note: null,
    prior_unit_cost_cents: null,
    reorder_level: 250,
    quantity_on_hand: null,
    procedure_links: [
      { procedure_name: "Complete Denture", units_per_procedure: 6 },
      { procedure_name: "Partial Denture", units_per_procedure: 5 },
    ],
    updated_at: "2026-07-14",
  },
  {
    id: "pip-paste",
    name: "PIP paste",
    category: "routine",
    catalog_group: "general",
    vendor: "Net32",
    product_url: null,
    alternative_urls: [],
    unit_label: "application",
    current_unit_cost_cents: 200,
    last_price_note: null,
    prior_unit_cost_cents: null,
    reorder_level: 12,
    quantity_on_hand: null,
    procedure_links: [{ procedure_name: "Complete Denture", units_per_procedure: 3 }],
    updated_at: "2026-07-14",
  },
  {
    id: "pip-brush",
    name: "PIP brush",
    category: "routine",
    catalog_group: "general",
    vendor: "Net32",
    product_url: null,
    alternative_urls: [],
    unit_label: "each",
    current_unit_cost_cents: 20,
    last_price_note: null,
    prior_unit_cost_cents: null,
    reorder_level: 24,
    quantity_on_hand: null,
    procedure_links: [{ procedure_name: "Complete Denture", units_per_procedure: 3 }],
    updated_at: "2026-07-14",
  },
  {
    id: "locator-abutments-inserts",
    name: "Locator abutments + inserts",
    category: "implant_graft",
    catalog_group: "oral_surgery",
    vendor: "Net32",
    product_url: null,
    alternative_urls: [],
    unit_label: "each",
    current_unit_cost_cents: 8400,
    last_price_note: null,
    prior_unit_cost_cents: null,
    reorder_level: 2,
    quantity_on_hand: null,
    procedure_links: [{ procedure_name: "Complete Denture", units_per_procedure: 2 }],
    updated_at: "2026-07-14",
  },
];

export const DEFAULT_SUPPLY_CATALOG: SupplyCatalogItem[] = [
  ...(importedSupplyCatalog as SupplyCatalogItem[]),
  ...PROCEDURE_COST_SEED,
];

export function createSupplyId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function calculateSupplyBudgetCents(
  collectionsCents: number,
  targetPercent: number,
) {
  return Math.round(collectionsCents * (targetPercent / 100));
}
import importedSupplyCatalog from "@/lib/supply-catalog-seed.json";
