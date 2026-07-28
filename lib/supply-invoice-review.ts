import { z } from "zod";
import type {
  SavedSupplyWorkspace,
  SupplyCatalogItem,
} from "@/lib/supply-ordering";

const nullableMoney = z.number().int().min(0).max(100_000_000).nullable();

export function isValidInvoiceDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const supplyInvoiceExtractionSchema = z.object({
  invoice_number: z.string().trim().max(120).nullable(),
  invoice_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  currency: z.string().trim().min(3).max(3),
  subtotal_cents: nullableMoney,
  tax_cents: nullableMoney,
  shipping_cents: nullableMoney,
  total_cents: nullableMoney,
  line_items: z
    .array(
      z.object({
        line_id: z.string().trim().min(1).max(80),
        sku: z.string().trim().max(120).nullable(),
        description: z.string().trim().min(1).max(500),
        quantity: z.number().positive().max(1_000_000).nullable(),
        unit_label: z.string().trim().max(80).nullable(),
        unit_cost_cents: nullableMoney,
        line_total_cents: nullableMoney,
        confidence: z.number().min(0).max(1),
      }),
    )
    .min(1)
    .max(100),
  extraction_notes: z.array(z.string().trim().min(1).max(300)).max(20),
});

export type SupplyInvoiceExtraction = z.infer<
  typeof supplyInvoiceExtractionSchema
>;

export const supplyInvoiceReviewDraftSchema = z.object({
  invoice_number: z.string().trim().max(120).nullable().optional(),
  invoice_date: z
    .string()
    .trim()
    .refine(isValidInvoiceDate, "Enter a valid invoice date.")
    .nullable()
    .optional(),
  lines: z
    .array(
      z.object({
        line_id: z.string().trim().min(1).max(80),
        catalog_item_id: z.string().trim().min(1).max(200).nullable(),
        apply_price: z.boolean(),
        proposed_unit_cost_cents: nullableMoney,
      }),
    )
    .max(100),
  notes: z.string().trim().max(2_000),
});

export type SupplyInvoiceReviewDraft = z.infer<
  typeof supplyInvoiceReviewDraftSchema
>;

export interface CatalogMatchSuggestion {
  catalog_item_id: string | null;
  score: number;
  reason: "sku" | "exact_name" | "name_contains" | "similar_name" | "none";
}

