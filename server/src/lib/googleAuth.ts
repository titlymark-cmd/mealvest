import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";

// A single OAuth2Client instance is reused across requests —
// verifyIdToken() doesn't need a "clientId" bound to the instance
// when you pass `audience` explicitly per-call (below), so this is
// just a thin wrapper around Google's public-key fetching/caching,
// which the library already handles efficiently internally.
const client = new OAuth2Client();

export interface GoogleProfile {
  googleId: string; // the token's `sub` claim — stable, unique, never reused
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}

/**
 * Verifies a Google ID token's signature, issuer, audience, and
 * expiry against Google's own public keys — this is a real
 * cryptographic check, not a trust-the-client parse of the JWT
 * payload. Throws if the token is invalid, expired, or was issued
 * for a different app (audience mismatch).
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  if (env.googleClientIds.length === 0) {
    throw new ApiError(
      500,
      "GOOGLE_AUTH_NOT_CONFIGURED",
      "Google Sign-In is not configured on this server yet."
    );
  }

  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken,
      audience: env.googleClientIds,
    });
  } catch {
    throw new ApiError(401, "INVALID_GOOGLE_TOKEN", "This Google sign-in could not be verified.");
  }

  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    throw new ApiError(401, "INVALID_GOOGLE_TOKEN", "This Google sign-in could not be verified.");
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: payload.name || payload.email.split("@")[0],
    picture: payload.picture || null,
  };
}
