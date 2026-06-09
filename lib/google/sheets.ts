import { importPKCS8, SignJWT } from "jose";

// ============================================================
// Google Sheets read access via a service account.
// Server-only. Signs a JWT (RS256) with the service-account key using `jose`
// (already a dependency), exchanges it for an access token, then reads the
// Sheets REST API. No googleapis dependency.
// ============================================================

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

/** Typed marker so callers can show a friendly "not configured" state. */
export class GoogleNotConfiguredError extends Error {
  constructor() {
    super("Google Sheets is not configured on the server.");
    this.name = "GoogleNotConfiguredError";
  }
}

export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  );
}

function privateKeyPem(): string {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "";
  // env files often store the key single-line with escaped newlines.
  return raw.replace(/\\n/g, "\n").replace(/^"|"$/g, "").trim();
}

/** Mint a short-lived read-only access token for the Sheets API. */
export async function getAccessToken(): Promise<string> {
  if (!isGoogleConfigured()) throw new GoogleNotConfiguredError();

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  const key = await importPKCS8(privateKeyPem(), "RS256");

  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(email)
    .setSubject(email)
    .setAudience(TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google auth failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Google auth returned no access token");
  return json.access_token;
}

/** Extract the spreadsheet id (and optional gid) from a Sheets URL or raw id. */
export function extractSpreadsheetId(input: string): {
  spreadsheetId: string | null;
  gid: string | null;
} {
  const trimmed = input.trim();
  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = trimmed.match(/[#&?]gid=(\d+)/);
  const spreadsheetId = idMatch
    ? idMatch[1]
    : /^[a-zA-Z0-9-_]{20,}$/.test(trimmed)
      ? trimmed
      : null;
  return { spreadsheetId, gid: gidMatch ? gidMatch[1] : null };
}

export interface SheetTab {
  title: string;
  sheetId: number;
}

/** List the tabs (title + gid) of a spreadsheet. */
export async function listSheetTabs(spreadsheetId: string): Promise<SheetTab[]> {
  const token = await getAccessToken();
  const url = `${SHEETS_BASE}/${spreadsheetId}?fields=${encodeURIComponent(
    "sheets.properties(title,sheetId)"
  )}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Could not read spreadsheet (${res.status}): ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    sheets?: { properties?: { title?: string; sheetId?: number } }[];
  };
  return (json.sheets ?? [])
    .map((s) => s.properties)
    .filter((p): p is { title: string; sheetId: number } => Boolean(p?.title))
    .map((p) => ({ title: p.title, sheetId: p.sheetId ?? 0 }));
}

/**
 * Read all values from a tab as a 2-D string array. When `title` is omitted,
 * reads the first tab. Empty trailing cells are returned as "".
 */
export async function fetchSheetValues(
  spreadsheetId: string,
  title?: string | null
): Promise<string[][]> {
  let tab = title?.trim();
  if (!tab) {
    const tabs = await listSheetTabs(spreadsheetId);
    if (tabs.length === 0) return [];
    tab = tabs[0].title;
  }

  const token = await getAccessToken();
  const range = encodeURIComponent(tab);
  const url = `${SHEETS_BASE}/${spreadsheetId}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Could not read sheet values (${res.status}): ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as { values?: string[][] };
  const rows = json.values ?? [];
  // Normalize ragged rows to equal width (Sheets omits trailing empties).
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  return rows.map((r) => {
    const copy = r.slice();
    while (copy.length < width) copy.push("");
    return copy.map((c) => (c ?? "").toString());
  });
}
