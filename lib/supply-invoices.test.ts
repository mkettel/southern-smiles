import assert from "node:assert/strict";
import test from "node:test";
import {
  extractEmailAddress,
  isExpectedSupplyRecipient,
  resolveSupplyVendor,
  validateSupplyAttachments,
} from "./supply-invoices";

test("normalizes display-name email addresses", () => {
  assert.equal(
    extractEmailAddress("Jolt CDP <customerservice@crazydental.com>"),
    "customerservice@crazydental.com",
  );
});

test("requires the dedicated inbound recipient", () => {
  assert.equal(
    isExpectedSupplyRecipient(
      ["Supply Inbox <supplies@example.com>"],
      "supplies@example.com",
    ),
    true,
  );
  assert.equal(
    isExpectedSupplyRecipient(["other@example.com"], "supplies@example.com"),
    false,
  );
});

test("classifies known vendors from sender or reply-to", () => {
  assert.deepEqual(
    resolveSupplyVendor("Jolt CDP <customerservice@crazydental.com>"),
    { key: "crazy_dental", name: "Crazy Dental" },
  );
  assert.deepEqual(
    resolveSupplyVendor("system@sent-via.netsuite.com", [
      "customerservice@crazydental.com",
    ]),
    { key: "crazy_dental", name: "Crazy Dental" },
  );
  assert.deepEqual(resolveSupplyVendor("orders@edgeendo.com"), {
    key: "edgeendo",
    name: "EdgeEndo",
  });
  assert.equal(resolveSupplyVendor("billing@unknown.example"), null);
});

test("accepts PDF evidence and rejects oversized attachments", () => {
  const valid = validateSupplyAttachments([
    {
      id: "attachment-1",
      filename: "invoice.pdf",
      size: 93_000,
      contentType: "application/pdf",
    },
  ]);
  assert.equal(valid.accepted, true);
  assert.equal(valid.accepted && valid.hasSupportedAttachment, true);

  assert.deepEqual(
    validateSupplyAttachments([
      {
        id: "attachment-2",
        filename: "huge.pdf",
        size: 16 * 1024 * 1024,
        contentType: "application/pdf",
      },
    ]),
    { accepted: false, reason: "attachment_too_large" },
  );
});

test("allows known body-only invoice messages for review", () => {
  assert.deepEqual(validateSupplyAttachments([]), {
    accepted: true,
    supported: [],
    hasSupportedAttachment: false,
  });
});
