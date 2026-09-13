import crypto from "crypto";
import { ApiError } from "../middleware/errorHandler";

/**
 * QR payload format: MEALVEST:1:<orderId>:<signature>
 *
 * Deliberately compact (per the spec's "do not encode huge JSON
 * objects" requirement) and self-verifying: the signature is an
 * HMAC-SHA256 of the orderId using a server-only secret, so there is
 * no separate "qr_token" value to store, rotate, or leak from the
 * database — anyone holding a valid QR string can only have gotten
 * that signature from this server, and verification just recomputes
 * it and compares.
 *
 * This also means a QR code becoming "invalid" isn't about the token
 * expiring in storage — it's about the ORDER's state (paid? already
 * redeemed?) which orderService checks separately after signature
 * verification passes. Signature validity != redemption eligibility.
 */
const PREFIX = "MEALVEST";
const VERSION = "1";

function getSecret(): string {
  const secret = process.env.QR_SIGNING_SECRET;
  if (!secret) {
    throw new ApiError(500, "QR_NOT_CONFIGURED", "QR_SIGNING_SECRET is not set on the server.");
  }
  return secret;
}

function sign(orderId: string): string {
  return crypto.createHmac("sha256", getSecret()).update(orderId).digest("hex").slice(0, 24);
}

export function generateOrderQrPayload(orderId: string): string {
  return `${PREFIX}:${VERSION}:${orderId}:${sign(orderId)}`;
}

export interface ParsedQr {
  orderId: string;
}

/**
 * Throws ApiError("INVALID_QR") on anything malformed or with a bad
 * signature — callers never need to separately null-check.
 */
export function verifyOrderQrPayload(payload: string): ParsedQr {
  if (typeof payload !== "string") {
    throw new ApiError(400, "INVALID_QR", "QR payload is malformed.");
  }
  const parts = payload.trim().split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX || parts[1] !== VERSION) {
    throw new ApiError(400, "INVALID_QR", "This is not a valid MEALVEST QR code.");
  }
  const [, , orderId, signature] = parts;
  const expected = sign(orderId);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  const validSignature = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!validSignature) {
    throw new ApiError(400, "INVALID_QR", "This QR code's signature could not be verified.");
  }
  return { orderId };
}
