/**
 * Normalizes Kenyan phone numbers to a consistent 254XXXXXXXXX form
 * for storage and uniqueness checks. Same rules as MEALVEST's M-Pesa
 * integration elsewhere in the project, so a student's stored
 * identifier and their M-Pesa-facing number are always the same
 * canonical value.
 */
export function normalizeKenyanPhone(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");

  let normalized: string | null = null;
  if (/^0[71]\d{8}$/.test(digits)) {
    normalized = "254" + digits.slice(1);
  } else if (/^254[71]\d{8}$/.test(digits)) {
    normalized = digits;
  } else if (/^[71]\d{8}$/.test(digits)) {
    normalized = "254" + digits;
  }

  if (!normalized || !/^254[71]\d{8}$/.test(normalized)) return null;
  return normalized;
}
