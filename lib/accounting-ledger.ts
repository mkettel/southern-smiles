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
