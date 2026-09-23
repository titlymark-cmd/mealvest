import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { requestLogger } from "./middleware/requestLogger";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
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

export function createApp() {
  const app = express();

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
          callback(new Error("Not allowed by CORS"));
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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
