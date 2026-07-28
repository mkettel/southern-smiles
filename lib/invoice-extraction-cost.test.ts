import assert from "node:assert/strict";
import test from "node:test";
import { estimateInvoiceExtractionCostMicros } from "./invoice-extraction-cost";

test("estimates standard Luna invoice extraction cost", () => {
  assert.equal(
    estimateInvoiceExtractionCostMicros("gpt-5.6-luna", {
      input_tokens: 4_000,
      output_tokens: 500,
      total_tokens: 4_500,
      cached_input_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 200,
    }),
    7_000,
  );
});

test("accounts for cached input and cache writes", () => {
  assert.equal(
    estimateInvoiceExtractionCostMicros("gpt-5.6-luna", {
      input_tokens: 4_000,
      output_tokens: 0,
      total_tokens: 4_000,
      cached_input_tokens: 1_000,
      cache_write_tokens: 1_000,
      reasoning_tokens: 0,
    }),
    3_350,
  );
});

test("returns null for models without a configured rate", () => {
  assert.equal(
    estimateInvoiceExtractionCostMicros("custom-model", {
      input_tokens: 1,
      output_tokens: 1,
      total_tokens: 2,
      cached_input_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
    }),
    null,
  );
});
