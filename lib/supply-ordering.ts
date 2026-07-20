export type SupplyCategory = "routine" | "office" | "implant_graft";
export type SupplyOrderMethod = "online" | "phone" | "in_person";
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
  vendor_id?: string | null;
  order_method?: SupplyOrderMethod;
  ordering_instructions?: string | null;
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
  vendor_id?: string | null;
  item_name?: string;
  order_method?: SupplyOrderMethod;
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
  vendor_id?: string | null;
  order_method?: SupplyOrderMethod;
  quantity: number;
  added_at: string;
}

export interface SupplyVendor {
  id: string;
  name: string;
  default_order_method: SupplyOrderMethod;
  website_url: string | null;
  phone: string | null;
  address: string | null;
  ordering_instructions: string | null;
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
  vendors?: SupplyVendor[];
}

export const SUPPLY_ORDER_METHOD_META: Record<
  SupplyOrderMethod,
  { label: string; past_tense: string; description: string }
> = {
  online: {
    label: "Online",
    past_tense: "Ordered online",
    description: "Open the saved product page and place the order online.",
  },
  phone: {
    label: "Phone",
    past_tense: "Ordered by phone",
    description: "Call the vendor, confirm the price, then mark the order complete.",
  },
  in_person: {
    label: "In person",
    past_tense: "Purchased in person",
    description: "Buy locally, record the actual price, then mark the purchase complete.",
  },
};

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

export const DEFAULT_SUPPLY_VENDORS = buildSupplyVendorDirectory(DEFAULT_SUPPLY_CATALOG);

export function createSupplyId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function supplyVendorKey(name: string) {
  const key = name.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
  const legacyAliases: Record<string, string> = {
    amaazon: "amazon",
    n3t32: "net32",
    net: "net32",
  };
  return legacyAliases[key] ?? key;
}

function canonicalSupplyVendorName(name: string) {
  const key = supplyVendorKey(name);
  if (key === "amazon") return "Amazon";
  if (key === "net32") return "Net32";
  return name.trim();
}

export function createSupplyVendor(
  name: string,
  defaultOrderMethod: SupplyOrderMethod = "online",
): SupplyVendor {
  const key = supplyVendorKey(name);
  return {
    id: `vendor-${key || createSupplyId("vendor")}`,
    name: canonicalSupplyVendorName(name),
    default_order_method: defaultOrderMethod,
    website_url: null,
    phone: null,
    address: null,
    ordering_instructions: null,
  };
}

export function normalizeSupplyVendors(vendors: SupplyVendor[]) {
  const normalized = new Map<string, SupplyVendor>();
  for (const vendor of vendors) {
    const key = supplyVendorKey(vendor.name);
    if (!key) continue;
    const existing = normalized.get(key);
    const canonical = { ...vendor, id: `vendor-${key}`, name: canonicalSupplyVendorName(vendor.name) };
    normalized.set(key, existing ? {
      ...canonical,
      website_url: existing.website_url ?? canonical.website_url,
      phone: existing.phone ?? canonical.phone,
      address: existing.address ?? canonical.address,
      ordering_instructions: existing.ordering_instructions ?? canonical.ordering_instructions,
    } : canonical);
  }
  return [...normalized.values()].sort((first, second) => first.name.localeCompare(second.name));
}

export function buildSupplyVendorDirectory(
  catalog: SupplyCatalogItem[],
  purchases: SupplyPurchase[] = [],
): SupplyVendor[] {
  const vendors = new Map<string, SupplyVendor>();
  for (const source of [...catalog, ...purchases]) {
    const name = source.vendor?.trim();
    if (!name || name.toLocaleLowerCase() === "vendor not set") continue;
    const key = supplyVendorKey(name);
    if (!key || vendors.has(key)) continue;
    const method = "order_method" in source && source.order_method
      ? source.order_method
      : "online";
    vendors.set(key, createSupplyVendor(name, method));
  }
  return normalizeSupplyVendors([...vendors.values()]);
}

export function calculateSupplyBudgetCents(
  collectionsCents: number,
  targetPercent: number,
) {
  return Math.round(collectionsCents * (targetPercent / 100));
}
import importedSupplyCatalog from "@/lib/supply-catalog-seed.json";
