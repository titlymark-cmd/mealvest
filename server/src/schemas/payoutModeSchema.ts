import { z } from "zod";

/**
 * Payout-mode configuration shared by hotel registration and the admin
 * payout-settings endpoint. Deliberately contains NO commission field:
 * a hotel can never supply its own rate (the backend derives it from the
 * mode, plus any admin override).
 *
 * payoutTime is a wall-clock "HH:MM" (24h) in the business timezone
 * (Africa/Nairobi); seconds are not accepted.
 */
export const PAYOUT_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const payoutTimeSchema = z.string().trim().regex(PAYOUT_TIME_PATTERN, "Enter a valid payout time (HH:MM, 24-hour).");

export const payoutConfigSchema = z
  .object({
    mode: z.enum(["instant", "daily"], { errorMap: () => ({ message: "Payout mode must be 'instant' or 'daily'." }) }),
    payoutTime: payoutTimeSchema.optional().nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.mode === "daily" && !v.payoutTime) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["payoutTime"], message: "Choose the time your daily payout should run." });
    }
  })
  .transform((v) => ({ mode: v.mode, payoutTime: v.mode === "daily" ? (v.payoutTime as string) : null }));

export type PayoutConfigInput = z.infer<typeof payoutConfigSchema>;

/** pg returns TIME as "HH:MM:SS"; the API speaks "HH:MM". */
export function formatPayoutTime(value: string | null | undefined): string | null {
  if (!value) return null;
  return String(value).slice(0, 5);
}
