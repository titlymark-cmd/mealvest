/**
 * Business-day helpers (finding L9).
 *
 * Daily allowances, rollovers and "has the plan ended?" checks must
 * follow the CAMPUS day (Africa/Nairobi by default), not whatever
 * timezone the database or the serverless host happens to run in
 * (Supabase and Vercel both run in UTC, so the old CURRENT_DATE-based
 * day boundary was 03:00 Nairobi time).
 *
 * Kenya has no DST, but the helpers use Intl with an IANA zone so a
 * different BUSINESS_TIMEZONE would also be handled correctly.
 */

export const DEFAULT_BUSINESS_TIMEZONE = "Africa/Nairobi";

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function zone(): string {
  const tz = process.env.BUSINESS_TIMEZONE || DEFAULT_BUSINESS_TIMEZONE;
  return isValidTimeZone(tz) ? tz : DEFAULT_BUSINESS_TIMEZONE;
}

/** The calendar date (YYYY-MM-DD) of instant `at` in the business timezone. */
export function businessDate(at: Date = new Date(), timeZone: string = zone()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/**
 * Normalizes a DATE column value to "YYYY-MM-DD". node-postgres parses
 * DATE columns into a JS Date at LOCAL midnight of the Node process, so
 * the local calendar components (not toISOString, which converts to
 * UTC and can shift the day) are the faithful representation.
 */
export function dateOnly(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole days from date string `a` to date string `b` (both YYYY-MM-DD). */
export function daysBetweenDates(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/** YYYY-MM-DD `n` days after `date` (calendar arithmetic, timezone-free). */
export function addDays(date: string, n: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + n * 24 * 60 * 60 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

/** The wall-clock time ("HH:MM", 24h) of instant `at` in the business timezone. */
export function businessTimeOfDay(at: Date = new Date(), timeZone: string = zone()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hh === "24" ? "00" : hh}:${mm}`;
}
