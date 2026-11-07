import { ApiError } from "./authApi";

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

/** Owner-only staff management (server/src/services/hotelStaffService.ts). Errors carry the server's code so screens can react precisely. */
export type StaffStatus = "owner" | "active" | "invited" | "deactivated";

export interface StaffMember {
  userId: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  permissionLevel: "owner" | "staff";
  status: StaffStatus;
  emailVerified: boolean;
  createdAt: string;
  activatedAt: string | null;
  deactivatedAt: string | null;
  /** Meals this person has redeemed at the counter (all time). */
  redemptions: number;
}

export interface CreateStaffInput {
  fullName: string;
  email: string;
  phoneNumber: string;
}

async function parse<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error?.code || "UNKNOWN", data?.error?.message || fallback);
  return data as T;
}

const json = { "Content-Type": "application/json" };

export async function fetchStaff(authFetch: AuthFetch): Promise<{ staff: StaffMember[]; limit: number }> {
  return parse(await authFetch("/api/hotel/staff"), "Could not load your staff.");
}

export async function fetchStaffMember(authFetch: AuthFetch, userId: string): Promise<StaffMember> {
  const data = await parse<{ staff: StaffMember }>(await authFetch(`/api/hotel/staff/${userId}`), "Could not load this staff member.");
  return data.staff;
}

export async function createStaff(
  authFetch: AuthFetch,
  input: CreateStaffInput
): Promise<{ staff: StaffMember; inviteSent: boolean; inviteError?: string }> {
  return parse(
    await authFetch("/api/hotel/staff", { method: "POST", headers: json, body: JSON.stringify(input) }),
    "Could not create this staff account."
  );
}

export async function resendStaffInvite(authFetch: AuthFetch, userId: string): Promise<void> {
  await parse(await authFetch(`/api/hotel/staff/${userId}/resend-invite`, { method: "POST" }), "Could not resend the invitation.");
}

export async function deactivateStaff(authFetch: AuthFetch, userId: string): Promise<StaffMember> {
  const data = await parse<{ staff: StaffMember }>(await authFetch(`/api/hotel/staff/${userId}/deactivate`, { method: "POST" }), "Could not deactivate this staff member.");
  return data.staff;
}

export async function reactivateStaff(authFetch: AuthFetch, userId: string): Promise<StaffMember> {
  const data = await parse<{ staff: StaffMember }>(await authFetch(`/api/hotel/staff/${userId}/reactivate`, { method: "POST" }), "Could not reactivate this staff member.");
  return data.staff;
}
