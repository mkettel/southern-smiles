// Local detection of recurring bills and subscriptions from synced
// transactions. Pure: no DB access, so it runs on fixtures in tests and in
// the dev preview.

import {
  accountLabel,
  categoryLabel,
  isTransferTransaction,
  type HouseholdAccountRow,
  type HouseholdTransactionRow,
} from "@/lib/household-finance";

export type RecurringCadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
export type RecurringKind = "bill" | "subscription";
export type RecurringStatus = "detected" | "confirmed" | "dismissed";
export type RecurringOverride = Exclude<RecurringStatus, "detected">;

export interface RecurringStream {
  key: string;
  label: string;
  accountLabel: string;
  categoryKey: string;
  categoryLabel: string;
  cadence: RecurringCadence;
  cadenceLabel: string;
  kind: RecurringKind;
  typicalAmountCents: number;
  amountIsFixed: boolean;
  monthlyEquivalentCents: number;
  occurrences: number;
  firstDate: string;
  lastDate: string;
  nextExpectedDate: string;
  isActive: boolean;
  status: RecurringStatus;
}

export interface RecurringSummary {
  monthlyCents: number;
  billsCents: number;
  subscriptionsCents: number;
  activeCount: number;
  hiddenCount: number;
}

export interface HouseholdRecurringData {
  streams: RecurringStream[];
  monthsAnalyzed: number;
  summary: RecurringSummary;
}

interface CadenceSpec {
  nominalDays: number;
  minDays: number;
  maxDays: number;
  perMonth: number;
  label: string;
}

const CADENCES: Record<RecurringCadence, CadenceSpec> = {
  weekly: { nominalDays: 7, minDays: 5, maxDays: 9, perMonth: 30.44 / 7, label: "Weekly" },
  biweekly: { nominalDays: 14, minDays: 12, maxDays: 16, perMonth: 30.44 / 14, label: "Every 2 weeks" },
  monthly: { nominalDays: 30, minDays: 26, maxDays: 35, perMonth: 1, label: "Monthly" },
  quarterly: { nominalDays: 91, minDays: 80, maxDays: 100, perMonth: 1 / 3, label: "Quarterly" },
  yearly: { nominalDays: 365, minDays: 350, maxDays: 380, perMonth: 1 / 12, label: "Yearly" },
};

const CADENCE_ORDER: RecurringCadence[] = ["weekly", "biweekly", "monthly", "quarterly", "yearly"];

const MIN_OCCURRENCES_FIXED = 3;
const MIN_OCCURRENCES_VARIABLE = 4;
const REGULARITY_FLOOR = 0.6;
const FIXED_AMOUNT_TOLERANCE = 0.15;
const VARIABLE_AMOUNT_TOLERANCE = 0.6;

const BILL_CATEGORIES = new Set([
  "LOAN_PAYMENTS",
  "RENT_AND_UTILITIES",
  "GOVERNMENT_AND_NON_PROFIT",
  "MEDICAL",
  "BANK_FEES",
]);
const SUBSCRIPTION_CATEGORIES = new Set(["ENTERTAINMENT", "GENERAL_SERVICES", "PERSONAL_CARE"]);
const BILL_KEYWORDS = /(insurance|mortgage|loan|electric|water|gas |utility|utilities|hoa|rent|lease|tuition|daycare|childcare)/;
const SUBSCRIPTION_KEYWORDS =
  /(netflix|spotify|hulu|disney|prime|apple|google|adobe|dropbox|icloud|gym|fitness|subscription|membership|patreon|substack|youtube|max |paramount|peacock|audible|kindle|xbox|playstation|nintendo|openai|chatgpt|claude|github|notion|figma)/;

/** Stable grouping key: merchant name with digit-bearing tokens removed. */
export function recurringStreamKey(txn: Pick<HouseholdTransactionRow, "name" | "merchant_name">): string {
  const source = txn.merchant_name?.trim() || txn.name;
  return source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((token) => token && !/\d/.test(token))
    .join(" ")
    .slice(0, 120);
}

export function cadenceLabel(cadence: RecurringCadence): string {
  return CADENCES[cadence].label;
}

