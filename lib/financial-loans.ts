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

export interface FinancialLoan {
  id: string;
  bookkeepingAccountId: string;
  name: string;
  lenderName: string;
  loanType: string;
  accountReference: string | null;
  originalPrincipalCents: number | null;
  currentBalanceCents: number;
  balanceAsOfDate: string;
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
}

export interface FinancialLoansData {
  loans: FinancialLoan[];
  liabilityAccounts: Array<{ id: string; label: string }>;
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

