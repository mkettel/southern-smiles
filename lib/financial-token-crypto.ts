import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const TOKEN_VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

function parseEncryptionKey(rawKey = process.env.FINANCIAL_TOKEN_ENCRYPTION_KEY): Buffer {
  if (!rawKey) {
    throw new Error("FINANCIAL_TOKEN_ENCRYPTION_KEY is not configured");
  }

  const trimmed = rawKey.trim();
  const key = /^[a-f\d]{64}$/i.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");

  if (key.length !== 32) {
    throw new Error("FINANCIAL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }

  return key;
}

export function encryptFinancialToken(
  plaintext: string,
  rawKey?: string,
): string {
  if (!plaintext) throw new Error("Cannot encrypt an empty financial token");

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, parseEncryptionKey(rawKey), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    TOKEN_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptFinancialToken(
  encrypted: string,
  rawKey?: string,
): string {
  const [version, ivEncoded, tagEncoded, ciphertextEncoded, extra] = encrypted.split(".");
  if (
    version !== TOKEN_VERSION ||
    !ivEncoded ||
    !tagEncoded ||
    !ciphertextEncoded ||
    extra
  ) {
    throw new Error("Financial token has an unsupported encrypted format");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    parseEncryptionKey(rawKey),
    Buffer.from(ivEncoded, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