export interface ApprovedSupplyPriceChange {
  line_id: string;
  catalog_item_id: string;
  catalog_item_name: string;
  old_unit_cost_cents: number | null;
  new_unit_cost_cents: number;
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenScore(left: string, right: string) {
  const leftTokens = new Set(normalize(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalize(right).split(" ").filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  ).length;
  return intersection / Math.max(leftTokens.size, rightTokens.size);
}

export function suggestCatalogMatch(
  line: SupplyInvoiceExtraction["line_items"][number],
  catalog: SupplyCatalogItem[],
): CatalogMatchSuggestion {
  const sku = normalize(line.sku);
  if (sku) {
    const skuMatch = catalog.find(
      (item) => normalize(item.vendor_id) === sku,
    );
    if (skuMatch) {
      return { catalog_item_id: skuMatch.id, score: 1, reason: "sku" };
    }
  }

  const description = normalize(line.description);
  const exact = catalog.find((item) => normalize(item.name) === description);
  if (exact) {
    return { catalog_item_id: exact.id, score: 1, reason: "exact_name" };
  }

  const contained = catalog
    .map((item) => {
      const itemName = normalize(item.name);
      const tokens = itemName.split(" ").filter(Boolean);
      const contains =
        itemName.length >= 5 &&
        tokens.length >= 2 &&
        (description.includes(itemName) || itemName.includes(description));
      return { item, itemName, contains };
    })
    .filter((candidate) => candidate.contains)
    .sort((a, b) => b.itemName.length - a.itemName.length)[0];
  if (contained) {
    return {
      catalog_item_id: contained.item.id,
      score: 0.9,
      reason: "name_contains",
    };
  }

  const ranked = catalog
    .map((item) => ({
      item,
      score: tokenScore(line.description, item.name),
    }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (best && best.score >= 0.55) {
    return {
      catalog_item_id: best.item.id,
      score: best.score,
      reason: "similar_name",
    };
  }

  return { catalog_item_id: null, score: best?.score ?? 0, reason: "none" };
}

export function filterSupplyCatalog(
  catalog: SupplyCatalogItem[],
  query: string,
) {
  const tokens = normalize(query).split(" ").filter(Boolean);
  if (!tokens.length) return catalog;
  return catalog.filter((item) => {
    const searchable = normalize(
      `${item.name} ${item.vendor} ${item.vendor_id ?? ""}`,
    );
    return tokens.every((token) => searchable.includes(token));
  });
}

export function buildInitialInvoiceReview(
  extraction: SupplyInvoiceExtraction,
  catalog: SupplyCatalogItem[],
): SupplyInvoiceReviewDraft {
  return {
    invoice_number: extraction.invoice_number,
    invoice_date: isValidInvoiceDate(extraction.invoice_date)
      ? extraction.invoice_date
      : null,
    lines: extraction.line_items.map((line) => {
      const suggestion = suggestCatalogMatch(line, catalog);
      return {
        line_id: line.line_id,
        catalog_item_id: suggestion.catalog_item_id,
        apply_price: false,
        proposed_unit_cost_cents: line.unit_cost_cents,
      };
    }),
    notes: "",
  };
}

export function hydrateInvoiceReview(
  extraction: SupplyInvoiceExtraction,
  draft: SupplyInvoiceReviewDraft | null,
  catalog: SupplyCatalogItem[],
): SupplyInvoiceReviewDraft {
  const initial = buildInitialInvoiceReview(extraction, catalog);
  if (!draft) return initial;
  return {
    ...draft,
    invoice_number:
      draft.invoice_number === undefined
        ? initial.invoice_number
        : draft.invoice_number,
    invoice_date:
      draft.invoice_date === undefined ? initial.invoice_date : draft.invoice_date,
  };
}

export function getInvoiceMatchStatus(
  extraction: SupplyInvoiceExtraction,
  catalog: SupplyCatalogItem[],
) {
  const suggestions = extraction.line_items.map((line) =>
    suggestCatalogMatch(line, catalog),
  );
  if (suggestions.every((match) => match.score === 1)) return "exact_match";
  if (suggestions.some((match) => match.catalog_item_id)) {
    return "possible_match";
  }
  return "new_catalog_item";
}

export function applyApprovedSupplyPrices(
  workspace: SavedSupplyWorkspace,
  draft: SupplyInvoiceReviewDraft,
  context: {
    vendorName: string;
    invoiceNumber: string | null;
    reviewedAt: string;
    lineItems?: SupplyInvoiceExtraction["line_items"];
  },
): {
  workspace: SavedSupplyWorkspace;
  changes: ApprovedSupplyPriceChange[];
} {
  const parsed = supplyInvoiceReviewDraftSchema.parse(draft);
  const selected = parsed.lines.filter((line) => line.apply_price);
  if (!selected.length) {
    throw new Error("Select at least one price to approve.");
  }

  const selectedByCatalogId = new Map<string, (typeof selected)[number]>();
  for (const line of selected) {
    if (!line.catalog_item_id || line.proposed_unit_cost_cents === null) {
      throw new Error("Every approved line needs a catalog item and price.");
    }
    if (selectedByCatalogId.has(line.catalog_item_id)) {
      throw new Error("A catalog item can only be updated once per invoice.");
    }
    selectedByCatalogId.set(line.catalog_item_id, line);
  }

  const knownIds = new Set(workspace.catalog.map((item) => item.id));
  for (const catalogId of selectedByCatalogId.keys()) {
    if (!knownIds.has(catalogId)) {
      throw new Error("An approved line references an unknown catalog item.");
    }
  }

  const date = context.reviewedAt.slice(0, 10);
  const invoiceLines = new Map(
    (context.lineItems ?? []).map((line) => [line.line_id, line]),
  );
  const evidence = context.invoiceNumber
    ? `${context.vendorName} invoice ${context.invoiceNumber}`
    : `${context.vendorName} invoice`;
  const changes: ApprovedSupplyPriceChange[] = [];
  const catalog = workspace.catalog.map((item) => {
    const line = selectedByCatalogId.get(item.id);
    if (!line || line.proposed_unit_cost_cents === null) return item;
    changes.push({
      line_id: line.line_id,
      catalog_item_id: item.id,
      catalog_item_name: item.name,
      old_unit_cost_cents: item.current_unit_cost_cents,
      new_unit_cost_cents: line.proposed_unit_cost_cents,
    });
    return {
      ...item,
      vendor_id: invoiceLines.get(line.line_id)?.sku ?? item.vendor_id,
      prior_unit_cost_cents: item.current_unit_cost_cents,
      current_unit_cost_cents: line.proposed_unit_cost_cents,
      last_price_note: `${evidence}, reviewed ${date}`,
      updated_at: date,
    };
  });

  return { workspace: { ...workspace, catalog }, changes };
}
