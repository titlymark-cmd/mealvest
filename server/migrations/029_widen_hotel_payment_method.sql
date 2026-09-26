-- 029: widen hotels.payment_method to the full 5-method settlement
-- schema (server/src/schemas/settlementMethodSchema.ts).
--
-- Previously the CHECK constraint only allowed 'bank', 'mpesa_till',
-- 'mpesa_pochi' — but the public hotel self-registration form (and
-- its Zod schema) has always offered 5 methods, including 'paybill',
-- 'send_money' and 'pochi_la_biashara'. A hotel picking any of those
-- three would fail at INSERT with a constraint violation; this was a
-- real latent bug, not a deliberate restriction.
--
-- 'mpesa_pochi' (the old admin-only createHotel schema's name for
-- essentially the same real payment method) is renamed to
-- 'pochi_la_biashara' so both hotel-creation paths — self-registration
-- and admin.createHotel — agree on one name. Any existing row using
-- the old value is migrated; its payment_details JSON keeps its old
-- shape (phoneNumber/ownerName) since that was all admin.createHotel
-- ever collected for it — there is no lossless way to backfill the
-- extra field the public schema's shape has (registeredName).
UPDATE hotels SET payment_method = 'pochi_la_biashara' WHERE payment_method = 'mpesa_pochi';

ALTER TABLE hotels DROP CONSTRAINT hotels_payment_method_check;
ALTER TABLE hotels ADD CONSTRAINT hotels_payment_method_check
  CHECK (payment_method = ANY (ARRAY['mpesa_till', 'paybill', 'send_money', 'pochi_la_biashara', 'bank']));
