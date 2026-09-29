import { useEffect, useRef, useState } from "react";

/**
 * Web port of the original app/src/services/googleAuth.ts, which
 * wrapped expo-auth-session's Google ID-token provider. The backend
 * (verifyGoogleIdToken) expects a Google **ID token** (a JWT, checked
 * against GOOGLE_CLIENT_IDS), not an OAuth access token — so this
 * uses Google Identity Services' "Sign In With Google" flow
 * (accounts.id), which is the one that hands back an ID token via
 * its callback, not accounts.oauth2 (which only yields access tokens).
 *
 * Same env-var pattern as before, translated to CRA's convention:
 *   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID -> REACT_APP_GOOGLE_WEB_CLIENT_ID
 * Only the web client ID is relevant here — the iOS/Android client
 * IDs the original also read were for native builds, which don't
 * exist in this web-only migration.
 *
 * SETUP REQUIRED before this works in a browser:
 *   Set REACT_APP_GOOGLE_WEB_CLIENT_ID in web/.env (or the hosting
 *   platform's env config) to the SAME Google OAuth Web client ID
 *   already listed in the backend's GOOGLE_CLIENT_IDS.
 */

const GSI_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
let gsiLoadPromise: Promise<void> | null = null;

function loadGoogleIdentityServices(): Promise<void> {
  if (gsiLoadPromise) return gsiLoadPromise;
  gsiLoadPromise = new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.id) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });
  return gsiLoadPromise;
}

export function isGoogleAuthConfigured(): boolean {
  return Boolean(process.env.REACT_APP_GOOGLE_WEB_CLIENT_ID);
}

/**
 * `buttonRef` must be attached to a VISIBLE, clickable element —
 * Google renders its own real button into it via renderButton().
 *
 * An earlier version rendered that real button off-screen and tried
 * to fire it via a synthetic `.click()` from this app's own custom
 * button, so the visible button could keep this app's styling. That
 * doesn't reliably work: the click Google's script receives is a
 * programmatic one (`event.isTrusted === false`), and Google Identity
 * Services silently drops untrusted clicks rather than opening the
 * account picker — which is exactly why nothing happened when tapped.
 * Rendering Google's real button directly, so every click on it is a
 * genuine user gesture, is the only combination Google's script
 * actually honors reliably.
 */
export function useGoogleAuth(onIdToken: (idToken: string) => void) {
  const [ready, setReady] = useState(false);
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const onIdTokenRef = useRef(onIdToken);
  onIdTokenRef.current = onIdToken;

  useEffect(() => {
    const clientId = process.env.REACT_APP_GOOGLE_WEB_CLIENT_ID;
    if (!clientId) return;
    let cancelled = false;

    loadGoogleIdentityServices().then(() => {
      if (cancelled) return;
      const google = (window as any).google;
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: { credential?: string }) => {
          if (response.credential) onIdTokenRef.current(response.credential);
        },
      });
      if (buttonRef.current) {
        google.accounts.id.renderButton(buttonRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          logo_alignment: "left",
          width: 340,
        });
      }
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { ready, buttonRef };
}
