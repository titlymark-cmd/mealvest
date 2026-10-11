import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  CyzoraPaymentProvider,
  verifyCyzoraWebhookSignature,
  extractWebhookResource,
  mapCyzoraChargeStatus,
  assertCyzoraRedirectUrl,
} from "../src/services/cyzoraProvider";
import { kesToCents, centsToKes, mapCyzoraError } from "../src/services/cyzoraClient";
import {
  buildCyzoraDestination,
  isCyzoraPayoutSupported,
  mapCyzoraPayoutStatus,
  CYZORA_PAYOUT_MIN_CENTS,
} from "../src/services/cyzoraPayoutService";
import { ApiError } from "../src/middleware/errorHandler";

/**
 * Same scope as payments.test.ts: everything here runs with no network
 * and no database — webhook signature verification, status/amount
 * mapping, payout destination mapping and error mapping. The live
 * paths (POST /charges against Cyzora's test mode, the full webhook →
 * activatePaymentIfNeeded → budget flow) are exercised by the manual
 * checklist in TESTING.md "Cyzora integration test checklist", with
 * an sk_test_ key and Cyzora's test phone numbers.
 */

// Provided by tests/setup.ts (or a real .env) before this module loads —
// config/env.ts reads it once at import time.
const WEBHOOK_SECRET = process.env.CYZORA_WEBHOOK_SECRET!;

function sign(body: Buffer, secret = WEBHOOK_SECRET): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifyCyzoraWebhookSignature", () => {
  const body = Buffer.from(
    JSON.stringify({ event: "charge.succeeded", livemode: false, data: { id: "ch_123", account_ref: "MV-1", amount: 500000, status: "succeeded" } })
  );

  test("rejects a missing header with 401", () => {
    assert.throws(
      () => verifyCyzoraWebhookSignature(body, undefined),
      (err: unknown) => err instanceof ApiError && err.status === 401 && /signature/i.test(err.message)
    );
  });

  test("rejects a signature made with the wrong secret with 401", () => {
    assert.throws(
      () => verifyCyzoraWebhookSignature(body, sign(body, "whsec_someone_else")),
      (err: unknown) => err instanceof ApiError && err.status === 401
    );
  });

  test("rejects a signature over different bytes (tampered body)", () => {
    const tampered = Buffer.from(body.toString("utf8").replace("500000", "100"));
    assert.throws(
      () => verifyCyzoraWebhookSignature(tampered, sign(body)),
      (err: unknown) => err instanceof ApiError && err.status === 401
    );
  });

  test("rejects a wrong-length signature without throwing a timingSafeEqual RangeError", () => {
    assert.throws(
      () => verifyCyzoraWebhookSignature(body, "abc"),
      (err: unknown) => err instanceof ApiError && err.status === 401
    );
  });

  test("accepts a correctly signed raw body and returns the parsed event", () => {
    const event = verifyCyzoraWebhookSignature(body, sign(body));
    assert.equal(event.event, "charge.succeeded");
    assert.equal(event.livemode, false);
  });

  test("accepts an upper-case hex digest", () => {
    const event = verifyCyzoraWebhookSignature(body, sign(body).toUpperCase());
    assert.equal(event.event, "charge.succeeded");
  });

  test("refuses a body that is not raw bytes (JSON parser ran first)", () => {
    assert.throws(
      () => verifyCyzoraWebhookSignature({ event: "charge.succeeded" } as unknown as Buffer, sign(body)),
      (err: unknown) => err instanceof ApiError && err.code === "WEBHOOK_BODY_NOT_RAW"
    );
  });

  test("the provider's PaymentProvider.handleWebhook still enforces the signature first", async () => {
    const provider = new CyzoraPaymentProvider();
    await assert.rejects(
      () => provider.handleWebhook(body, sign(body, "whsec_wrong")),
      (err: unknown) => err instanceof ApiError && err.status === 401
    );
  });
});

describe("extractWebhookResource", () => {
  test("reads the charge from a data envelope", () => {
    const r = extractWebhookResource({ event: "charge.succeeded", data: { id: "ch_1", account_ref: "MV-1" } });
    assert.equal(r.id, "ch_1");
    assert.equal(r.account_ref, "MV-1");
  });
  test("falls back to a top-level charge/payout key or the event itself", () => {
    assert.equal(extractWebhookResource({ event: "payout.paid", payout: { id: "po_1" } }).id, "po_1");
    assert.equal(extractWebhookResource({ event: "charge.failed", id: "ch_2" }).id, "ch_2");
  });
  test("never throws on junk", () => {
    assert.deepEqual(extractWebhookResource(null), {});
    assert.deepEqual(extractWebhookResource("x"), {});
  });
});

describe("mapCyzoraChargeStatus", () => {
  test("succeeded is the only success", () => {
    assert.equal(mapCyzoraChargeStatus("succeeded"), "success");
    assert.equal(mapCyzoraChargeStatus("pending"), "pending");
    assert.equal(mapCyzoraChargeStatus(undefined), "pending");
  });
  test("failed, timeout and expired are terminal failures", () => {
    assert.equal(mapCyzoraChargeStatus("failed"), "failed");
    assert.equal(mapCyzoraChargeStatus("timeout"), "failed");
    assert.equal(mapCyzoraChargeStatus("expired"), "failed");
  });
});

