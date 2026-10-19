/**
 * Client-side mirrors of server/src/schemas/authSchemas.ts. The server stays
 * the source of truth — these exist only to give inline feedback earlier, so
 * they must never be STRICTER than the server (that would block valid people).
 */
export const validators = {
  required: (v: string, msg: string) => (v.trim() ? null : msg),
  email: (v: string) => {
    const t = v.trim();
    if (!t) return "Enter your email address.";
    if (t.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return "Enter a valid email address.";
    return null;
  },
  phone: (v: string, label = "phone number") => {
    const t = v.trim();
    if (!t) return `Enter your ${label}.`;
    if (t.length < 9 || t.length > 20) return `Enter a valid ${label}.`;
    return null;
  },
  password: (v: string) => {
    if (v.length < 8) return "Password must be at least 8 characters.";
    if (new TextEncoder().encode(v).length > 72) return "Password must be at most 72 characters.";
    return null;
  },
  pin: (v: string) => (/^\d{4}$/.test(v) ? null : "PIN must be exactly 4 digits."),
};

export type Errors = Record<string, string | null | undefined>;
export const hasErrors = (e: Errors) => Object.values(e).some(Boolean);
