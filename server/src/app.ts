import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { requestLogger } from "./middleware/requestLogger";
import { ApiError, errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { healthRouter } from "./routes/health.routes";
import { authRouter } from "./routes/auth.routes";
import { studentRouter } from "./routes/student.routes";
import { hotelRouter } from "./routes/hotel.routes";
import { hotelsPublicRouter } from "./routes/hotels.routes";
import { adminRouter } from "./routes/admin.routes";
import { paymentsRouter } from "./routes/payments.routes";
import { webhooksRouter } from "./routes/webhooks.routes";
import { ordersRouter } from "./routes/orders.routes";
import { plansRouter } from "./routes/plans.routes";
import { settingsRouter } from "./routes/settings.routes";
import { announcementsRouter } from "./routes/announcements.routes";
import { notificationsRouter } from "./routes/notifications.routes";
import { cronRouter } from "./routes/cron.routes";

export function createApp() {
  const app = express();

  // Vercel terminates TLS at the edge and forwards over its own
  // internal proxy — without this, req.protocol/req.secure would
  // report the internal (often non-TLS) hop instead of what the
  // student's browser actually used, which matters for building an
  // accurate Paystack callback_url (see payments.controller.ts).
  //
  // Rate limiting keys on req.ip, so this must match the real proxy chain
  // (H5): on Vercel exactly one trusted hop sets X-Forwarded-For. Override
  // with TRUST_PROXY (a hop count) only if deployed behind another proxy.
  app.set("trust proxy", Number.isInteger(Number(process.env.TRUST_PROXY)) && process.env.TRUST_PROXY !== "" ? Number(process.env.TRUST_PROXY) : 1);

  // Security headers on every response.
  app.use(helmet());

  // Only the Expo dev client and whatever's listed in
  // ALLOWED_ORIGINS (set this to your production app's origin once
  // deployed) may call this API with credentials.
  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin/non-browser tools (no Origin header) and
        // anything explicitly listed.
        if (!origin || env.allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          // A disallowed origin is a client-side policy refusal (403), not a
          // server failure (previously surfaced as a 500).
          callback(new ApiError(403, "CORS_NOT_ALLOWED", "This origin is not allowed to call the API."));
        }
      },
      // No `credentials: true` — this API is 100% bearer-token
      // (Authorization header), nothing sets or reads cookies
      // anywhere in this codebase, so there's no cookie-credentialed
      // request for the browser to need permission for.
    })
  );

  // IMPORTANT: mounted BEFORE express.json() below. The webhook
  // route parses its own body with express.raw() (see
  // routes/webhooks.routes.ts) so it can verify Paystack's signature
  // against the exact bytes sent — if the global JSON parser ran
  // first, it would already have consumed/reserialized the body and
  // the signature check would fail for every legitimate webhook.
  app.use("/api/webhooks", webhooksRouter);

  app.use(express.json());
  app.use(requestLogger);

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/student", studentRouter);
  app.use("/api/hotel", hotelRouter);
  app.use("/api/hotels", hotelsPublicRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/payments", paymentsRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/plans", plansRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/announcements", announcementsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/cron", cronRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
