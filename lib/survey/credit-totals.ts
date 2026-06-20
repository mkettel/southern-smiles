type CreditRecipient = {
  id: string;
  credit_status: string;
  credit_amount_cents: number | null;
};

export function calculateCreditTotals(
  recipients: CreditRecipient[],
  respondedRecipientIds: ReadonlySet<string>
) {
  let promisedCents = 0;
  let redeemedCents = 0;
  let outstandingCents = 0;

  for (const recipient of recipients) {
    const amount = recipient.credit_amount_cents ?? 0;

    if (recipient.credit_status === "promised") {
      promisedCents += amount;
      if (respondedRecipientIds.has(recipient.id)) {
        outstandingCents += amount;
      }
    }

    if (recipient.credit_status === "redeemed") {
      redeemedCents += amount;
    }
  }

  return { promisedCents, redeemedCents, outstandingCents };
}
