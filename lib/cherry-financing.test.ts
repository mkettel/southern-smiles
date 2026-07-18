import assert from "node:assert/strict";
import test from "node:test";
import {
  getCherryBusinessWeekStart,
  getCherryApprovalWeekStart,
  getCherryEmailBody,
  isCherryApprovedFinancingStat,
  isExpectedCherryRecipient,
  isExpectedCherrySender,
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

test("ignores a mid-line 'total available' upsell above the real labeled line", () => {
  const result = parseCherryApprovalEmail({
    messageId: "message-upsell",
    subject: "Sam has been approved for $5,000 at Southern Smiles",
    receivedAt: "2026-05-19T15:46:54Z",
    body: [
      "Sam has been approved for $5,000 at Southern Smiles",
      "",
      "On the Growth Plan your total available could have been $9,999.",
      "",
      "Total Available",
      "$5,000",
    ].join("\n"),
  });

  assert.equal(result?.amountCents, 500_000);
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

test("parses Cherry amounts with cents and USD suffixes", () => {
  const result = parseCherryApprovalEmail({
    messageId: "message-usd",
    subject: "Morgan has been approved for $10,000.00 USD at Southern Smiles",
    receivedAt: "2026-06-29T12:00:00Z",
    body: ["Total Available", "$10,000.00 USD"].join("\n"),
  });

  assert.equal(result?.amountCents, 1_000_000);
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
  assert.equal(parseCherryDollarAmountToCents("$10,000.00 USD"), 1_000_000);
  assert.equal(parseCherryDollarAmountToCents("not an amount"), null);
});

test("calculates the Monday week start for approval timestamps", () => {
  assert.equal(getCherryApprovalWeekStart("2026-07-02T12:00:00Z"), "2026-06-29");
  assert.equal(getCherryApprovalWeekStart("not a date"), null);
});

test("keeps Friday approvals before 4 PM Phoenix time in the current week", () => {
  assert.equal(
    getCherryBusinessWeekStart("2026-07-17T22:59:59Z"),
    "2026-07-13",
  );
});

test("moves Friday approvals at 4 PM Phoenix time to the following week", () => {
  assert.equal(
    getCherryBusinessWeekStart("2026-07-17T23:00:00Z"),
    "2026-07-20",
  );
});

test("moves weekend approvals to the following week", () => {
  assert.equal(
    getCherryBusinessWeekStart("2026-07-18T18:00:00Z"),
    "2026-07-20",
  );
  assert.equal(
    getCherryBusinessWeekStart("2026-07-19T18:00:00Z"),
    "2026-07-20",
  );
});

test("accepts only the configured Cherry sender", () => {
  assert.equal(isExpectedCherrySender("Cherry <support@withcherry.com>"), true);
  assert.equal(
    isExpectedCherrySender("support@withcherry.com.attacker.example"),
    false,
  );
});

test("requires the configured inbound recipient", () => {
  assert.equal(
    isExpectedCherryRecipient(
      ["Approvals <approvals@example.com>"],
      "approvals@example.com",
    ),
    true,
  );
  assert.equal(
    isExpectedCherryRecipient(["other@example.com"], "approvals@example.com"),
    false,
  );
});

test("uses the text email body and safely falls back to HTML", () => {
  assert.equal(
    getCherryEmailBody("Total Available\n$7,500", "<b>ignored</b>"),
    "Total Available\n$7,500",
  );
  assert.equal(
    getCherryEmailBody(null, "<p>Total Available</p><p>&#36;7,500</p>"),
    "Total Available\n $7,500",
  );
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
