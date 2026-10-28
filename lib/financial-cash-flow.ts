export interface CashFlowLine {
  id: string;
  entryId: string;
  date: string;
  description: string;
  account: string;
  debitCents: number;
  creditCents: number;
  sourceType: string;
  status: string;
}

export interface CashFlowActivity {
  id: string;
  date: string;
  description: string;
  account: string;
  amountCents: number; // Positive means cash received, unlike the bank import convention.
}

export interface CashFlowWeek {
  start: string;
  end: string;
  label: string;
  inflowCents: number;
  outflowCents: number;
  netCents: number;
  activity: CashFlowActivity[];
}

export interface CashFlowReport {
  month: string;
  label: string;
  through: string;
  weeks: CashFlowWeek[];
  inflowCents: number;
  outflowCents: number;
  netCents: number;
}

export interface CashFlowData {
  report: CashFlowReport;
  months: Array<{ key: string; label: string }>;
  accountNames: string[];
  unpostedCount: number;
  settlingCount: number;
  unsupportedCurrencyCount: number;
}

export function cashFlowToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function cashFlowMonthEnd(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid cash-flow month");
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
}

export function cashFlowDateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

export function buildCashFlowReport(month: string, lines: CashFlowLine[], today: string): CashFlowReport {
  const end = cashFlowMonthEnd(month);
  const through = end < today ? end : today;
  const start = `${month}-01`;
  if (start > today) throw new Error("Future cash-flow month");
  const weeks: CashFlowWeek[] = [];
  let cursor = start;
  while (cursor <= through) {
    const date = new Date(`${cursor}T12:00:00Z`);
    const daysToSunday = (7 - date.getUTCDay()) % 7;
    date.setUTCDate(date.getUTCDate() + daysToSunday);
    const weekEnd = date.toISOString().slice(0, 10) < through ? date.toISOString().slice(0, 10) : through;
    weeks.push({ start: cursor, end: weekEnd, label: `${cashFlowDateLabel(cursor)} – ${cashFlowDateLabel(weekEnd)}`, inflowCents: 0, outflowCents: 0, netCents: 0, activity: [] });
    const next = new Date(`${weekEnd}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
  }
  const entries = new Map<string, CashFlowActivity>();
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.id)) throw new Error("Duplicate cash-flow journal line");
    seen.add(line.id);
    if (line.status !== "posted" || line.sourceType === "opening_balance" || line.date < start || line.date > through) continue;
    if (![line.debitCents, line.creditCents].every((v) => Number.isSafeInteger(v) && v >= 0)) throw new Error("Invalid cash-flow amount");
    const entry = entries.get(line.entryId) ?? { id: line.entryId, date: line.date, description: line.description, account: line.account, amountCents: 0 };
    if (entry.date !== line.date) throw new Error("Inconsistent journal date");
    entry.amountCents += line.debitCents - line.creditCents;
    if (!Number.isSafeInteger(entry.amountCents)) throw new Error("Cash-flow amount exceeds safe range");
    if (entry.account !== line.account) entry.account = "Multiple bank accounts";
    entries.set(line.entryId, entry);
  }
  // Net the bank sides of each journal before counting receipts/payments. Internal
  // bank transfers cancel; card payments and loan payments retain their cash side.
  for (const entry of entries.values()) {
    if (!entry.amountCents) continue;
    const week = weeks.find((w) => entry.date >= w.start && entry.date <= w.end)!;
    week.activity.push(entry);
    week.inflowCents += Math.max(0, entry.amountCents);
    week.outflowCents += Math.max(0, -entry.amountCents);
    week.netCents += entry.amountCents;
  }
  for (const week of weeks) week.activity.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const inflowCents = weeks.reduce((sum, w) => sum + w.inflowCents, 0);
  const outflowCents = weeks.reduce((sum, w) => sum + w.outflowCents, 0);
  if (![inflowCents, outflowCents].every(Number.isSafeInteger)) throw new Error("Cash-flow total exceeds safe range");
  return { month, through, label: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${start}T12:00:00Z`)), weeks, inflowCents, outflowCents, netCents: inflowCents - outflowCents };
}

export function cashFlowCsv(report: CashFlowReport) {
  const cell = (value: string | number) => {
    const text = String(value);
    return `"${(typeof value === "string" && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
  };
  return [["Week", "Start", "End", "Cash in (USD)", "Cash out (USD)", "Net cash (USD)"], ...report.weeks.map((w, i) => [i + 1, w.start, w.end, w.inflowCents / 100, w.outflowCents / 100, w.netCents / 100])].map((row) => row.map(cell).join(",")).join("\r\n");
}
