import { formatPayoutTime12, isValidPayoutTime, payoutConfigPayload, payoutScheduleLabel } from "./payoutMode";

describe("payoutMode helpers", () => {
  test("time validation matches the server (HH:MM 24h)", () => {
    for (const ok of ["00:00", "09:05", "21:00", "23:59"]) expect(isValidPayoutTime(ok)).toBe(true);
    for (const bad of ["", "24:00", "21:60", "9:00", "21:00:00", null, undefined]) expect(isValidPayoutTime(bad as any)).toBe(false);
  });
  test("12-hour display is pure string maths (no timezone shift)", () => {
    expect(formatPayoutTime12("21:00")).toBe("9:00 PM");
    expect(formatPayoutTime12("00:30")).toBe("12:30 AM");
    expect(formatPayoutTime12("12:00")).toBe("12:00 PM");
    expect(formatPayoutTime12("")).toBe("—");
  });
  test("payout configuration always selects daily settlement", () => {
    expect(payoutConfigPayload("21:00")).toEqual({ mode: "daily", payoutTime: "21:00" });
  });
  test("schedule label uses the server time and falls back to legacy text", () => {
    expect(payoutScheduleLabel({ payout_mode: "daily", payout_time: "21:00" })).toBe("Daily at 9:00 PM (EAT)");
    expect(payoutScheduleLabel({ settlement_schedule: "Daily at 12:00 PM" })).toBe("Daily at 12:00 PM");
  });
});
