/**
 * CRA only exposes env vars prefixed REACT_APP_ to client code
 * (anything without that prefix is build-time-only) — same convention
 * Expo used with EXPO_PUBLIC_, just CRA's spelling of it. There is
 * nothing secret about an API base URL, so it's fine here.
 *
 * `??` (nullish coalescing), not `||` — this matters specifically for
 * a same-origin deployment, where REACT_APP_API_BASE_URL is
 * deliberately set to an EMPTY string (so requests go to relative
 * "/api/..." paths on the same domain instead of a separate host). An
 * empty string is falsy under `||`, which would have silently and
 * incorrectly fallen back to localhost:4000 in that exact production
 * setup — `??` only falls back when the variable is genuinely unset
 * (local dev, nothing in .env), not when it's intentionally set to "".
 */
export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL ?? "http://localhost:4000";
