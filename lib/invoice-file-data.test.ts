import assert from "node:assert/strict";
import test from "node:test";
import { encodeInvoicePdfDataUrl } from "./invoice-file-data";

test("encodes invoice PDF bytes as an OpenAI-compatible data URL", () => {
  const bytes = Buffer.from("%PDF-1.7\ninvoice");
  const encoded = encodeInvoicePdfDataUrl(bytes);

  assert.match(encoded, /^data:application\/pdf;base64,/);
  assert.deepEqual(
    Buffer.from(encoded.split(",", 2)[1], "base64"),
    bytes,
  );
});
