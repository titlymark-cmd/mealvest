import type { HotelDashboard, HotelProfileUpdate } from "../../../services/hotelStaffApi";

/**
 * Pure logic for the hotel Profile page — no React, no network — so the
 * rules that decide what gets sent to PATCH /api/hotel/location can be
 * unit-tested.
 *
 * Source of truth for limits: server/src/schemas/hotelLocationSchema.ts
 * (updateHotelLocationSchema) — keep LIMITS in sync with it.
 */
export type HotelRecord = HotelDashboard["hotel"];

export const LIMITS = {
  description: 500,
  address: 300,
  helpline: 20,
  openingHours: 200,
  serviceLength: 60,
  services: 20,
  imageUrl: 2000,
} as const;

/** The eight fields PATCH /api/hotel/location accepts, in form shape (all strings except services). */
export interface ProfileForm {
  imageUrl: string;
  description: string;
  services: string[];
  helpline: string;
  openingHours: string;
  address: string;
  latitude: string;
  longitude: string;
}
export type FieldKey = keyof ProfileForm;
export type FieldErrors = Partial<Record<FieldKey, string>>;

export function formFromHotel(h: HotelRecord): ProfileForm {
  return {
    imageUrl: h.image_url ?? "",
    description: h.description ?? "",
    services: [...(h.services ?? [])],
    helpline: h.helpline ?? "",
    openingHours: h.opening_hours ?? "",
    address: h.address ?? "",
    latitude: h.latitude == null ? "" : String(h.latitude),
    longitude: h.longitude == null ? "" : String(h.longitude),
  };
}

const FIELD_KEYS: FieldKey[] = ["imageUrl", "description", "services", "helpline", "openingHours", "address", "latitude", "longitude"];

/** Empty string -> null, otherwise the parsed number (NaN when not numeric). */
export function parseCoord(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  return Number(t);
}

function sameCoord(a: string, b: string): boolean {
  const pa = parseCoord(a);
  const pb = parseCoord(b);
  if (pa === null || pb === null) return pa === pb;
  return pa === pb;
}

function sameServices(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) => s.trim() === b[i].trim());
}

/** Which fields differ from the saved baseline. Whitespace-only edits don't count (the server trims). */
export function changedFields(base: ProfileForm, cur: ProfileForm): FieldKey[] {
  return FIELD_KEYS.filter((k) => {
    if (k === "services") return !sameServices(base.services, cur.services);
    if (k === "latitude" || k === "longitude") return !sameCoord(base[k], cur[k]);
    return base[k].trim() !== cur[k].trim();
  });
}

const PHONE_CHARS = /^\+?[\d\s()-]+$/;

function isValidHelpline(v: string): boolean {
  if (!PHONE_CHARS.test(v)) return false;
  const digits = v.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15;
}

function isHttpsUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}

/**
 * Validates ONLY the fields the owner changed. A legacy value already on
 * file (e.g. a helpline saved before this form existed) must never block
 * saving an unrelated edit.
 */