describe("amounts are integers in cents at the Cyzora boundary only", () => {
  test("KES 1,500 is 150000", () => {
    assert.equal(kesToCents(1500), 150000);
  });
  test("a cent-precise hotel amount (KES 174.46) rounds to 17446, never a float", () => {
    assert.equal(kesToCents(174.46), 17446);
    assert.equal(Number.isInteger(kesToCents(174.46)), true);
  });
  test("non-positive or non-numeric amounts are rejected", () => {
    assert.throws(() => kesToCents(0), (e: unknown) => e instanceof ApiError && e.status === 400);
    assert.throws(() => kesToCents(NaN), (e: unknown) => e instanceof ApiError);
  });
  test("cents come back as whole KSh, and a missing amount is NaN (so the amount check fails closed)", () => {
    assert.equal(centsToKes(500000), 5000);
    assert.equal(Number.isNaN(centsToKes(undefined)), true);
  });
});

describe("assertCyzoraRedirectUrl", () => {
  test("https is accepted, http only for localhost", () => {
    assert.doesNotThrow(() => assertCyzoraRedirectUrl("https://mealvest.vercel.app/payment/callback", "callback_url"));
    assert.doesNotThrow(() => assertCyzoraRedirectUrl("http://localhost:3000/payment/callback", "callback_url"));
    assert.throws(() => assertCyzoraRedirectUrl("http://mealvest.example/payment/callback", "callback_url"));
    assert.throws(() => assertCyzoraRedirectUrl("not a url", "cancel_url"));
  });
});

describe("mapCyzoraError", () => {
  function axiosLike(status: number, data: unknown) {
    return { isAxiosError: true, response: { status, data, headers: {} }, message: "x", toJSON: () => ({}) };
  }
  test("passes Cyzora's own { error } message through for 400/422", () => {
    const err = mapCyzoraError(axiosLike(422, { error: "phone is invalid" }), "t", "fallback");
    assert.equal(err.status, 400);
    assert.equal(err.message, "phone is invalid");
  });
  test("never echoes key problems to the client beyond a config hint", () => {
    const err = mapCyzoraError(axiosLike(401, { error: "invalid api key sk_test_abc" }), "t", "fallback");
    assert.equal(err.status, 500);
    assert.equal(/sk_test_abc/.test(err.message), false);
  });
  test("maps 404/409/410/429", () => {
    assert.equal(mapCyzoraError(axiosLike(404, { error: "nope" }), "t", "f").status, 404);
    assert.equal(mapCyzoraError(axiosLike(409, { error: "dup" }), "t", "f").status, 409);
    assert.equal(mapCyzoraError(axiosLike(410, { error: "expired" }), "t", "f").status, 410);
    assert.equal(mapCyzoraError(axiosLike(429, { error: "slow down" }), "t", "f").status, 503);
  });
});

describe("Cyzora payout destinations", () => {
  test("till -> destination_type till + short_code", () => {
    assert.deepEqual(buildCyzoraDestination({ method: "mpesa_till", tillNumber: "123456" }), {
      destination_type: "till",
      short_code: "123456",
    });
  });
  test("paybill -> short_code + account_ref", () => {
    assert.deepEqual(buildCyzoraDestination({ method: "paybill", paybillNumber: "400200", accountNumber: "HOTEL-1" }), {
      destination_type: "paybill",
      short_code: "400200",
      account_ref: "HOTEL-1",
    });
  });
  test("send_money / pochi -> mobile with a normalized 254 phone", () => {
    assert.deepEqual(buildCyzoraDestination({ method: "send_money", phoneNumber: "0712 345 678" }), {
      destination_type: "mobile",
      phone: "254712345678",
    });
    assert.deepEqual(buildCyzoraDestination({ method: "pochi_la_biashara", pochiPhoneNumber: "254700000001" }), {
      destination_type: "mobile",
      phone: "254700000001",
    });
  });
  test("bank is not automated yet (needs a bank_code from GET /payout-banks)", () => {
    assert.equal(isCyzoraPayoutSupported("bank"), false);
    assert.throws(() => buildCyzoraDestination({ method: "bank" }), (e: unknown) => e instanceof ApiError && e.code === "PAYOUT_METHOD_NOT_SUPPORTED");
  });
  test("missing or invalid details fail before any API call", () => {
    assert.throws(() => buildCyzoraDestination({ method: "mpesa_till" }), (e: unknown) => e instanceof ApiError && e.code === "PAYOUT_DETAILS_INCOMPLETE");
    assert.throws(() => buildCyzoraDestination({ method: "send_money", phoneNumber: "12345" }), (e: unknown) => e instanceof ApiError && e.code === "PAYOUT_DETAILS_INVALID");
  });
  test("minimum payout is KES 30 and statuses map onto hotel_payouts.status", () => {
    assert.equal(CYZORA_PAYOUT_MIN_CENTS, 3000);
    assert.equal(mapCyzoraPayoutStatus("requested"), "processing");
    assert.equal(mapCyzoraPayoutStatus("processing"), "processing");
    assert.equal(mapCyzoraPayoutStatus("paid"), "successful");
    assert.equal(mapCyzoraPayoutStatus("failed"), "failed");
  });
});
