import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { buildAccountantPackage, packageInputSchema, toCsv } from "../lib/accountant-package";

async function main() {
  const [snapshot, output, practiceId, from, through] = process.argv.slice(2);
  if (!snapshot || !output || !practiceId || !from || !through || process.argv.length !== 7) {
    throw new Error("Usage: tsx scripts/export-accountant-package.ts SNAPSHOT NEW_OUTPUT PRACTICE_ID FROM THROUGH");
  }
  const sources: { file: string; sha256: string }[] = [];
  async function load(file: string) {
    const buffer = await readFile(path.join(snapshot, file));
    sources.push({ file, sha256: createHash("sha256").update(buffer).digest("hex") });
    return JSON.parse(buffer.toString("utf8"));
  }
  const report = buildAccountantPackage(packageInputSchema.parse({
    practiceId, from, through,
    entries: await load("accounting_journal_entries.json"),
    lines: await load("accounting_journal_lines.json"),
    bookkeepingAccounts: await load("bookkeeping_accounts.json"),
    financialAccounts: await load("financial_accounts.json"),
  }));
  const files: Record<string, string> = { "ledger-extract.json": JSON.stringify(report, null, 2) + "\n" };
  for (const [file, rows] of [["journal.csv", report.journal], ["account-activity.csv", report.account_activity]] as const) {
    const keys = rows.length ? Object.keys(rows[0]) : [];
    files[file] = toCsv([keys, ...rows.map((row) => keys.map((key) => {
      const value = (row as unknown as Record<string, unknown>)[key];
      return typeof value === "boolean" ? String(value) : value as string | number | null;
    }))]);
  }
  files["README.md"] = `# DRAFT accountant ledger extract\n\nPeriod: ${from} through ${through}\n\nThis is a local snapshot export, not current or finalized books. All monetary fields are integer cents. Positive net activity is debit; negative is credit. No cash-basis conversion or opening-balance certification has been performed. No records were posted or changed.\n\n## Outstanding evidence\n\n${report.required_evidence.map((item) => `- [ ] ${item}`).join("\n")}\n\nRetain the manifest for source and output checksums. CSV text is escaped against formula execution; JSON retains original text. Share only through a secure channel.\n`;
  files["manifest.json"] = JSON.stringify({
    schema_version: 1, status: report.status, created_at: new Date().toISOString(),
    practice_id: practiceId, from, through, sources,
    files: Object.entries(files).map(([file, data]) => ({ file, sha256: createHash("sha256").update(data).digest("hex") })),
  }, null, 2) + "\n";
  // Exclusive directory creation refuses overwrite of any prior package or source archive.
  await mkdir(output, { recursive: false, mode: 0o700 });
  try {
    for (const [file, data] of Object.entries(files)) {
      await writeFile(path.join(output, `${file}.partial`), data, { flag: "wx", mode: 0o600 });
      await rename(path.join(output, `${file}.partial`), path.join(output, file));
    }
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
  console.log(JSON.stringify({ output, status: report.status, journal_lines: report.journal.length, accounts: report.account_activity.length }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
