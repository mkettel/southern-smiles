export function encodeInvoicePdfDataUrl(
  bytes: Uint8Array<ArrayBufferLike>,
) {
  return `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;
}
