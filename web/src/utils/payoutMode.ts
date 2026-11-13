/**
 * Hotel payout schedule display helpers. The BACKEND is authoritative for
 * the payout time; nothing here decides how money moves. The fixed fee and KSh 40
 * minimum are shown on the onboarding screen only as information and
 * mirror server/src/lib/hotelCommission.ts and AUTO_PAYOUT_THRESHOLD_KES.
 */
export type PayoutMode = "daily";

export const MIN_PAYOUT_KES = 40;
export const PAYOUT_FEE_PERCENT = 10;
export const PAYOUT_TIMEZONE_LABEL = "East Africa Time (Nairobi)";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** `<input type="time">` always yields 24-hour "HH:MM" regardless of locale, which is exactly what the API takes. */
export function isValidPayoutTime(v: string | null | undefined): v is string {
  return typeof v === "string" && TIME_RE.test(v);
}

/** "21:00" -> "9:00 PM". Pure string maths: no Date, so no timezone shift is possible. */
export function formatPayoutTime12(v: string | null | undefined): string {
  if (!isValidPayoutTime(v)) return "—";
  const [h, m] = v.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function payoutConfigPayload(time: string): { mode: PayoutMode; payoutTime: string } {
  return { mode: "daily", payoutTime: time };
}

/** Human label for a hotel's payout schedule; falls back to its legacy plan text. */
export function payoutScheduleLabel(h: { payout_mode?: PayoutMode | null; payout_time?: string | null; settlement_schedule?: string | null }): string {
  if (h.payout_mode === "daily") return `Daily at ${formatPayoutTime12(h.payout_time)} (EAT)`;
  return h.settlement_schedule || "—";
}
