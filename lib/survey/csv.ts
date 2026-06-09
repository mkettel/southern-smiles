/**
 * Minimal, dependency-free CSV helpers for the patient import + merge export.
 * Handles quoted fields, commas/newlines inside quotes, escaped quotes (""),
 * and CRLF/LF line endings. Good enough for admin spreadsheet exports; if real
 * files prove pathological, swap in papaparse.
 */

/** Parse CSV text into an array of row objects keyed by (lowercased) header. */
export function parseCsv(text: string): Record<string, string>[] {
  // Strip a UTF-8 BOM if present.
  const clean = text.replace(/^﻿/, "");
  const rows = parseRows(clean);
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const out: Record<string, string>[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    // Skip fully blank lines.
    if (cells.length === 1 && cells[0].trim() === "") continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? "").trim();
    });
    out.push(obj);
  }
  return out;
}

/** Tokenize CSV text into a 2D array of raw cell strings (title-rows included). */
export function parseCsvRows(text: string): string[][] {
  return parseRows(text.replace(/^﻿/, ""));
}

/** Tokenize CSV text into a 2D array of raw cell strings. */
function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++; // skip the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // swallow; the paired \n (or EOF) finalizes the row
    } else {
      field += ch;
    }
  }

  // Flush trailing field/row (no newline at EOF).
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Quote a single CSV cell if needed. */
function escapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Serialize rows (objects) to CSV text using the given column order. */
export function toCsv(
  columns: string[],
  rows: Array<Record<string, string | number | null | undefined>>
): string {
  const header = columns.map(escapeCell).join(",");
  const body = rows
    .map((r) =>
      columns.map((c) => escapeCell(String(r[c] ?? ""))).join(",")
    )
    .join("\r\n");
  return body ? `${header}\r\n${body}` : header;
}