export function validate(base: ProfileForm, cur: ProfileForm): FieldErrors {
  const errors: FieldErrors = {};
  const changed = new Set(changedFields(base, cur));

  if (changed.has("description") && cur.description.trim().length > LIMITS.description) {
    errors.description = `Keep the description under ${LIMITS.description} characters.`;
  }
  if (changed.has("address") && cur.address.trim().length > LIMITS.address) {
    errors.address = `Keep the address under ${LIMITS.address} characters.`;
  }
  if (changed.has("openingHours") && cur.openingHours.trim().length > LIMITS.openingHours) {
    errors.openingHours = `Keep opening hours under ${LIMITS.openingHours} characters.`;
  }
  if (changed.has("helpline")) {
    const v = cur.helpline.trim();
    if (v.length > LIMITS.helpline) errors.helpline = `A phone number can't be longer than ${LIMITS.helpline} characters.`;
    else if (v !== "" && !isValidHelpline(v)) errors.helpline = "Enter a phone number, e.g. 0712 345 678 or +254 712 345 678.";
  }
  if (changed.has("services")) {
    if (cur.services.length > LIMITS.services) errors.services = `You can list up to ${LIMITS.services} services.`;
    else if (cur.services.some((s) => s.trim().length > LIMITS.serviceLength)) {
      errors.services = `Each service must be under ${LIMITS.serviceLength} characters.`;
    }
  }
  if (changed.has("imageUrl")) {
    const v = cur.imageUrl.trim();
    if (v === "") errors.imageUrl = "A cover photo can't be removed once set — upload a new one, or discard this change.";
    else if (v.length > LIMITS.imageUrl || !isHttpsUrl(v)) errors.imageUrl = "Enter a valid https:// image link.";
  }

  // Coordinates: the backend can't clear them (COALESCE) and the nearby-hotel
  // search needs BOTH, so a change to either one requires a valid pair.
  if (changed.has("latitude") || changed.has("longitude")) {
    const lat = parseCoord(cur.latitude);
    const lng = parseCoord(cur.longitude);
    const hadCoords = base.latitude !== "" || base.longitude !== "";
    if (lat === null && lng === null && hadCoords) {
      errors.latitude = "Coordinates can't be cleared — enter new values, or discard this change.";
    } else {
      if (lat === null) errors.latitude = "Enter a latitude to go with the longitude.";
      else if (!Number.isFinite(lat)) errors.latitude = "Latitude must be a number.";
      else if (lat < -90 || lat > 90) errors.latitude = "Latitude must be between -90 and 90.";
      if (lng === null) errors.longitude = "Enter a longitude to go with the latitude.";
      else if (!Number.isFinite(lng)) errors.longitude = "Longitude must be a number.";
      else if (lng < -180 || lng > 180) errors.longitude = "Longitude must be between -180 and 180.";
    }
  }
  return errors;
}

/** Builds the PATCH body from changed fields only (an empty body is rejected by the backend). */
export function buildUpdate(base: ProfileForm, cur: ProfileForm): HotelProfileUpdate {
  const changed = new Set(changedFields(base, cur));
  const out: HotelProfileUpdate = {};
  if (changed.has("imageUrl")) out.imageUrl = cur.imageUrl.trim();
  if (changed.has("description")) out.description = cur.description.trim();
  if (changed.has("address")) out.address = cur.address.trim();
  if (changed.has("helpline")) out.helpline = cur.helpline.trim();
  if (changed.has("openingHours")) out.openingHours = cur.openingHours.trim();
  if (changed.has("services")) out.services = cur.services.map((s) => s.trim());
  if (changed.has("latitude") || changed.has("longitude")) {
    out.latitude = Number(cur.latitude.trim());
    out.longitude = Number(cur.longitude.trim());
  }
  return out;
}

/** Order in which errors are focused/announced. */
export const FIELD_ORDER: FieldKey[] = ["description", "services", "helpline", "openingHours", "address", "latitude", "longitude", "imageUrl"];

/** DOM id for each editable control — also used by the "complete your listing" shortcuts. */
export const FIELD_IDS: Record<FieldKey, string> = {
  imageUrl: "hp-image-url",
  description: "hp-description",
  services: "hp-services",
  helpline: "hp-helpline",
  openingHours: "hp-opening-hours",
  address: "hp-address",
  latitude: "hp-latitude",
  longitude: "hp-longitude",
};

// ---------------------------------------------------------------------------
// Derived display values (all computed from real fields — nothing invented)
// ---------------------------------------------------------------------------

export interface CompletenessItem {
  key: string;
  label: string;
  cta: string;
  done: boolean;
  field: FieldKey | "cover";
}

/** What students can currently see on the hotel's public page, based on SAVED values. */
export function listingCompleteness(h: HotelRecord): { items: CompletenessItem[]; done: number; total: number } {
  const filled = (v: string | null | undefined) => Boolean(v && v.trim());
  const items: CompletenessItem[] = [
    { key: "cover", label: "Cover photo", cta: "Add a cover photo", done: filled(h.image_url), field: "cover" },
    { key: "description", label: "Description", cta: "Add a description", done: filled(h.description), field: "description" },
    { key: "services", label: "Services", cta: "List your services", done: (h.services ?? []).length > 0, field: "services" },
    { key: "hours", label: "Opening hours", cta: "Add opening hours", done: filled(h.opening_hours), field: "openingHours" },
    { key: "helpline", label: "Helpline", cta: "Add a helpline", done: filled(h.helpline), field: "helpline" },
    { key: "address", label: "Address", cta: "Add your address", done: filled(h.address), field: "address" },
    { key: "pin", label: "Map pin", cta: "Pin your location", done: h.latitude != null && h.longitude != null, field: "latitude" },
  ];
  return { items, done: items.filter((i) => i.done).length, total: items.length };
}

