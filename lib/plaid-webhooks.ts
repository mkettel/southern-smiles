import { createHash, timingSafeEqual } from "node:crypto";
import {
  decodeProtectedHeader,
  importJWK,
  jwtVerify,
  type JWK,
} from "jose";
import { getPlaidClient } from "@/lib/plaid-client";

const verificationKeys = new Map<string, JWK>();

export async function verifyPlaidWebhook(
  rawBody: string,
  verificationToken: string | null,
): Promise<boolean> {
  if (!verificationToken) return false;

  try {
    const header = decodeProtectedHeader(verificationToken);
    if (header.alg !== "ES256" || typeof header.kid !== "string") return false;

    let jwk = verificationKeys.get(header.kid);
    if (!jwk) {
      const response = await getPlaidClient().webhookVerificationKeyGet({
        key_id: header.kid,
      });
      jwk = response.data.key as JWK;
      verificationKeys.set(header.kid, jwk);
    }

    const key = await importJWK(jwk, "ES256");
    const { payload } = await jwtVerify(verificationToken, key, {
      algorithms: ["ES256"],
      maxTokenAge: "5 min",
      clockTolerance: 5,
    });
    const claimedHash = payload.request_body_sha256;
    if (typeof claimedHash !== "string") return false;

    const actualHash = createHash("sha256").update(rawBody).digest("hex");
    const actualBuffer = Buffer.from(actualHash, "utf8");
    const claimedBuffer = Buffer.from(claimedHash, "utf8");
    return (
      actualBuffer.length === claimedBuffer.length &&
      timingSafeEqual(actualBuffer, claimedBuffer)
    );
  } catch {
    return false;
  }
}

