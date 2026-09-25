import { API_BASE_URL } from "./config";

export type Role = "student" | "hotel_staff" | "hotel_owner" | "mealvest_admin";

export interface AuthUser {
  id: string;
  role: Role;
  fullName: string;
  email: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function parseErrorOrThrow(res: Response): Promise<never> {
  let body: { error?: { code?: string; message?: string } } = {};
  try {
    body = await res.json();
  } catch {
    // non-JSON error body — fall through to generic message
  }
  throw new ApiError(res.status, body.error?.code || "UNKNOWN", body.error?.message || "Something went wrong.");
}

export async function registerStudent(input: {
  fullName: string;
  email: string;
  phoneNumber: string;
  password: string;
  pin: string;
  institution?: string;
  admissionNumber?: string;
}): Promise<AuthResult> {
  const res = await fetch(`${API_BASE_URL}/api/auth/register/student`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return parseErrorOrThrow(res);
  return res.json();
}

// Mirrors server/src/schemas/settlementMethodSchema.ts exactly — the
// backend is the source of truth for which fields each method needs;
// this type just keeps the frontend request shape honest against it.
export type SettlementInput =
  | { method: "mpesa_till"; tillNumber: string; tillName: string; registeredPhoneNumber: string }
  | { method: "paybill"; paybillNumber: string; accountNumber: string; paybillBusinessName: string; registeredPhoneNumber: string }
  | { method: "send_money"; phoneNumber: string; accountHolderName: string }
  | { method: "pochi_la_biashara"; pochiPhoneNumber: string; businessAccountName: string; registeredName: string }
  | { method: "bank"; bankName: string; accountName: string; accountNumber: string; branch?: string; branchCode?: string };

export async function registerHotel(input: {
  email: string;
  phoneNumber: string;
  password: string;
  pin: string;
  hotelName: string;
  businessType: string;
  location?: string;
  contactFullName: string;
  settlement: SettlementInput;
}): Promise<AuthResult & { applicationId: string }> {
  const res = await fetch(`${API_BASE_URL}/api/auth/register/hotel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return parseErrorOrThrow(res);
  return res.json();
}

export async function login(identifier: string, password: string): Promise<AuthResult> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) return parseErrorOrThrow(res);
  return res.json();
}

export async function refreshTokens(refreshToken: string): Promise<AuthResult> {
  const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return parseErrorOrThrow(res);
  return res.json();
}

export async function loginWithGoogle(idToken: string): Promise<AuthResult> {
  const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) return parseErrorOrThrow(res);
  return res.json();
}

export async function logoutRequest(refreshToken: string): Promise<void> {
  await fetch(`${API_BASE_URL}/api/auth/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => {
    // Best-effort — even if this fails (e.g. offline), the local
    // session is cleared by the caller regardless.
  });
}
