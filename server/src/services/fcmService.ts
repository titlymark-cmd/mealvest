import axios from "axios";
import { GoogleAuth } from "google-auth-library";
import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";

// Lazily constructed — env vars may not be set (push is optional),
// and constructing GoogleAuth with empty credentials would throw
// before we get a chance to return our own clear error message.
let authClient: GoogleAuth | null = null;

function getAuth(): GoogleAuth {
  if (!env.firebaseProjectId || !env.firebaseClientEmail || !env.firebasePrivateKey) {
    throw new ApiError(
      500,
      "PUSH_NOT_CONFIGURED",
      "Push notifications are not configured on this server yet. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY."
    );
  }
  if (!authClient) {
    authClient = new GoogleAuth({
      credentials: { client_email: env.firebaseClientEmail, private_key: env.firebasePrivateKey },
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });
  }
  return authClient;
}

export interface SendPushParams {
  token: string;
  title: string;
  body: string;
  deepLink?: string;
}

export type SendPushResult =
  | { ok: true; messageId: string }
  | { ok: false; invalidToken: boolean; error: string };

/**
 * FCM's HTTP v1 API directly (googleAuth for the service-account
 * access token, axios for the actual call) rather than the
 * firebase-admin SDK — same hand-rolled-client convention this
 * codebase already uses for Paystack/Google/Storage/Resend, and
 * google-auth-library is already a dependency (see lib/googleAuth.ts's
 * separate use of it for verifying incoming Google ID tokens — this
 * is the same package's OTHER job: minting an outgoing access token
 * for a service account, not verifying an incoming one).
 *
 * Never throws on a per-device send failure — an invalid/expired
 * token is a normal, expected outcome (the device was uninstalled,
 * the browser cleared its subscription, etc.), not a genuine error;
 * the caller (notificationService) uses `invalidToken` to deactivate
 * just that one device row without touching the user's other devices.
 */
const FCM_TIMEOUT_MS = 10_000;

/**
 * Decides whether an FCM error means THIS DEVICE TOKEN is permanently dead (so the
 * row should be disabled) as opposed to a payload bug, quota, outage or credentials
 * problem (which say nothing about the token and must never disable a device).
 *
 * FCM v1 reports status INVALID_ARGUMENT for BOTH a malformed token and a malformed
 * payload, so that status alone is not evidence — only the specific token wording is.
 */
export function isDeadTokenError(error: { status?: string; message?: string; details?: Array<{ errorCode?: string }> } | undefined): boolean {
  if (!error) return false;
  const codes = (error.details ?? []).map((d) => d.errorCode).filter(Boolean);
  if (codes.includes("UNREGISTERED") || codes.includes("SENDER_ID_MISMATCH")) return true;
  if (error.status === "NOT_FOUND") return true; // v1 uses 404 NOT_FOUND for an unregistered token
  if (error.status === "INVALID_ARGUMENT" && /registration token/i.test(error.message ?? "")) return true;
  return false;
}

let warnedAuth = false;

export async function sendPushToDevice(params: SendPushParams): Promise<SendPushResult> {
  const auth = getAuth();

  try {
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    const res = await axios.post(
      `https://fcm.googleapis.com/v1/projects/${env.firebaseProjectId}/messages:send`,
      {
        message: {
          token: params.token,
          notification: { title: params.title, body: params.body },
          webpush: {
            notification: { icon: "/logo192.png" },
            // A stale push (phone off for a day) is worse than none.
            headers: { TTL: "86400" },
            // NOTE: no fcm_options.link. FCM only accepts an absolute https:// URL there and
            // rejects a relative app path with INVALID_ARGUMENT. Navigation is handled by the
            // service worker's notificationclick using data.deepLink (a same-origin path).
          },
          data: params.deepLink ? { deepLink: params.deepLink } : undefined,
        },
      },
      {
        headers: { Authorization: `Bearer ${accessToken.token}`, "Content-Type": "application/json" },
        timeout: FCM_TIMEOUT_MS,
      }
    );

    return { ok: true, messageId: res.data.name };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const fcmError = err.response?.data?.error;
      const httpStatus = err.response?.status;
      if ((httpStatus === 401 || httpStatus === 403) && !warnedAuth) {
        warnedAuth = true;
        console.error(
          `[fcm] HTTP ${httpStatus}: the service account was rejected. Check FIREBASE_PROJECT_ID matches the key's project, ` +
            "the 'Firebase Cloud Messaging API (V1)' is enabled, and the account has the Firebase Cloud Messaging Admin role."
        );
      }
      return { ok: false, invalidToken: isDeadTokenError(fcmError), error: fcmError?.message || err.message };
    }
    // Includes failures minting the access token (bad private key format, network).
    return { ok: false, invalidToken: false, error: err instanceof Error ? err.message : "Unknown push error" };
  }
}

export function isPushConfigured(): boolean {
  return Boolean(env.firebaseProjectId && env.firebaseClientEmail && env.firebasePrivateKey);
}
