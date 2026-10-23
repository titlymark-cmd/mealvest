import { test } from "node:test";
import assert from "node:assert/strict";
import { toHotelOrderView } from "../src/lib/hotelOrderView";

// A full orders row as SELECT * returns it today, including every column a
// hotel must never receive.
const fullRow = {
  id: "ord-1",
  user_id: "user-secret",
  hotel_id: "hotel-1",
  items: [{ itemId: "m1", name: "Pilau", unitPrice: 150, quantity: 2 }],
  amount: "300.00",
  payment_transaction_id: "txn-secret",
  status: "ready",
  redeemed: false,
  redeemed_at: null,
  redeemed_by_hotel_user_id: "staff-secret",
  created_at: "2026-10-20T08:00:00.000Z",
  updated_at: "2026-10-20T08:05:00.000Z",
  qr_token: "qr-secret",
  commission_amount: "30.00",
  hotel_amount: "270.00",
  idempotency_key: "idem-secret",
  payout_id: "payout-secret",
  student_name: "Amina Wanjiru",
};

test("toHotelOrderView exposes the hotel's own net and operational fields", () => {
  const v = toHotelOrderView(fullRow);
  assert.equal(v.id, "ord-1");
  assert.equal(v.status, "ready");
  assert.equal(v.amount, "300.00");
  assert.equal(v.hotel_amount, "270.00");
  assert.equal(v.student_name, "Amina Wanjiru");
  assert.deepEqual(v.items, fullRow.items);
});

test("toHotelOrderView never leaks commission, QR, payment, payout or identity columns", () => {
  const v = toHotelOrderView(fullRow) as Record<string, unknown>;
  for (const forbidden of [
    "commission_amount",
    "qr_token",
    "idempotency_key",
    "payment_transaction_id",
    "payout_id",
    "user_id",
    "hotel_id",
    "redeemed_by_hotel_user_id",
  ]) {
    assert.equal(forbidden in v, false, `${forbidden} must not be exposed to a hotel`);
  }
  assert.equal(JSON.stringify(v).includes("secret"), false);
});

test("toHotelOrderView ignores columns added by future migrations (allow-list, not deny-list)", () => {
  const v = toHotelOrderView({ ...fullRow, some_future_internal_column: "leak-me" }) as Record<string, unknown>;
  assert.equal("some_future_internal_column" in v, false);
});

test("toHotelOrderView omits student_name when the row has none (QR verify/redeem paths)", () => {
  const { student_name, ...noStudent } = fullRow;
  assert.equal("student_name" in toHotelOrderView(noStudent), false);
});

test("toHotelOrderView tolerates a missing items payload and null settlement amount", () => {
  const v = toHotelOrderView({ ...fullRow, items: null, hotel_amount: undefined });
  assert.deepEqual(v.items, []);
  assert.equal(v.hotel_amount, null);
});
