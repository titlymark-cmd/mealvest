import { API_BASE_URL } from "./config";

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

async function parseOrError<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || fallback);
  return data;
}

/** Public — no auth required, matches plans/hotels public browsing endpoints. */
export async function fetchCustomerCarePhone(): Promise<string | null> {
  const res = await fetch(`${API_BASE_URL}/api/settings/customer-care`);
  const data = await parseOrError<{ phone: string | null }>(res, "Could not load the customer care number.");
  return data.phone;
}

export async function updateCustomerCarePhone(authFetch: AuthFetch, phone: string): Promise<string> {
  const res = await authFetch("/api/admin/settings/customer-care", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const data = await parseOrError<{ phone: string }>(res, "Could not update the customer care number.");
  return data.phone;
}
