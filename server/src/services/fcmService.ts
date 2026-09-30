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
            fcm_options: params.deepLink ? { link: params.deepLink } : undefined,
          },
          data: params.deepLink ? { deepLink: params.deepLink } : undefined,
        },
      },
      { headers: { Authorization: `Bearer ${accessToken.token}`, "Content-Type": "application/json" } }
    );

    return { ok: true, messageId: res.data.name };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.data?.error?.status;
      const invalidToken = status === "NOT_FOUND" || status === "UNREGISTERED" || status === "INVALID_ARGUMENT";
      return { ok: false, invalidToken, error: err.response?.data?.error?.message || err.message };
    }
    return { ok: false, invalidToken: false, error: err instanceof Error ? err.message : "Unknown push error" };
  }
}

export function isPushConfigured(): boolean {
  return Boolean(env.firebaseProjectId && env.firebaseClientEmail && env.firebasePrivateKey);
}
