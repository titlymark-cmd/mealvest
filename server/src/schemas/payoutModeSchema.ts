import { z } from "zod";

/**
 * Payout-mode configuration shared by hotel registration and the admin
 * payout-settings endpoint. Daily is the only supported mode. The fixed
 * 10% payout fee is not configurable through this schema.
 *
 * payoutTime is a wall-clock "HH:MM" (24h) in the business timezone
 * (Africa/Nairobi); seconds are not accepted.
 */
export const PAYOUT_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const payoutTimeSchema = z.string().trim().regex(PAYOUT_TIME_PATTERN, "Enter a valid payout time (HH:MM, 24-hour).");

export const payoutConfigSchema = z
  .object({
    mode: z.literal("daily", { errorMap: () => ({ message: "Only daily payouts are supported." }) }),
    payoutTime: payoutTimeSchema.optional().nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.mode === "daily" && !v.payoutTime) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["payoutTime"], message: "Choose the time your daily payout should run." });
    }
  })
  .transform((v) => ({ mode: v.mode, payoutTime: v.payoutTime as string }));

export type PayoutConfigInput = z.infer<typeof payoutConfigSchema>;

/** pg returns TIME as "HH:MM:SS"; the API speaks "HH:MM". */
export function formatPayoutTime(value: string | null | undefined): string | null {
  if (!value) return null;
  return String(value).slice(0, 5);
}
