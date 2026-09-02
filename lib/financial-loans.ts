export type FinancialLoanStatus = "active" | "paid_off" | "archived";
export type FinancialLoanTermsStatus = "verified" | "partial" | "needs_terms";

export interface FinancialLoanPayment {
  id: string;
  paymentDate: string;
  totalCents: number;
  principalCents: number;
  interestCents: number;
  feeCents: number;
  balanceAfterCents: number | null;
  activityKind: "payment" | "draw" | "adjustment";
  source: "bookkeeping" | "quickbooks_browser" | "manual";
}

export interface FinancialLoanScheduleEntry {
  id: string;
  paymentNumber: number;
  dueDate: string;
  paymentCents: number;
  principalCents: number;
  interestCents: number;
  feeCents: number;
  balanceAfterCents: number;
}

export interface FinancialLoan {
  id: string;
  bookkeepingAccountId: string;
  name: string;
  lenderName: string;
  loanType: string;
  accountReference: string | null;
  originalPrincipalCents: number | null;
  creditLimitCents: number | null;
  availableCreditCents: number | null;
  currentBalanceCents: number;
  balanceAsOfDate: string;
  pastDueCents: number | null;
  daysPastDue: number | null;
  scheduledPaymentCents: number | null;
  paymentFrequency: string | null;
  annualInterestRate: number | null;
  interestMethod: string;
  originatedOn: string | null;
  maturityDate: string | null;
  nextPaymentDate: string | null;
  status: FinancialLoanStatus;
  termsStatus: FinancialLoanTermsStatus;
  isPersonal: boolean;
  source: "manual" | "quickbooks_browser";
  notes: string | null;
  payments: FinancialLoanPayment[];
  schedule: FinancialLoanScheduleEntry[];
}

export interface FinancialLoansData {
  loans: FinancialLoan[];
  liabilityAccounts: Array<{ id: string; label: string }>;
}

export interface LoanSplitCandidate {
  interestMethod?: string | null;
  lastPrincipalCents?: number | null;
  lastInterestCents?: number | null;
  lastFeeCents?: number | null;
  schedule: Array<Pick<FinancialLoanScheduleEntry,
    "dueDate" | "paymentCents" | "principalCents" | "interestCents" | "feeCents">>;
}

export interface LoanPaymentSplit {
  principal: number;
  interest: number;
  fee: number;
}

export interface LoanAllocationCandidate extends LoanSplitCandidate {
  id: string;
  lenderName: string;
  bookkeepingAccountId: string;
}

export interface LoanPaymentAllocation extends LoanPaymentSplit {
  loanId: string;
}

const NEARBY_SCHEDULE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function suggestedLoanPaymentSplit(
  loan: LoanSplitCandidate | null,
  totalCents: number,
  transactionDate?: string,
): LoanPaymentSplit {
  if (!loan || totalCents <= 0) return { principal: Math.max(0, totalCents), interest: 0, fee: 0 };

  const nearby = loan.schedule
    .map((entry) => ({ entry, distance: dateDistance(entry.dueDate, transactionDate) }))
    .filter(({ distance }) => distance <= NEARBY_SCHEDULE_WINDOW_MS)
    .sort((a, b) => a.distance - b.distance);
  const exact = nearby.find(({ entry }) => entry.paymentCents === totalCents)?.entry;
  if (exact) return scheduleSplit(exact);

  const partial = nearby.find(({ entry }) => totalCents < entry.paymentCents)?.entry;
  if (partial) return prorateSplit(partial, totalCents);

  const lastTotal = (loan.lastPrincipalCents ?? 0) + (loan.lastInterestCents ?? 0) + (loan.lastFeeCents ?? 0);
  if (lastTotal === totalCents) return {
    principal: loan.lastPrincipalCents ?? totalCents,
    interest: loan.lastInterestCents ?? 0,
    fee: loan.lastFeeCents ?? 0,
  };

  if (loan.interestMethod === "fixed_fee") {
    const template = loan.schedule.find((entry) => entry.paymentCents === totalCents);
    if (template) return scheduleSplit(template);
  }

  return { principal: totalCents, interest: 0, fee: 0 };
}

