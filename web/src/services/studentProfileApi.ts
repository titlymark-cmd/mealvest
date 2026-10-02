type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

export interface StudentProfile {
  id: string;
  email: string;
  phone_number: string;
  alternate_phone_number: string | null;
  account_status: string;
  full_name: string;
  institution: string | null;
  admission_number: string | null;
  avatar_url: string | null;
}

export interface UpdateStudentProfileInput {
  fullName?: string;
  phoneNumber?: string;
  alternatePhoneNumber?: string;
  institution?: string;
  admissionNumber?: string;
}

async function parseOrError<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || fallback);
  return data;
}

export async function fetchStudentProfile(authFetch: AuthFetch): Promise<StudentProfile> {
  const res = await authFetch("/api/student/profile");
  const data = await parseOrError<{ profile: StudentProfile }>(res, "Could not load your profile.");
  return data.profile;
}

export async function updateStudentProfile(
  authFetch: AuthFetch,
  input: UpdateStudentProfileInput
): Promise<StudentProfile> {
  const res = await authFetch("/api/student/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseOrError<{ profile: StudentProfile }>(res, "Could not save your profile.");
  return data.profile;
}

/** No Content-Type header — the browser sets the correct multipart boundary itself for a FormData body. */
export async function uploadStudentAvatar(authFetch: AuthFetch, file: File): Promise<string> {
  const form = new FormData();
  form.append("image", file);

  const res = await authFetch("/api/student/profile/avatar", { method: "POST", body: form });
  const data = await parseOrError<{ avatarUrl: string }>(res, "Could not upload your profile picture.");
  return data.avatarUrl;
}
