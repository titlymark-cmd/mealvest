import { useEffect } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";

WebBrowser.maybeCompleteAuthSession();

/**
 * Wraps expo-auth-session's Google provider. This is real OAuth —
 * unlike the earlier chat-preview mockup, this genuinely opens
 * Google's own account picker (via the system browser/webview) and
 * returns a real ID token once the person authenticates.
 *
 * SETUP REQUIRED before this works on a device (not optional, the
 * hook will simply never resolve without these):
 *   1. Create 3 OAuth client IDs in Google Cloud Console — Web,
 *      iOS, Android — see server/.env.example's GOOGLE_CLIENT_IDS
 *      comment for the exact reasoning (one token must verify
 *      against whichever of these issued it).
 *   2. Set them here via app/.env:
 *        EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
 *        EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
 *        EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
 *   3. The SAME three values (comma-separated) go into the
 *      backend's GOOGLE_CLIENT_IDS — verifyGoogleIdToken checks the
 *      token's audience against exactly this list.
 */
/**
 * Whether Google Sign-In can actually run on this platform/build.
 * On web specifically, expo-auth-session's Google provider throws
 * synchronously (an invariant inside useIdTokenAuthRequest, not
 * something this codebase added) if webClientId is undefined —
 * unlike native, where the hook degrades gracefully. Callers must
 * check this BEFORE mounting anything that calls useGoogleAuth, not
 * after — see components/GoogleSignInButton.tsx.
 */
export function isGoogleAuthConfigured(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);
}

export function useGoogleAuth(onIdToken: (idToken: string) => void) {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === "success" && response.params.id_token) {
      onIdToken(response.params.id_token);
    }
  }, [response, onIdToken]);

  return {
    // Callers should disable the "Continue with Google" button until
    // this is true — expo-auth-session needs a moment to build the
    // request before promptAsync() is safe to call.
    ready: Boolean(request),
    promptAsync,
  };
}
