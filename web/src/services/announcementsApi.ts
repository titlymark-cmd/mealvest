type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

export interface Announcement {
  id: string;
  message: string;
  created_at: string;
}

export interface AdminAnnouncement extends Announcement {
  is_active: boolean;
  updated_at: string;
  created_by_email: string | null;
}

async function parseOrError<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || fallback);
  return data;
}

/** Any signed-in user — feeds the dismissible popup shown app-wide. */
export async function fetchActiveAnnouncements(authFetch: AuthFetch): Promise<Announcement[]> {
  const res = await authFetch("/api/announcements/active");
  const data = await parseOrError<{ announcements: Announcement[] }>(res, "Could not load announcements.");
  return data.announcements;
}

export async function fetchAllAnnouncements(authFetch: AuthFetch): Promise<AdminAnnouncement[]> {
  const res = await authFetch("/api/admin/announcements");
  const data = await parseOrError<{ announcements: AdminAnnouncement[] }>(res, "Could not load announcements.");
  return data.announcements;
}

export async function createAnnouncement(authFetch: AuthFetch, message: string): Promise<AdminAnnouncement> {
  const res = await authFetch("/api/admin/announcements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  const data = await parseOrError<{ announcement: AdminAnnouncement }>(res, "Could not post the announcement.");
  return data.announcement;
}

export async function updateAnnouncement(
  authFetch: AuthFetch,
  id: string,
  input: { message?: string; isActive?: boolean }
): Promise<AdminAnnouncement> {
  const res = await authFetch(`/api/admin/announcements/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseOrError<{ announcement: AdminAnnouncement }>(res, "Could not update the announcement.");
  return data.announcement;
}

export async function deleteAnnouncement(authFetch: AuthFetch, id: string): Promise<void> {
  const res = await authFetch(`/api/admin/announcements/${id}`, { method: "DELETE" });
  await parseOrError<{ deleted: boolean }>(res, "Could not delete the announcement.");
}
