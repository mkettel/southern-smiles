export type JournalLineDraft =
  | {
      accountKind: "financial";
      accountId: string;
      debitCents: number;
      creditCents: number;
    }
  | {
      accountKind: "bookkeeping";
      accountId: string;
      debitCents: number;
      creditCents: number;
    };

export function buildCategorizedTransactionLines({
  amountCents,
  financialAccountId,
  bookkeepingAccountId,
}: {
  amountCents: number;
  financialAccountId: string;
  bookkeepingAccountId: string;
}): JournalLineDraft[] {
  const valueCents = Math.abs(amountCents);
  if (!valueCents) throw new Error("A journal entry cannot have a zero amount");

  return amountCents > 0
    ? [
        line("bookkeeping", bookkeepingAccountId, valueCents, 0),
        line("financial", financialAccountId, 0, valueCents),
      ]
    : [
        line("financial", financialAccountId, valueCents, 0),
        line("bookkeeping", bookkeepingAccountId, 0, valueCents),
      ];
}

export function buildTransferLines({
  amountCents,
  financialAccountId,
  otherFinancialAccountId,
}: {
  amountCents: number;
  financialAccountId: string;
  otherFinancialAccountId: string;
}): JournalLineDraft[] {
  if (financialAccountId === otherFinancialAccountId) {
    throw new Error("A transfer requires two different accounts");
  }
  const valueCents = Math.abs(amountCents);
  if (!valueCents) throw new Error("A journal entry cannot have a zero amount");

  return amountCents > 0
    ? [
        line("financial", financialAccountId, 0, valueCents),
        line("financial", otherFinancialAccountId, valueCents, 0),
      ]
    : [
        line("financial", financialAccountId, valueCents, 0),
        line("financial", otherFinancialAccountId, 0, valueCents),
      ];
}

export function buildLoanPaymentLines({
  totalCents,
  principalCents,
  interestCents,
  feeCents,
  financialAccountId,
  loanAccountId,
  interestAccountId,
  feeAccountId,
}: {
  totalCents: number;
  principalCents: number;
  interestCents: number;
  feeCents: number;
  financialAccountId: string;
  loanAccountId: string;
  interestAccountId?: string | null;
  feeAccountId?: string | null;
}): JournalLineDraft[] {
  if (totalCents <= 0 || principalCents < 0 || interestCents < 0 || feeCents < 0) {
    throw new Error("Loan payment amounts must be positive");
  }
  if (principalCents + interestCents + feeCents !== totalCents) {
    throw new Error("Loan payment split must equal the total");
  }
  if (interestCents > 0 && !interestAccountId) throw new Error("Interest account is required");
  if (feeCents > 0 && !feeAccountId) throw new Error("Fee account is required");
  return [
    line("financial", financialAccountId, 0, totalCents),
    ...(principalCents ? [line("bookkeeping", loanAccountId, principalCents, 0)] : []),
    ...(interestCents ? [line("bookkeeping", interestAccountId!, interestCents, 0)] : []),
    ...(feeCents ? [line("bookkeeping", feeAccountId!, feeCents, 0)] : []),
  ];
}

export function assertBalancedJournalLines(lines: JournalLineDraft[]) {
  const debitCents = lines.reduce((sum, item) => sum + item.debitCents, 0);
  const creditCents = lines.reduce((sum, item) => sum + item.creditCents, 0);
  if (lines.length < 2 || debitCents !== creditCents) {
    throw new Error(`Journal entry is not balanced: ${debitCents} != ${creditCents}`);
  }
}

function line(
  accountKind: "financial" | "bookkeeping",
  accountId: string,
  debitCents: number,
  creditCents: number,
): JournalLineDraft {
  return { accountKind, accountId, debitCents, creditCents } as JournalLineDraft;
}
