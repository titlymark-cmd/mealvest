/**
 * Loaded via `--import` ahead of every test file (see package.json
 * "test"). Supplies throwaway values for the env vars config/env.ts
 * insists on at import time, so `npm test` runs with no .env present
 * — in CI, a fresh clone, or a sandbox with no database. Every value
 * is only set when NOT already provided, so a real .env or a CI secret
 * still wins. None of these are real credentials: the unit tests never
 * open a DB connection or call a provider, they only exercise pure
 * logic (signature maths, validation, mapping).
 */
process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/mealvest_test";
process.env.JWT_ACCESS_SECRET ||= "test-only-jwt-secret";
process.env.QR_SIGNING_SECRET ||= "test-only-qr-secret";
process.env.PAYSTACK_SECRET_KEY ||= "sk_test_fake_secret_for_tests";
process.env.CYZORA_SECRET_KEY ||= "sk_test_fake_cyzora_secret_for_tests";
process.env.CYZORA_WEBHOOK_SECRET ||= "whsec_test_secret_for_unit_tests";
