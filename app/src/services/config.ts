/**
 * Expo only exposes env vars prefixed EXPO_PUBLIC_ to client code
 * (anything without that prefix is server/build-time only) — this is
 * a deliberate Expo convention to stop secrets accidentally shipping
 * to the client bundle. There is nothing secret about an API base
 * URL, so it's fine here.
 *
 * `??` (nullish coalescing), not `||` — this matters specifically
 * for the Netlify same-origin deployment, where
 * EXPO_PUBLIC_API_BASE_URL is deliberately set to an EMPTY string
 * (so requests go to relative "/api/..." paths on the same domain
 * instead of a separate host). An empty string is falsy under `||`,
 * which would have silently and incorrectly fallen back to
 * localhost:4000 in that exact production setup — `??` only falls
 * back when the variable is genuinely unset (local dev, nothing in
 * .env), not when it's intentionally set to "".
 */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
