import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { generatePaymentReference } from "../src/services/paymentService";
import { PaystackPaymentProvider } from "../src/services/paystackProvider";
import { initializeSchema } from "../src/controllers/payments.controller";

/**
 * Deliberately scoped to logic that doesn't need a live Paystack call
 * or a real Postgres connection — neither is available in every CI/
 * sandbox environment. The network- and DB-dependent paths
 * (initialize against real Paystack, activatePaymentIfNeeded against
 * a real transactions row, the full webhook-to-budget-creation
 * flow) need an integration test run against Paystack's TEST mode
 * and a real database — see TESTING.md "Paystack integration test
 * checklist" for the manual/CI steps to exercise those.
 */

describe("generatePaymentReference", () => {
  test("has the expected MV- prefix", () => {
    const ref = generatePaymentReference();
    assert.match(ref, /^MV-\d+-[a-f0-9]{8}$/);
  });

  test("generates unique references across many calls", () => {
    const refs = new Set(Array.from({ length: 500 }, () => generatePaymentReference()));
    assert.equal(refs.size, 500);
  });
});

describe("PaystackPaymentProvider.handleWebhook signature verification", () => {
  const provider = new PaystackPaymentProvider();
  const originalSecret = process.env.PAYSTACK_SECRET_KEY;

  test("rejects a missing signature header", async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_fake_secret_for_tests";
    const body = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference: "MV-123" } }));
    await assert.rejects(
      () => provider.handleWebhook(body, undefined),
      /signature/i
    );
  });

  test("rejects a signature computed with the wrong secret", async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_fake_secret_for_tests";
    const body = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference: "MV-123" } }));
    const wrongSignature = crypto.createHmac("sha512", "sk_test_a_completely_different_secret").update(body).digest("hex");
    await assert.rejects(
      () => provider.handleWebhook(body, wrongSignature),
      /signature/i
    );
  });

  test("accepts a correctly signed payload and proceeds to (network-dependent) verification", async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_fake_secret_for_tests";
    const body = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference: "MV-does-not-exist" } }));
    const validSignature = crypto.createHmac("sha512", "sk_test_fake_secret_for_tests").update(body).digest("hex");

    // Signature check passes here (that's what this test proves) —
    // it then tries to call Paystack's real API to independently
    // verify the transaction, which has no network access in this
    // environment and is expected to fail for that unrelated reason.
    // A PAYSTACK_VERIFY_FAILED/network error here is a PASS for what
    // this specific test is checking (signature acceptance); an
    // "signature" match would be a FAIL.
    await assert.rejects(
      () => provider.handleWebhook(body, validSignature),
      (err: unknown) => !(err instanceof Error && /signature/i.test(err.message))
    );
  });

  test.after(() => {
    if (originalSecret === undefined) delete process.env.PAYSTACK_SECRET_KEY;
    else process.env.PAYSTACK_SECRET_KEY = originalSecret;
  });
});

describe("initializeSchema validation boundaries", () => {
  test("accepts a valid request", () => {
    const result = initializeSchema.safeParse({
      amount: 5000,
      numberOfDays: 30,
      phone: "0712345678",
      email: "student@example.com",
    });
    assert.equal(result.success, true);
  });

  test("rejects an amount below the minimum", () => {
    const result = initializeSchema.safeParse({ amount: 100, numberOfDays: 30, phone: "0712345678", email: "a@b.com" });
    assert.equal(result.success, false);
  });

  test("rejects an amount above the maximum", () => {
    const result = initializeSchema.safeParse({ amount: 999999, numberOfDays: 30, phone: "0712345678", email: "a@b.com" });
    assert.equal(result.success, false);
  });

  test("rejects an invalid email", () => {
    const result = initializeSchema.safeParse({ amount: 5000, numberOfDays: 30, phone: "0712345678", email: "not-an-email" });
    assert.equal(result.success, false);
  });

  test("rejects zero or negative days", () => {
    const result = initializeSchema.safeParse({ amount: 5000, numberOfDays: 0, phone: "0712345678", email: "a@b.com" });
    assert.equal(result.success, false);
  });

  test("rejects more than 90 days", () => {
    const result = initializeSchema.safeParse({ amount: 5000, numberOfDays: 91, phone: "0712345678", email: "a@b.com" });
    assert.equal(result.success, false);
  });
});
