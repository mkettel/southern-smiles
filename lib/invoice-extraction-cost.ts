export interface InvoiceExtractionTokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_input_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
}

const MODEL_RATES = [
  {
    prefix: "gpt-5.6-luna",
    input: 1,
    cachedInput: 0.1,
    cacheWrite: 1.25,
    output: 6,
  },
  {
    prefix: "gpt-5.6-terra",
    input: 2.5,
    cachedInput: 0.25,
    cacheWrite: 3.125,
    output: 15,
  },
  {
    prefix: "gpt-5.6-sol",
    input: 5,
    cachedInput: 0.5,
    cacheWrite: 6.25,
    output: 30,
  },
] as const;

export function estimateInvoiceExtractionCostMicros(
  model: string,
  usage: InvoiceExtractionTokenUsage,
) {
  const rates = MODEL_RATES.find((entry) => model.startsWith(entry.prefix));
  if (!rates) return null;

  const cached = Math.min(
    usage.input_tokens,
    Math.max(0, usage.cached_input_tokens),
  );
  const cacheWrite = Math.min(
    usage.input_tokens - cached,
    Math.max(0, usage.cache_write_tokens),
  );
  const uncached = Math.max(0, usage.input_tokens - cached - cacheWrite);

  return Math.round(
    uncached * rates.input +
      cached * rates.cachedInput +
      cacheWrite * rates.cacheWrite +
      usage.output_tokens * rates.output,
  );
}
