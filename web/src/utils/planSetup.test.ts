import { computeDailyAllowance, isValidKenyanPhone, validatePlan, PlanLimits } from "./planSetup";

const limits: PlanLimits = { minAmount: 500, maxAmount: 50000, minDays: 1, maxDays: 90 };
const ok = { amount: "5000", days: "30", phone: "0712345678", termsAccepted: true, email: "a@b.co", limits };

describe("isValidKenyanPhone", () => {
  test.each(["0712345678", "0112345678", "254712345678", "+254 712 345 678", "712345678", "0712 345 678"])("accepts %s", (p) => {
    expect(isValidKenyanPhone(p)).toBe(true);
  });
  test.each(["", "923456789", "0212345678", "07123456", "25471234567", "abcdefghij"])("rejects %s", (p) => {
    expect(isValidKenyanPhone(p)).toBe(false);
  });
});

describe("computeDailyAllowance (mirrors server rounding)", () => {
  test("rounds to cents", () => expect(computeDailyAllowance(5000, 30)).toBe(166.67));
  test("exact division", () => expect(computeDailyAllowance(3000, 30)).toBe(100));
  test("null for unusable input", () => {
    expect(computeDailyAllowance(0, 30)).toBeNull();
    expect(computeDailyAllowance(5000, 0)).toBeNull();
    expect(computeDailyAllowance(NaN, 5)).toBeNull();
  });
});

describe("validatePlan", () => {
  test("valid input yields numeric values and no errors", () => {
    const r = validatePlan(ok);
    expect(r.errors).toEqual({});
    expect(r.values).toEqual({ totalAmount: 5000, numberOfDays: 30, phone: "0712345678", email: "a@b.co" });
  });
  test("terms must be accepted", () => {
    const r = validatePlan({ ...ok, termsAccepted: false });
    expect(r.values).toBeNull();
    expect(r.errors.terms).toMatch(/accept/i);
  });
  test("enforces the server limits it is given", () => {
    expect(validatePlan({ ...ok, amount: "499" }).errors.amount).toMatch(/Minimum plan amount is KSh 500/);
    expect(validatePlan({ ...ok, amount: "50001" }).errors.amount).toMatch(/Maximum plan amount is KSh 50,000/);
    expect(validatePlan({ ...ok, days: "91" }).errors.days).toMatch(/exceed 90/);
    expect(validatePlan({ ...ok, days: "0" }).errors.days).toMatch(/1 to 90/);
    expect(validatePlan({ ...ok, days: "2.5" }).errors.days).toMatch(/whole number/);
  });
  test("without limits (older server) only the basic checks apply", () => {
    expect(validatePlan({ ...ok, limits: null, amount: "100" }).errors).toEqual({});
    expect(validatePlan({ ...ok, limits: null, amount: "0" }).errors.amount).toBeDefined();
  });
  test("bad phone and missing email are reported", () => {
    const r = validatePlan({ ...ok, phone: "12345", email: null });
    expect(r.errors.phone).toBeDefined();
    expect(r.errors.email).toBeDefined();
  });
});
