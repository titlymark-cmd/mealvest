/**
 * Pure helpers for the "Set up your plan" screen. Nothing here talks to the
 * network or decides business rules: it mirrors, for early feedback, rules the
 * server enforces authoritatively (server/src/controllers/payments.controller.ts
 * initializeSchema, lib/phone.ts, services/budgetService.ts). The server still
 * re-validates every request, so a drift here can only cost a clearer message,
 * never a wrong charge. Numeric limits come from GET /api/payments/config.
 */

export interface PlanLimits {
  minAmount: number;
  maxAmount: number;
  minDays: number;
  maxDays: number;
}

/** Same shapes server/src/lib/phone.ts accepts: 07/01xxxxxxxx, 254 7/1xxxxxxxx, or 7/1xxxxxxxx. */
export function isValidKenyanPhone(raw: string): boolean {
  const digits = raw.replace(/[^\d]/g, "");
  return /^0[71]\d{8}$/.test(digits) || /^254[71]\d{8}$/.test(digits) || /^[71]\d{8}$/.test(digits);
}

/** Matches budgetService.computeDailyAllowance: total / days, rounded to cents. */
export function computeDailyAllowance(total: number, days: number): number | null {
  if (!Number.isFinite(total) || !Number.isFinite(days) || total <= 0 || days <= 0) return null;
  return Math.round((total / days) * 100) / 100;
}

export type PlanField = "amount" | "days" | "phone" | "terms" | "email";
export type PlanErrors = Partial<Record<PlanField, string>>;

export interface PlanInput {
  amount: string;
  days: string;
  phone: string;
  termsAccepted: boolean;
  email: string | null | undefined;
  limits?: PlanLimits | null;
}

export interface PlanValues {
  totalAmount: number;
  numberOfDays: number;
  phone: string;
  email: string;
}

const ksh = (n: number) => `KSh ${n.toLocaleString("en-KE")}`;

/**
 * Field order matters: it is the order focus moves to the first problem.
 * Wording for amount/phone follows the server's own messages.
 */
export const PLAN_FIELD_ORDER: PlanField[] = ["amount", "days", "phone", "terms", "email"];

export function validatePlan(input: PlanInput): { errors: PlanErrors; values: PlanValues | null } {
  const errors: PlanErrors = {};
  const { limits } = input;
  const totalAmount = Number(input.amount);
  const numberOfDays = Number(input.days);

  if (!input.amount.trim() || !Number.isFinite(totalAmount) || totalAmount <= 0) {
    errors.amount = "Enter an amount greater than zero.";
  } else if (limits && totalAmount < limits.minAmount) {
    errors.amount = `Minimum plan amount is ${ksh(limits.minAmount)}.`;
  } else if (limits && totalAmount > limits.maxAmount) {
    errors.amount = `Maximum plan amount is ${ksh(limits.maxAmount)}.`;
  }

  const minDays = limits?.minDays ?? 1;
  if (!input.days.trim() || !Number.isInteger(numberOfDays) || numberOfDays < minDays) {
    errors.days = limits ? `Enter a whole number of days from ${minDays} to ${limits.maxDays}.` : "Enter at least 1 day.";
  } else if (limits && numberOfDays > limits.maxDays) {
    errors.days = `Plans can't exceed ${limits.maxDays} days.`;
  }

  if (!isValidKenyanPhone(input.phone)) errors.phone = "Enter a valid Kenyan M-Pesa number, e.g. 0712 345 678.";
  if (!input.termsAccepted) errors.terms = "Please accept the Mealvest payment terms to continue.";
  if (!input.email) errors.email = "Your account has no email on file — please contact support.";

  if (Object.keys(errors).length > 0) return { errors, values: null };
  return { errors, values: { totalAmount, numberOfDays, phone: input.phone.trim(), email: input.email as string } };
}
