import { parseDollarAmountToCents } from "@/lib/bills";
import type { OverheadImportPreview } from "@/lib/types";

interface ParsedCategory {
  name: string;
  display_order: number;
  notes: string[];
}

interface ParsedItem {
  category_name: string;
  name: string;
  monthly_cost_cents: number;
  notes: string | null;
  display_order: number;
}

export interface ParsedOverheadImport {
  categories: ParsedCategory[];
  items: ParsedItem[];
  preview: OverheadImportPreview;
}

// Mirror the CHECK constraints in migration 043 so a bad import is rejected
// before the destructive delete/insert runs (see validateParsedOverheadImport).
const CATEGORY_NAME_MAX = 160;
const ITEM_NAME_MAX = 200;
const ITEM_NOTES_MAX = 2000;

// parseDollarAmountToCents returns NaN for non-numeric cells (e.g. "TBD",
// "varies", "(500)") and negatives for accounting-style values. Either would
// violate the monthly_cost_cents (integer >= 0) constraint and abort the
// import after the delete already ran. Clamp to a safe non-negative integer.
function parseOverheadCostCents(value: string): number {
  const cents = parseDollarAmountToCents(value);
  if (!Number.isFinite(cents) || cents < 0) return 0;
  return Math.round(cents);
}

// Validate the fully parsed payload against the DB constraints BEFORE any
// destructive write. Returns an error message, or null when the import is safe.
export function validateParsedOverheadImport(
  parsed: ParsedOverheadImport,
): string | null {
  const seen = new Map<string, string>();
  for (const category of parsed.categories) {
    const name = category.name.trim();
    if (name.length < 1 || name.length > CATEGORY_NAME_MAX) {
      return `Category name "${category.name}" must be between 1 and ${CATEGORY_NAME_MAX} characters`;
    }
    const key = name.toLowerCase();
    const existing = seen.get(key);
    if (existing) {
      return `Duplicate category "${name}" (also imported as "${existing}"). Category names must be unique.`;
    }
    seen.set(key, name);
  }

  for (const item of parsed.items) {
    const name = item.name.trim();
    if (name.length < 1 || name.length > ITEM_NAME_MAX) {
      return `Line item "${item.name}" must be between 1 and ${ITEM_NAME_MAX} characters`;
    }
    if (item.notes && item.notes.length > ITEM_NOTES_MAX) {
      return `Notes for line item "${name}" exceed ${ITEM_NOTES_MAX} characters`;
    }
    if (!Number.isInteger(item.monthly_cost_cents) || item.monthly_cost_cents < 0) {
      return `Line item "${name}" has an invalid monthly cost`;
    }
  }

  return null;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function normalizeCell(value: string | undefined) {
  return (value ?? "").replace(/\u00a0/g, " ").trim();
}

function isNewCategory(value: string) {
  return /^\d+[a-z]?\.\s+/i.test(value);
}

function cleanCategoryName(value: string) {
  return value.replace(/^\d+[a-z]?\.\s+/i, "").trim();
}

function isTotalRow(value: string) {
  return value.trim().toUpperCase() === "TOTAL";
}

function isNoteRow(value: string) {
  return /^note:/i.test(value.trim());
}

function normalizeItemName(section: string | null, item: string) {
  if (!section) return item.trim();
  return `${section.trim()} - ${item.trim()}`;
}

function buildRowNotes(cells: string[]) {
  return cells
    .map(normalizeCell)
    .filter((value) => /[a-z]/i.test(value))
    .join(" | ") || null;
}

export function parseOverheadCsv(text: string, fileName: string): ParsedOverheadImport {
  const rows = parseCsv(text);
  const categories: ParsedCategory[] = [];
  const items: ParsedItem[] = [];
  const sheetNotes: string[] = [];

  let currentCategory: ParsedCategory | null = null;
  let currentSection: string | null = null;
  let itemOrder = 0;

  rows.forEach((rawRow) => {
    const row = rawRow.map(normalizeCell);
    const col0 = row[0] ?? "";
    const col1 = row[1] ?? "";
    const col2 = row[2] ?? "";

    if (!row.some(Boolean)) return;
    if (col0 === "Category" && col1 === "Line Item") return;

    if (isNewCategory(col0)) {
      currentCategory = {
        name: cleanCategoryName(col0),
        display_order: categories.length,
        notes: [],
      };
      categories.push(currentCategory);
      currentSection = null;
    }

    if (!currentCategory) {
      if (col0) sheetNotes.push(row.filter(Boolean).join(" | "));
      return;
    }

    if (isNoteRow(col0)) {
      currentCategory.notes.push(row.filter(Boolean).join(" | "));
      return;
    }

    if (col0 && !isNewCategory(col0) && !col1 && !col2) {
      currentSection = col0;
      return;
    }

    if (col1 && !isTotalRow(col1)) {
      const trailingNotes = buildRowNotes(row.slice(7));
      items.push({
        category_name: currentCategory.name,
        name: normalizeItemName(currentSection, col1),
        monthly_cost_cents: parseOverheadCostCents(col2),
        notes: trailingNotes,
        display_order: itemOrder,
      });
      itemOrder += 1;
      return;
    }

    if (!col1 && col0 && !isNewCategory(col0) && !isTotalRow(col0) && !isNoteRow(col0)) {
      const trailingNotes = buildRowNotes(row.slice(7));
      items.push({
        category_name: currentCategory.name,
        name: normalizeItemName(currentSection, col0),
        monthly_cost_cents: parseOverheadCostCents(col2),
        notes: trailingNotes,
        display_order: itemOrder,
      });
      itemOrder += 1;
    }
  });

  const combinedNotes = [
    ...sheetNotes,
    ...categories.flatMap((category) => category.notes),
  ];

  return {
    categories,
    items,
    preview: {
      file_name: fileName,
      category_count: categories.length,
      item_count: items.length,
      total_monthly_cents: items.reduce(
        (sum, item) => sum + item.monthly_cost_cents,
        0,
      ),
      category_names: categories.map((category) => category.name),
      notes: combinedNotes.slice(0, 12),
    },
  };
}
