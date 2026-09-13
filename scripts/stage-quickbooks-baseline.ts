import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { validateQuickBooksBaseline } from "../lib/quickbooks-baseline";

async function main() {
  const [file, practiceId] = process.argv.slice(2);
  if (!file || !practiceId) throw new Error("Usage: stage-quickbooks-baseline.ts FILE PRACTICE_ID");
  const original = JSON.parse(await readFile(file, "utf8"));
  validateQuickBooksBaseline(original, practiceId);
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Missing server-only database credentials");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const table = `${base}/rest/v1/accounting_source_baselines`;
  const url = `${table}?${new URLSearchParams({practice_id:`eq.${practiceId}`,select:"document,is_active"})}`;
  const read = async () => {
    const response = await fetch(url, {headers, signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(`Read failed: HTTP ${response.status}`);
    return await response.json() as Array<{document:unknown;is_active:boolean}>;
  };
  let rows = await read();
  if (!rows.length) {
    const response = await fetch(table, {method:"POST",headers,signal:AbortSignal.timeout(30000),
      body:JSON.stringify({practice_id:practiceId,document:original,source_sha256:original.sourceSha256,is_active:false})});
    if (!response.ok) throw new Error(`Staging failed: HTTP ${response.status}; no update or activation attempted`);
    rows = await read();
  }
  if (rows.length !== 1 || !isDeepStrictEqual(rows[0].document, original)) throw new Error("Staged source readback differs");
  validateQuickBooksBaseline(rows[0].document, practiceId);
  console.log(JSON.stringify({practiceId,staged:true,active:rows[0].is_active,entries:original.expectedEntryCount,
    lines:original.expectedLineCount,sourceSha256:original.sourceSha256}));
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