export type Tone = "success" | "warning" | "danger" | "neutral";

export function accountStatusMeta(status: string): { label: string; tone: Tone } {
  switch (status) {
    case "active":
      return { label: "Active", tone: "success" };
    case "pending_verification":
      return { label: "Pending verification", tone: "warning" };
    case "suspended":
      return { label: "Suspended", tone: "danger" };
    case "expired":
      return { label: "Contract expired", tone: "danger" };
    default:
      return { label: humanize(status), tone: "neutral" };
  }
}

export function settlementVerificationMeta(status: string | null | undefined): { label: string; tone: Tone } | null {
  switch (status) {
    case "verified":
      return { label: "Verified", tone: "success" };
    case "pending":
      return { label: "Pending verification", tone: "warning" };
    case "requires_correction":
      return { label: "Needs correction", tone: "warning" };
    case "rejected":
      return { label: "Rejected", tone: "danger" };
    default:
      return null;
  }
}

export function humanize(raw: string): string {
  const s = raw.replace(/_/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  mpesa_till: "M-Pesa Till",
  paybill: "PayBill",
  send_money: "M-Pesa (Send Money)",
  pochi_la_biashara: "Pochi la Biashara",
  bank: "Bank account",
};

/** "•••• 1234" — keeps only the last four digits/characters. */
export function maskTail(value: string): string {
  const v = value.replace(/\s+/g, "");
  if (v.length <= 4) return "••••";
  return `•••• ${v.slice(-4)}`;
}

export interface SummaryLine {
  label: string;
  value: string;
}

function str(d: Record<string, unknown>, key: string): string {
  const v = d[key];
  return typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
}

/**
 * A safe, human summary of payment_details for the OWNER'S OWN settlement
 * destination. Account and phone numbers are masked to their last four
 * characters; the registered-phone/ID fields and anything not listed here
 * are never rendered (no raw JSON dump).
 */
export function paymentSummary(method: string | null | undefined, details: Record<string, unknown> | null | undefined): SummaryLine[] {
  if (!method || !details) return [];
  const lines: SummaryLine[] = [];
  const add = (label: string, value: string, mask = false) => {
    if (value) lines.push({ label, value: mask ? maskTail(value) : value });
  };
  switch (method) {
    case "mpesa_till":
      add("Till number", str(details, "tillNumber"));
      add("Till name", str(details, "tillName"));
      break;
    case "paybill":
      add("PayBill number", str(details, "paybillNumber"));
      add("Account number", str(details, "accountNumber"), true);
      add("Business name", str(details, "paybillBusinessName"));
      break;
    case "send_money":
      add("Phone number", str(details, "phoneNumber"), true);
      add("Account holder", str(details, "accountHolderName"));
      break;
    case "pochi_la_biashara":
      add("Pochi number", str(details, "pochiPhoneNumber"), true);
      add("Business name", str(details, "businessAccountName"));
      break;
    case "bank":
      add("Bank", str(details, "bankName"));
      add("Account name", str(details, "accountName"));
      add("Account number", str(details, "accountNumber"), true);
      add("Branch", str(details, "branch"));
      break;
  }
  return lines;
}

export function formatKsh(amount: string | number | null | undefined): string {
  const n = Number(amount);
  return Number.isFinite(n) ? `KSh ${n.toLocaleString()}` : "—";
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

/** "Near X, Town, County" from the structured registration fields. */
export function registeredArea(h: HotelRecord): string {
  return [h.landmark, h.town, h.county]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

/** Normalises a tag for duplicate detection. */
export function tagKey(tag: string): string {
  return tag.trim().toLowerCase();
}
