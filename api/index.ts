/**
 * Vercel serverless entrypoint — wraps the EXISTING Express app
 * unchanged. Unlike the earlier Netlify adapter, no request-shape
 * translation library is needed here: Vercel's Node.js runtime
 * invokes a plain `(req, res)` handler, and an Express app instance
 * already IS exactly that (`app(req, res)` is how Express works
 * under the hood) — so `createApp()`'s return value can be the
 * default export directly. Every controller, service, middleware,
 * and route file in server/src is used as-is — zero business logic
 * touched to make this work.
 *
 * Routing: vercel.json rewrites "/api/*" to this function. Vercel
 * rewrites (unlike Netlify's function-path redirect) preserve the
 * ORIGINAL request path in req.url, so the existing Express app's own
 * "/api/..." route mounts (app.use("/api/orders", ...) etc., see
 * server/src/app.ts, untouched) keep matching exactly as they do
 * locally — no path-rewrite workaround needed here.
 */
import { createApp } from "../server/src/app";

export default createApp();