export function suggestedLoanPaymentAllocations(
  loans: LoanAllocationCandidate[],
  totalCents: number,
  transactionDate?: string,
): LoanPaymentAllocation[] {
  if (totalCents <= 0 || !transactionDate) return [];

  const groups = new Map<string, LoanAllocationCandidate[]>();
  for (const loan of loans) {
    const key = `${loan.lenderName.toLowerCase()}::${loan.bookkeepingAccountId}`;
    groups.set(key, [...(groups.get(key) ?? []), loan]);
  }
  for (const group of groups.values()) {
    const candidates = group.flatMap((loan) => {
      const entry = loan.schedule
        .map((schedule) => ({ schedule, distance: dateDistance(schedule.dueDate, transactionDate) }))
        .filter(({ distance }) => distance <= NEARBY_SCHEDULE_WINDOW_MS)
        .sort((left, right) => left.distance - right.distance)[0]?.schedule;
      return entry ? [{ loanId: loan.id, entry }] : [];
    });
    const match = exactAllocationCombination(candidates, totalCents);
    if (match.length > 1) return match.map(({ loanId, entry }) => ({ loanId, ...scheduleSplit(entry) }));
  }
  return [];
}

function exactAllocationCombination(
  candidates: Array<{ loanId: string; entry: LoanAllocationCandidate["schedule"][number] }>,
  totalCents: number,
) {
  const search = (
    index: number,
    remaining: number,
    selected: typeof candidates,
  ): typeof candidates | null => {
    if (remaining === 0) return selected;
    if (remaining < 0 || index >= candidates.length) return null;
    return search(index + 1, remaining - candidates[index]!.entry.paymentCents, [...selected, candidates[index]!])
      ?? search(index + 1, remaining, selected);
  };
  return search(0, totalCents, []) ?? [];
}

function dateDistance(dueDate: string, transactionDate?: string) {
  if (!transactionDate) return Number.POSITIVE_INFINITY;
  return Math.abs(new Date(`${dueDate}T12:00:00`).getTime() - new Date(`${transactionDate}T12:00:00`).getTime());
}

function scheduleSplit(entry: Pick<FinancialLoanScheduleEntry, "principalCents" | "interestCents" | "feeCents">) {
  return { principal: entry.principalCents, interest: entry.interestCents, fee: entry.feeCents };
}

function prorateSplit(
  entry: Pick<FinancialLoanScheduleEntry, "paymentCents" | "principalCents" | "interestCents" | "feeCents">,
  totalCents: number,
) {
  const source = [entry.principalCents, entry.interestCents, entry.feeCents];
  const raw = source.map((amount) => amount * totalCents / entry.paymentCents);
  const allocated = raw.map(Math.floor);
  let remainder = totalCents - allocated.reduce((sum, amount) => sum + amount, 0);
  const order = raw
    .map((amount, index) => ({ index, fraction: amount - Math.floor(amount) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; remainder > 0; index += 1, remainder -= 1) {
    allocated[order[index % order.length]!.index] += 1;
  }
  return { principal: allocated[0]!, interest: allocated[1]!, fee: allocated[2]! };
}

export function monthlyPaymentEquivalent(loan: Pick<FinancialLoan, "scheduledPaymentCents" | "paymentFrequency">) {
  if (!loan.scheduledPaymentCents) return 0;
  const multiplier = {
    weekly: 52 / 12,
    biweekly: 26 / 12,
    semimonthly: 2,
    monthly: 1,
    irregular: 0,
  }[loan.paymentFrequency ?? "irregular"] ?? 0;
  return Math.round(loan.scheduledPaymentCents * multiplier);
}

export function loanProgress(loan: Pick<FinancialLoan, "originalPrincipalCents" | "currentBalanceCents">) {
  if (!loan.originalPrincipalCents || loan.originalPrincipalCents <= 0) return null;
  return Math.max(0, Math.min(100, Math.round(
    ((loan.originalPrincipalCents - loan.currentBalanceCents) / loan.originalPrincipalCents) * 100,
  )));
}

export function creditUtilization(loan: Pick<FinancialLoan, "creditLimitCents" | "availableCreditCents" | "currentBalanceCents">) {
  if (!loan.creditLimitCents || loan.creditLimitCents <= 0) return null;
  const usedCredit = loan.availableCreditCents === null
    ? loan.currentBalanceCents
    : loan.creditLimitCents - loan.availableCreditCents;
  return Math.max(0, Math.round((usedCredit / loan.creditLimitCents) * 100));
}

export function availableCredit(loan: Pick<FinancialLoan, "creditLimitCents" | "availableCreditCents" | "currentBalanceCents">) {
  if (loan.creditLimitCents === null) return null;
  if (loan.availableCreditCents !== null) return loan.availableCreditCents;
  return Math.max(0, loan.creditLimitCents - loan.currentBalanceCents);
}
