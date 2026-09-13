import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) =>
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
"Invalid calendar date");
const authoritySchema = z.object({
  id: z.string().min(1), practiceId: z.string().min(1),
  from: isoDate, through: isoDate,
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  status: z.literal("approved"),
  balancesVerified: z.literal(true),
  accountingBasis: z.literal("cash"),
});
export type AccountingAuthority = z.infer<typeof authoritySchema>;
export interface AuthorityEntry {
  id: string;
  practiceId: string;
  date: string;
  status: "posted" | "voided";
}
export interface BaselineLedger<T extends AuthorityEntry> {
  authority: AccountingAuthority;
  entries: T[];
  // Checked against an independently validated source manifest, not a UI row count.
  expectedEntryCount: number;
}

/** Selects a report source without deleting, voiding or mutating the original journals. */
export function selectAuthoritativeLedger<T extends AuthorityEntry>({
  practiceId, boardEntries, baselines,
}: {
  practiceId: string; boardEntries: T[]; baselines: BaselineLedger<T>[];
}) {
  const sorted = baselines.map((baseline) => ({ ...baseline, authority: authoritySchema.parse(baseline.authority) }))
    .sort((a, b) => a.authority.from.localeCompare(b.authority.from));
  const authorityIds = new Set<string>();
  for (let index = 0; index < sorted.length; index++) {
    const baseline = sorted[index];
    const { authority } = baseline;
    if (authority.practiceId !== practiceId) throw new Error("Cross-practice authority");
    if (authority.from > authority.through) throw new Error("Invalid authority period");
    if (authorityIds.has(authority.id)) throw new Error("Duplicate authority ID");
    authorityIds.add(authority.id);
    if (index && sorted[index - 1].authority.through >= authority.from) throw new Error("Overlapping reporting authorities");
    if (!Number.isSafeInteger(baseline.expectedEntryCount) || baseline.expectedEntryCount < 1 ||
        baseline.entries.length !== baseline.expectedEntryCount) throw new Error("Incomplete baseline ledger");
    const seen = new Set<string>();
    for (const entry of baseline.entries) {
      validateEntry(entry, practiceId, seen);
      if (entry.status !== "posted" || entry.date < authority.from || entry.date > authority.through) {
        throw new Error("Baseline entry outside approved scope");
      }
    }
  }
  const boardIds = new Set<string>();
  const effective: Array<{ source: "board" | "quickbooks"; authorityId: string | null; entry: T }> = [];
  const reviewQueue: Array<{ authorityId: string; reason: "historical_source_replaced"; entry: T }> = [];
  for (const entry of boardEntries) {
    validateEntry(entry, practiceId, boardIds);
    if (entry.status !== "posted") continue;
    const baseline = sorted.find(({ authority }) => entry.date >= authority.from && entry.date <= authority.through);
    if (baseline) reviewQueue.push({ authorityId: baseline.authority.id, reason: "historical_source_replaced", entry });
    else effective.push({ source: "board", authorityId: null, entry });
  }
  for (const baseline of sorted) {
    for (const entry of baseline.entries) effective.push({ source: "quickbooks", authorityId: baseline.authority.id, entry });
  }
  effective.sort((a, b) => a.entry.date.localeCompare(b.entry.date) || a.source.localeCompare(b.source) || a.entry.id.localeCompare(b.entry.id));
  return { effective, reviewQueue };
}

function validateEntry(entry: AuthorityEntry, practiceId: string, seen: Set<string>) {
  isoDate.parse(entry.date);
  if (!entry.id || seen.has(entry.id)) throw new Error("Missing or duplicate entry ID");
  if (entry.practiceId !== practiceId) throw new Error("Cross-practice entry");
  if (entry.status !== "posted" && entry.status !== "voided") throw new Error("Invalid entry status");
  seen.add(entry.id);
}
