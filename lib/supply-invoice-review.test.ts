import assert from "node:assert/strict";
import test from "node:test";
import {
  applyApprovedSupplyPrices,
  buildInitialInvoiceReview,
  filterSupplyCatalog,
  hydrateInvoiceReview,
  isValidInvoiceDate,
  suggestCatalogMatch,
  type SupplyInvoiceExtraction,
} from "./supply-invoice-review";
import type { SavedSupplyWorkspace } from "./supply-ordering";

const extraction: SupplyInvoiceExtraction = {
  invoice_number: "2852598CS",
  invoice_date: "2026-07-24",
  currency: "USD",
  subtotal_cents: 9399,
  tax_cents: 0,
  shipping_cents: 0,
  total_cents: 9399,
  line_items: [
    {
      line_id: "line-1",
      sku: "ABC-123",
      description: "Premium patient bibs",
      quantity: 2,
      unit_label: "box",
      unit_cost_cents: 4699,
      line_total_cents: 9398,
      confidence: 0.98,
    },
  ],
  extraction_notes: [],
};

const workspace: SavedSupplyWorkspace = {
  catalog: [
    {
      id: "patient-bib",
      name: "Premium patient bibs",
      category: "routine",
      catalog_group: "general",
      vendor: "Crazy Dental",
      vendor_id: "ABC-123",
      product_url: null,
      alternative_urls: [],
      unit_label: "box",
      current_unit_cost_cents: 4200,
      last_price_note: null,
      prior_unit_cost_cents: null,
      reorder_level: 2,
      quantity_on_hand: null,
      procedure_links: [],
      updated_at: "2026-07-01",
    },
  ],
  purchases: [],
  settings: {
    budget_month: "2026-07",
    published_at: null,
    published_by: null,
    collections_cents: 0,
    routine_target_percent: 5,
    office_target_percent: 2,
    routine_baseline_cents: 0,
    office_baseline_cents: 0,
  },
  orderDraft: [],
};

test("catalog matching prefers exact vendor SKU", () => {
  assert.deepEqual(
    suggestCatalogMatch(extraction.line_items[0], workspace.catalog),
    { catalog_item_id: "patient-bib", score: 1, reason: "sku" },
  );
});

test("initial review proposes matches without selecting price updates", () => {
  assert.deepEqual(buildInitialInvoiceReview(extraction, workspace.catalog), {
    invoice_number: "2852598CS",
    invoice_date: "2026-07-24",
    lines: [
      {
        line_id: "line-1",
        catalog_item_id: "patient-bib",
        apply_price: false,
        proposed_unit_cost_cents: 4699,
      },
    ],
    notes: "",
  });
});

test("approval preserves the prior cost and records an auditable note", () => {
  const result = applyApprovedSupplyPrices(
    workspace,
    {
      invoice_number: "2852598CS",
      invoice_date: "2026-07-24",
      lines: [
        {
          line_id: "line-1",
          catalog_item_id: "patient-bib",
          apply_price: true,
          proposed_unit_cost_cents: 4699,
        },
      ],
      notes: "",
    },
    {
      vendorName: "Crazy Dental",
      invoiceNumber: "2852598CS",
      reviewedAt: "2026-07-27T12:30:00.000Z",
      lineItems: extraction.line_items,
    },
  );

  assert.equal(result.workspace.catalog[0].prior_unit_cost_cents, 4200);
  assert.equal(result.workspace.catalog[0].current_unit_cost_cents, 4699);
  assert.equal(
    result.workspace.catalog[0].last_price_note,
    "Crazy Dental invoice 2852598CS, reviewed 2026-07-27",
  );
  assert.equal(result.changes[0].old_unit_cost_cents, 4200);
  assert.equal(result.workspace.catalog[0].vendor_id, "ABC-123");
  assert.deepEqual(
    suggestCatalogMatch(
      extraction.line_items[0],
      result.workspace.catalog,
    ),
    { catalog_item_id: "patient-bib", score: 1, reason: "sku" },
  );
});

test("approval rejects unknown catalog items", () => {
  assert.throws(
    () =>
      applyApprovedSupplyPrices(
        workspace,
        {
          invoice_number: null,
          invoice_date: "2026-07-24",
          lines: [
            {
              line_id: "line-1",
              catalog_item_id: "not-real",
              apply_price: true,
              proposed_unit_cost_cents: 4699,
            },
          ],
          notes: "",
        },
        {
          vendorName: "Crazy Dental",
          invoiceNumber: null,
          reviewedAt: "2026-07-27T12:30:00.000Z",
        },
      ),
    /unknown catalog item/,
  );
});

test("invoice dates must be real calendar dates", () => {
  assert.equal(isValidInvoiceDate("2026-07-24"), true);
  assert.equal(isValidInvoiceDate("7742-02-62"), false);
  assert.equal(isValidInvoiceDate("2026-02-29"), false);
});

test("invalid extracted dates are left blank for review", () => {
  const invalidExtraction = { ...extraction, invoice_date: "7742-02-62" };
  const draft = buildInitialInvoiceReview(
    invalidExtraction,
    workspace.catalog,
  );
  assert.equal(draft.invoice_date, null);
  assert.equal(
    hydrateInvoiceReview(
      invalidExtraction,
      { lines: draft.lines, notes: "" },
      workspace.catalog,
    ).invoice_date,
    null,
  );
});

test("catalog matching recognizes a contained product name", () => {
  const catalog = [
    {
      ...workspace.catalog[0],
      id: "zircad",
      name: "Zircad Cement",
      vendor_id: null,
    },
  ];
  assert.deepEqual(
    suggestCatalogMatch(
      {
        ...extraction.line_items[0],
        sku: "579-746964EN",
        description: "Vivadent ZirCAD Cement 8.5g",
      },
      catalog,
    ),
    { catalog_item_id: "zircad", score: 0.9, reason: "name_contains" },
  );
});

test("catalog search filters by product, vendor, and SKU tokens", () => {
  assert.deepEqual(
    filterSupplyCatalog(workspace.catalog, "crazy abc 123").map(
      (item) => item.id,
    ),
    ["patient-bib"],
  );
});
