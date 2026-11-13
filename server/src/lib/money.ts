/**
 * Exact money arithmetic for NUMERIC(10,2) columns.
 *
 * pg returns NUMERIC as a string ("1234.50"). Every amount is converted to an
 * INTEGER number of cents before any addition/subtraction/comparison, so no
 * floating-point error can accumulate (0.1 + 0.2 style drift). Amounts handed
 * back to SQL are formatted with exactly two decimals, and the database does the
 * final arithmetic on NUMERIC.
 */

export function toCents(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) throw new Error(`Invalid money value: ${String(value)}`);
  return Math.round(n * 100);
}

/** Cents -> a decimal string with exactly two places, safe to bind to a NUMERIC parameter. */
export function centsToStr(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error(`Cents must be an integer, got ${cents}`);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Cents -> number for JSON responses (display only; exact to two decimals). */
export function centsToNumber(cents: number): number {
  return cents / 100;
}
