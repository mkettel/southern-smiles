import { parseCsvRows } from "./csv";
import type {
  AggregatedPatient,
  AggregationResult,
  DetectedColumn,
  DetectedColumnRole,
} from "@/lib/types";

// ============================================================
// Smart patient importer
//
// Turns a messy CSV — a clean contact list OR a transaction/revenue report
// with a title row, subtotal/Grand-Total rows, "Last, First" names, and
// accounting-negative dollars — into per-patient aggregated records.
// ============================================================

const MONEY_RE = /^-?\$?\s*[\d,]+(\.\d+)?$/;
const DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TOTALS_RE = /^(grand\s+total|total|subtotal)$/i;

/** Parse a currency string to integer cents (magnitude). "-$1,234.50" → 123450. */
export function parseMoney(s: string): number {
  const t = (s ?? "").trim();
  if (!t || t === "-") return 0;
  const cleaned = t.replace(/[\s$,]/g, "").replace(/^-/, "");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.abs(n) * 100);
}

/** Parse M/D/YYYY (or already-ISO) into YYYY-MM-DD, else null. */
export function parseDateISO(s: string): string | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  if (ISO_DATE_RE.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const [, mm, dd, rawYear] = m;
  const yyyy = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/** Split "Last, First M" → display name, first name, and a normalized key. */
export function parseLastFirst(raw: string): {
  full_name: string;
  first_name: string | null;
  name_key: string;
} {
  const name = (raw ?? "").trim();
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

  const comma = name.indexOf(",");
  if (comma === -1) {
    // No comma — treat as already "First Last".
    const first = name.split(/\s+/)[0] || null;
    return { full_name: name, first_name: first, name_key: norm(name) };
  }
  const last = name.slice(0, comma).trim();
  const first = name.slice(comma + 1).trim();
  const firstToken = first.split(/\s+/)[0] || null;
  return {
    full_name: [first, last].filter(Boolean).join(" "),
    first_name: firstToken,
    name_key: `${norm(last)}|${norm(first)}`,
  };
}

function ratio(values: string[], test: (v: string) => boolean): number {
  const nonEmpty = values.filter((v) => v && v.trim() && v.trim() !== "-");
  if (nonEmpty.length === 0) return 0;
  return nonEmpty.filter((v) => test(v.trim())).length / nonEmpty.length;
}

function classify(header: string, values: string[]): DetectedColumnRole {
  const h = header.trim().toLowerCase();

  // Temporal grouping columns (Year/Month/Quarter) are metadata, not money —
  // guard first since a bare "2024" otherwise looks like currency.
  if (/\b(year|month|qtr|quarter|week|day|period)\b/.test(h)) return "other";

  if (/\b(e-?mail)\b/.test(h) || ratio(values, (v) => v.includes("@")) > 0.5)
    return "email";
  if (/\b(phone|mobile|cell|tel)\b/.test(h)) return "phone";
  if (/\b(patient|name|client)\b/.test(h)) return "name";
  if (/\b(chart|mrn|account|patient\s*id|ref|external)\b/.test(h) || h === "id")
    return "external_ref";
  if (/\b(date)\b/.test(h) || ratio(values, (v) => DATE_RE.test(v) || ISO_DATE_RE.test(v)) > 0.6)
    return "date";
  if (
    /\b(collection|revenue|production|payment|charge|adjustment|amount|balance|total|paid|net)\b/.test(h) ||
    ratio(values, (v) => MONEY_RE.test(v)) > 0.6
  )
    return "currency";
  // Fallback: looks like "Last, First"?
  if (ratio(values, (v) => /^[^,]+,\s*\S/.test(v) && /[a-z]/i.test(v)) > 0.6)
    return "name";
  return "other";
}

/** Find the header row: the first row matching the modal column count that
 *  looks like labels (mostly non-numeric). Skips title rows. */
function findHeaderRow(rows: string[][]): number {
  if (rows.length === 0) return -1;
  const counts = new Map<number, number>();
  for (const r of rows) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
  let modal = 1;
  let best = -1;
  for (const [len, c] of counts) {
    if (len > 1 && c > best) {
      best = c;
      modal = len;
    }
  }

  for (let i = 0; i < rows.length; i++) {
    if (rows[i].length !== modal) continue;
    const cells = rows[i].map((c) => c.trim()).filter(Boolean);
    const numericish = cells.filter((c) => MONEY_RE.test(c) || DATE_RE.test(c)).length;
    if (cells.length >= 2 && numericish < cells.length / 2) return i;
  }
  // Fallback: first row with the modal width.
  return rows.findIndex((r) => r.length === modal);
}

export function detectColumns(headers: string[], dataRows: string[][]): DetectedColumn[] {
  return headers.map((header, i) => ({
    header,
    role: classify(header, dataRows.map((r) => r[i] ?? "")),
  }));
}

/** Pick the single best value (money) column among detected currency columns. */
function pickValueIndex(detected: DetectedColumn[]): number {
  const currency = detected
    .map((d, i) => ({ d, i }))
    .filter((x) => x.d.role === "currency");
  if (currency.length === 0) return -1;
  const priority = [
    "total collection",
    "collection",
    "revenue",
    "production",
    "net",
    "paid",
  ];
  for (const key of priority) {
    const hit = currency.find((x) => x.d.header.toLowerCase().includes(key));
    if (hit) return hit.i;
  }
  // A plain "total" that isn't an adjustment.
  const total = currency.find(
    (x) =>
      x.d.header.toLowerCase().includes("total") &&
      !x.d.header.toLowerCase().includes("adjust")
  );
  if (total) return total.i;
  return currency[currency.length - 1].i; // last currency column
}

function pickIndex(detected: DetectedColumn[], role: DetectedColumnRole, preferKeyword?: string): number {
  const matches = detected.map((d, i) => ({ d, i })).filter((x) => x.d.role === role);
  if (matches.length === 0) return -1;
  if (preferKeyword) {
    const hit = matches.find((x) => x.d.header.toLowerCase().includes(preferKeyword));
    if (hit) return hit.i;
  }
  return matches[0].i;
}

/**
 * Aggregate raw CSV text into per-patient records. Title rows, blank rows, and
 * subtotal/Grand-Total rows are skipped.
 */
export function aggregatePatients(text: string): AggregationResult {
  return aggregateRows(parseCsvRows(text));
}

/**
 * Aggregate an already-tokenized 2-D array of rows (e.g. straight from the
 * Google Sheets API). Title rows, blank rows, and subtotal/Grand-Total rows
 * are skipped. `aggregatePatients` is the CSV-text wrapper around this.
 */
export function aggregateRows(allRows: string[][]): AggregationResult {
  const headerIdx = findHeaderRow(allRows);
  if (headerIdx === -1) return { patients: [], detected: [], skipped: 0 };

  const headers = allRows[headerIdx];
  const dataRows = allRows.slice(headerIdx + 1).filter((r) => r.length === headers.length);
  const detected = detectColumns(headers, dataRows);

  const nameIdx = pickIndex(detected, "name", "patient");
  const valueIdx = pickValueIndex(detected);
  const dateIdx = pickIndex(detected, "date", "date");
  const emailIdx = pickIndex(detected, "email");
  const phoneIdx = pickIndex(detected, "phone");
  const refIdx = pickIndex(detected, "external_ref");
  if (nameIdx === -1) return { patients: [], detected, skipped: dataRows.length };

  const otherIdxs = detected
    .map((d, i) => ({ d, i }))
    .filter((x) => x.d.role === "other")
    .map((x) => x.i);

  const map = new Map<string, AggregatedPatient>();
  let skipped = 0;

  for (const row of dataRows) {
    const rawName = (row[nameIdx] ?? "").trim();
    if (!rawName || TOTALS_RE.test(rawName)) {
      skipped++;
      continue;
    }
    const { full_name, first_name, name_key } = parseLastFirst(rawName);
    if (!name_key) {
      skipped++;
      continue;
    }

    const valueCents = valueIdx >= 0 ? parseMoney(row[valueIdx] ?? "") : 0;
    const iso = dateIdx >= 0 ? parseDateISO(row[dateIdx] ?? "") : null;
    const email = emailIdx >= 0 ? (row[emailIdx] ?? "").trim() || null : null;
    const phone = phoneIdx >= 0 ? (row[phoneIdx] ?? "").trim() || null : null;
    const ref = refIdx >= 0 ? (row[refIdx] ?? "").trim() || null : null;

    let p = map.get(name_key);
    if (!p) {
      p = {
        full_name,
        first_name,
        name_key,
        email,
        phone,
        external_ref: ref,
        total_collected_cents: 0,
        visit_count: 0,
        first_seen: null,
        last_seen: null,
        attributes: {},
      };
      map.set(name_key, p);
    }

    p.total_collected_cents += valueCents;
    p.visit_count += 1;
    if (email) p.email = email;
    if (phone) p.phone = phone;
    if (ref) p.external_ref = ref;
    if (iso) {
      if (!p.first_seen || iso < p.first_seen) p.first_seen = iso;
      if (!p.last_seen || iso > p.last_seen) p.last_seen = iso;
    }
    for (const oi of otherIdxs) {
      const v = (row[oi] ?? "").trim();
      if (v) p.attributes[headers[oi]] = v;
    }
  }

  return { patients: [...map.values()], detected, skipped };
}
