import { z } from "zod";

/**
 * All 5 settlement options from the spec, as a discriminated union —
 * each variant only requires the fields that actually apply to it,
 * and the `method` discriminator is what both registration and later
 * "update my settlement details" validate against, in one place.
 */
export const settlementMethodSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("mpesa_till"),
    tillNumber: z.string().trim().min(1),
    tillName: z.string().trim().min(1),
    registeredPhoneNumber: z.string().trim().min(9),
  }),
  z.object({
    method: z.literal("paybill"),
    paybillNumber: z.string().trim().min(1),
    accountNumber: z.string().trim().min(1),
    paybillBusinessName: z.string().trim().min(1),
    registeredPhoneNumber: z.string().trim().min(9),
  }),
  z.object({
    method: z.literal("send_money"),
    phoneNumber: z.string().trim().min(9),
    accountHolderName: z.string().trim().min(1),
    // No separate "confirm" flag stored — the warning that this
    // number must belong to the authorized business/account holder
    // is a frontend-displayed notice; the actual safeguard is that
    // this method's settlement stays payment_verification_status =
    // 'pending' until an admin manually checks it (see migration 022
    // and hotelApplicationService.verifyPaymentDetails).
  }),
  z.object({
    method: z.literal("pochi_la_biashara"),
    pochiPhoneNumber: z.string().trim().min(9),
    businessAccountName: z.string().trim().min(1),
    registeredName: z.string().trim().min(1),
  }),
  z.object({
    method: z.literal("bank"),
    bankName: z.string().trim().min(1),
    accountName: z.string().trim().min(1),
    accountNumber: z.string().trim().min(1),
    branch: z.string().trim().min(1).optional(),
    branchCode: z.string().trim().max(20).optional(),
  }),
]);

export type SettlementMethodInput = z.infer<typeof settlementMethodSchema>;
