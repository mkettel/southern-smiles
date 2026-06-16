import { parseLastFirst } from "./patient-import";

// ============================================================
// Patient identity bridge (de-identification)
//
// Turns a patient's identity into an opaque `bridge_key` that the SERVER can
// store and dedupe on without ever seeing a name. Preference order:
//   1. external_ref — the practice's own chart/patient id (high entropy,
//      meaningless without their PMS), used verbatim.
//   2. HMAC-SHA256(per-practice salt, normalized "last|first" name).
//
// Runs in the BROWSER (Web Crypto) at two moments that must agree:
//   • import time — to de-identify rows before sending them to the server.
//   • mail-merge time — to re-derive keys for the local join against the
//     practice's own name+address list.
// Both paths share parseLastFirst's normalization so the keys are identical.
// ============================================================

async function hmacHex(salt: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(salt),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compute the opaque bridge key. Returns `external_ref` (trimmed) when present;
 * otherwise HMAC-SHA256(salt, nameKey). `nameKey` must be the normalized
 * "last|first" key from parseLastFirst so import-time and merge-time keys match.
 */
export async function computeBridgeKey(opts: {
  externalRef?: string | null;
  nameKey: string;
  salt: string;
}): Promise<string> {
  const ref = opts.externalRef?.trim();
  if (ref) return ref;
  return hmacHex(opts.salt, opts.nameKey);
}

/**
 * Derive a bridge key straight from a raw name string (e.g. the mailing CSV's
 * name column). Returns null when the name is empty. `external_ref`, when given,
 * wins over the name hash — matching computeBridgeKey's preference order.
 */
export async function bridgeKeyFromName(
  rawName: string,
  salt: string,
  externalRef?: string | null
): Promise<string | null> {
  const ref = externalRef?.trim();
  if (ref) return ref;
  const { name_key } = parseLastFirst(rawName);
  if (!name_key) return null;
  return hmacHex(salt, name_key);
}
