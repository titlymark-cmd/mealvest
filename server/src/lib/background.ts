/**
 * Run work after the HTTP response without it being frozen (finding M2).
 *
 * On Vercel, a function instance may be suspended as soon as the
 * response is sent, so fire-and-forget promises (notifications, emails)
 * can silently never complete. Vercel's runtime exposes the current
 * request's `waitUntil` through `globalThis[Symbol.for("@vercel/request-context")]`
 * — the same mechanism the @vercel/functions package wraps. Using it
 * directly avoids adding that package and its auto-installed peer
 * dependencies (AWS SDK credential providers, ws) to a payment server.
 *
 * Off Vercel (local dev, tests, a long-running Node server) there is no
 * such context and the promise simply runs to completion in-process.
 * Errors are always caught and logged — background work must never
 * crash the process or affect a financial response.
 */
const REQUEST_CONTEXT = Symbol.for("@vercel/request-context");

type VercelContext = { waitUntil?: (p: Promise<unknown>) => void };

export function runInBackground(label: string, work: () => Promise<unknown>): void {
  const promise = Promise.resolve()
    .then(work)
    .catch((err) => console.error(`[background:${label}] failed:`, (err as Error)?.message ?? err));
  try {
    const holder = (globalThis as unknown as Record<symbol, { get?: () => VercelContext } | undefined>)[REQUEST_CONTEXT];
    holder?.get?.()?.waitUntil?.(promise);
  } catch {
    /* not on Vercel — nothing to register */
  }
}
