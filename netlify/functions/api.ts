/**
 * Netlify Functions adapter — wraps the EXISTING Express app
 * unchanged. `serverless-http` translates a single incoming
 * Lambda-style request event into a real Express req/res cycle,
 * runs createApp() exactly as it already runs locally, and
 * translates the response back. Every controller, service,
 * middleware, and route file in server/src is used as-is — zero
 * business logic was touched to make this work.
 */
import serverless from "serverless-http";
import { createApp } from "../../server/src/app";

const app = createApp();
const rawHandler = serverless(app);

/**
 * Path rewrite, isolated entirely to this adapter file.
 *
 * netlify.toml redirects "/api/*" to "/.netlify/functions/api/:splat"
 * — which means this function receives paths like
 * "/.netlify/functions/api/orders", not "/api/orders". The existing
 * Express app (app.ts, untouched) mounts every route under "/api/..."
 * (app.use("/api/orders", ordersRouter), etc.), so without this
 * rewrite, none of those routes would ever match inside the function
 * — every request would 404 despite the code being completely
 * correct. This restores the path Express actually expects, without
 * modifying app.ts or any route/controller file.
 *
 * IMPORTANT — this exact rewrite has not been verified against a
 * live Netlify deployment (this environment has no network access to
 * test one). The logic matches Netlify's documented redirect/function
 * behavior, but confirm it with a real request after your first
 * deploy — see the "first thing to test" note in DEPLOYMENT.md.
 */
export const handler = async (event: any, context: any) => {
  const rewrittenPath = event.path.replace(/^\/\.netlify\/functions\/api/, "/api");
  return rawHandler({ ...event, path: rewrittenPath }, context);
};
