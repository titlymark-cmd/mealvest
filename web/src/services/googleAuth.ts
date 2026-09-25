import { useEffect, useRef, useState, useCallback } from "react";

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

export function useGoogleAuth(onIdToken: (idToken: string) => void) {
  const [ready, setReady] = useState(false);
  const hiddenButtonRef = useRef<HTMLDivElement | null>(null);
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
      // Google's own button is rendered off-screen and "clicked" by
      // promptAsync() below — this is what actually opens the account
      // picker reliably (accounts.id.prompt() alone can silently
      // no-op due to Google's own cooldown/heuristics), while letting
      // the visible button in GoogleSignInButton.tsx keep this app's
      // existing custom styling instead of Google's default button.
      if (hiddenButtonRef.current) {
        google.accounts.id.renderButton(hiddenButtonRef.current, { type: "standard" });
      }
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const promptAsync = useCallback(() => {
    const realButton = hiddenButtonRef.current?.querySelector<HTMLElement>('div[role="button"]');
    if (realButton) {
      realButton.click();
    } else {
      (window as any).google?.accounts?.id?.prompt();
    }
  }, []);

  return { ready, promptAsync, hiddenButtonRef };
}
