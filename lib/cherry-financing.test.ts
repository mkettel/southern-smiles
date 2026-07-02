import assert from "node:assert/strict";
import test from "node:test";
import {
  getCherryApprovalWeekStart,
  isCherryApprovedFinancingStat,
  parseCherryApprovalEmail,
  parseCherryDollarAmountToCents,
} from "./cherry-financing";

test("parses the standard Cherry approved amount from Total Available", () => {
  const result = parseCherryApprovalEmail({
    messageId: "message-1",
    subject: "Alex has been approved for $10,000 at Southern Smiles",
    receivedAt: "2026-05-19T15:46:54Z",
    body: [
      "Alex has been approved for $10,000 at Southern Smiles",
      "",
      "Name",
      "Alex Example",
      "",
      "Total Available",
      "$10,000",
      "",
      "Expires",
      "Sep 17, 2026",
    ].join("\n"),
  });

  assert.deepEqual(result, {
    source: "cherry_email",
    sourceMessageId: "message-1",
    approvedAt: "2026-05-19T15:46:54Z",
    weekStart: "2026-05-18",
    amountCents: 1_000_000,
    subject: "Alex has been approved for $10,000 at Southern Smiles",
  });
});

test("uses Total Available instead of the higher Growth Plan amount", () => {
  const result = parseCherryApprovalEmail({
    messageId: "message-2",
    subject: "Jordan is approved for purchases up to $7,500 at Southern Smiles",
    receivedAt: "2026-05-19T21:38:54Z",
    body: [
      "Jordan is approved for purchases up to $7,500 at Southern Smiles",
      "",
      "In addition, Jordan could have been approved for $8,000 on the Growth Plan.",
      "",
      "Name",
      "Jordan Example",
      "",
      "Total Available",
      "$7,500",
    ].join("\n"),
  });

  assert.equal(result?.amountCents, 750_000);
});

test("falls back to the subject amount when Total Available is missing", () => {
  const result = parseCherryApprovalEmail({
    messageId: "message-3",
    subject: "Taylor has been approved for $1,250.50 at Southern Smiles",
    receivedAt: "2026-06-29T12:00:00Z",
    body: "Taylor has been approved for $1,250.50 at Southern Smiles",
  });

  assert.equal(result?.amountCents, 125_050);
});

test("ignores non-approval Cherry emails", () => {
  const result = parseCherryApprovalEmail({
    messageId: "message-4",
    subject: "Cherry: Growth Plan",
    receivedAt: "2026-06-29T12:00:00Z",
    body: "Earn up to $1,000 for referrals.",
  });

  assert.equal(result, null);
});

test("normalizes Cherry dollar strings to cents", () => {
  assert.equal(parseCherryDollarAmountToCents("$10,000"), 1_000_000);
  assert.equal(parseCherryDollarAmountToCents("$1,428.00"), 142_800);
  assert.equal(parseCherryDollarAmountToCents("not an amount"), null);
});

test("calculates the Monday week start for approval timestamps", () => {
  assert.equal(getCherryApprovalWeekStart("2026-07-02T12:00:00Z"), "2026-06-29");
  assert.equal(getCherryApprovalWeekStart("not a date"), null);
});

test("matches only the Division 2 dollar Approved Financing stat", () => {
  assert.equal(
    isCherryApprovedFinancingStat({
      name: "Approved Financing",
      stat_type: "dollar",
      post: { division: { number: 2 } },
    }),
    true,
  );
  assert.equal(
    isCherryApprovedFinancingStat({
      name: "Approved Financing",
      stat_type: "dollar",
      post: { division: { number: 3 } },
    }),
    false,
  );
});