export function detectRecurringStreams(input: {
  transactions: HouseholdTransactionRow[];
  accounts: HouseholdAccountRow[];
  today: string;
  overrides?: Record<string, RecurringOverride>;
}): HouseholdRecurringData {
  const labelsById = new Map(input.accounts.map((row) => [row.id, accountLabel(row)]));
  const overrides = input.overrides ?? {};

  const groups = new Map<string, HouseholdTransactionRow[]>();
  let earliest: string | null = null;
  for (const txn of input.transactions) {
    if (txn.pending || txn.amount_cents <= 0) continue;
    if (isTransferTransaction(txn)) continue;
    if (!earliest || txn.transaction_date < earliest) earliest = txn.transaction_date;
    const key = recurringStreamKey(txn);
    if (key.length < 3) continue;
    const group = groups.get(key);
    if (group) group.push(txn);
    else groups.set(key, [txn]);
  }

  const streams: RecurringStream[] = [];
  for (const [key, group] of groups) {
    streams.push(...analyzeGroup(key, group, input.today, labelsById, overrides));
  }

  streams.sort(compareStreams);

  return {
    streams,
    monthsAnalyzed: earliest ? monthsBetween(earliest, input.today) : 0,
    summary: summarizeRecurring(streams),
  };
}

export function summarizeRecurring(streams: RecurringStream[]): RecurringSummary {
  const summary: RecurringSummary = { monthlyCents: 0, billsCents: 0, subscriptionsCents: 0, activeCount: 0, hiddenCount: 0 };
  for (const stream of streams) {
    if (stream.status === "dismissed" || !stream.isActive) {
      summary.hiddenCount += 1;
      continue;
    }
    summary.activeCount += 1;
    summary.monthlyCents += stream.monthlyEquivalentCents;
    if (stream.kind === "bill") summary.billsCents += stream.monthlyEquivalentCents;
    else summary.subscriptionsCents += stream.monthlyEquivalentCents;
  }
  return summary;
}

export function compareStreams(a: RecurringStream, b: RecurringStream): number {
  const rank = (stream: RecurringStream) =>
    stream.status === "dismissed" ? 3 : !stream.isActive ? 2 : stream.status === "confirmed" ? 0 : 1;
  return rank(a) - rank(b) || b.monthlyEquivalentCents - a.monthlyEquivalentCents || a.label.localeCompare(b.label);
}

// Charges from one merchant are split into amount clusters before cadence
// detection, so an insurer billing two policies, or a subscription plus
// occasional usage charges under the same name, become separate streams.
const CLUSTER_GAP_RATIO = 1.35;

function clusterByAmount(group: HouseholdTransactionRow[]): HouseholdTransactionRow[][] {
  const sorted = [...group].sort((a, b) => a.amount_cents - b.amount_cents);
  const clusters: HouseholdTransactionRow[][] = [];
  for (const txn of sorted) {
    const current = clusters[clusters.length - 1];
    const previous = current?.[current.length - 1]?.amount_cents ?? 0;
    // Chain on the previous amount so a bill that drifts up over time stays
    // together, while a jump of more than a third starts a new cluster.
    if (current && txn.amount_cents <= Math.max(previous * CLUSTER_GAP_RATIO, previous + 100)) current.push(txn);
    else clusters.push([txn]);
  }
  return clusters;
}

function analyzeGroup(
  key: string,
  group: HouseholdTransactionRow[],
  today: string,
  labelsById: Map<string, string>,
  overrides: Record<string, RecurringOverride>,
): RecurringStream[] {
  const clusters = clusterByAmount(group).filter((cluster) => cluster.length >= MIN_OCCURRENCES_FIXED);
  const results: RecurringStream[] = [];
  for (const cluster of clusters) {
    // A merchant with a single qualifying cluster keeps the bare merchant key
    // so existing confirmations survive; multiple clusters are keyed by their
    // typical amount in whole dollars.
    const streamKey = clusters.length === 1 ? key : `${key}@${Math.round(median(cluster.map((txn) => txn.amount_cents)) / 100)}`;
    const stream = analyzeOccurrences(streamKey, cluster, today, labelsById, overrides[streamKey] ?? "detected");
    if (!stream) continue;
    if (clusters.length > 1) stream.label = `${stream.label} · ${formatDollars(stream.typicalAmountCents)}`;
    results.push(stream);
  }
  return results;
}

function formatDollars(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function analyzeOccurrences(
  key: string,
  group: HouseholdTransactionRow[],
  today: string,
  labelsById: Map<string, string>,
  status: RecurringStatus,
): RecurringStream | null {
  // One charge per day: a second same-day charge is a split or a duplicate,
  // not a new period.
  const byDate = new Map<string, HouseholdTransactionRow>();
  for (const txn of [...group].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))) {
    if (!byDate.has(txn.transaction_date)) byDate.set(txn.transaction_date, txn);
  }
  const occurrences = [...byDate.values()];
  if (occurrences.length < MIN_OCCURRENCES_FIXED) return null;

  const gaps: number[] = [];
  for (let index = 1; index < occurrences.length; index += 1) {
    gaps.push(daysBetween(occurrences[index - 1].transaction_date, occurrences[index].transaction_date));
  }
  const medianGap = median(gaps);
  const cadence = CADENCE_ORDER.find((candidate) => {
    const spec = CADENCES[candidate];
    return medianGap >= spec.minDays && medianGap <= spec.maxDays;
  });
  if (!cadence) return null;
  const spec = CADENCES[cadence];
  const regular = gaps.filter((gap) => gap >= spec.minDays && gap <= spec.maxDays).length / gaps.length;
  if (regular < REGULARITY_FLOOR) return null;

  const amounts = occurrences.map((txn) => txn.amount_cents);
  const typicalAmountCents = Math.round(median(amounts));
  if (typicalAmountCents <= 0) return null;
  const within = (tolerance: number) =>
    amounts.every((amount) => Math.abs(amount - typicalAmountCents) <= Math.max(100, typicalAmountCents * tolerance));
  const amountIsFixed = within(FIXED_AMOUNT_TOLERANCE);
  if (!amountIsFixed) {
    if (cadence === "weekly" || cadence === "biweekly") return null;
    if (occurrences.length < MIN_OCCURRENCES_VARIABLE) return null;
    if (!within(VARIABLE_AMOUNT_TOLERANCE)) return null;
  }

  const lastDate = occurrences[occurrences.length - 1].transaction_date;
  const isActive = daysBetween(lastDate, today) <= spec.maxDays * 1.5;
  const categoryKey = mostCommon(occurrences.map((txn) => (txn.plaid_category_primary ?? "").toUpperCase() || "UNCATEGORIZED"));
  const label = mostCommon(occurrences.map((txn) => txn.merchant_name?.trim() || txn.name));
  const accountId = mostCommon(occurrences.map((txn) => txn.account_id ?? ""));

  return {
    key,
    label,
    accountLabel: (accountId && labelsById.get(accountId)) || "Unknown account",
    categoryKey,
    categoryLabel: categoryLabel(categoryKey),
    cadence,
    cadenceLabel: spec.label,
    kind: classifyKind(
      [
        key,
        mostCommon(occurrences.map((txn) => normalizeText(txn.name))),
        mostCommon(occurrences.map((txn) => normalizeText(txn.plaid_category_detailed ?? ""))),
      ].join(" "),
      categoryKey,
      amountIsFixed,
    ),
    typicalAmountCents,
    amountIsFixed,
    monthlyEquivalentCents: Math.round(typicalAmountCents * spec.perMonth),
    occurrences: occurrences.length,
    firstDate: occurrences[0].transaction_date,
    lastDate,
    nextExpectedDate: addDays(lastDate, Math.round(medianGap)),
    isActive,
    status,
  };
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function classifyKind(text: string, categoryKey: string, amountIsFixed: boolean): RecurringKind {
  const padded = ` ${text} `;
  if (BILL_KEYWORDS.test(padded)) return "bill";
  if (SUBSCRIPTION_KEYWORDS.test(padded)) return "subscription";
  if (BILL_CATEGORIES.has(categoryKey)) return "bill";
  if (SUBSCRIPTION_CATEGORIES.has(categoryKey)) return "subscription";
  return amountIsFixed ? "subscription" : "bill";
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  let best = values[0] ?? "";
  let bestCount = 0;
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function toUtc(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  return new Date(toUtc(date) + days * 86_400_000).toISOString().slice(0, 10);
}

function monthsBetween(from: string, to: string): number {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  return Math.max(1, (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1);
}
