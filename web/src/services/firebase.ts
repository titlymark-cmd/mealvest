import { initializeApp, FirebaseApp } from "firebase/app";
import { getMessaging, Messaging, isSupported } from "firebase/messaging";

/**
 * Public Firebase Web config — these values are NOT secrets (Firebase's
 * own docs are explicit about this: security comes from Firestore/RTDB
 * rules and App Check, never from hiding the apiKey), so baking them
 * into the CRA bundle via REACT_APP_* at build time is the correct,
 * intended way to ship them — same as REACT_APP_GOOGLE_WEB_CLIENT_ID
 * already does for Google Sign-In in this codebase. The one genuinely
 * sensitive Firebase credential (the service-account key used to SEND
 * push messages) lives server-side only — see server/src/config/env.ts
 * and services/fcmService.ts.
 */
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && firebaseConfig.appId);
}

let app: FirebaseApp | null = null;
function getApp(): FirebaseApp {
  if (!app) app = initializeApp(firebaseConfig);
  return app;
}

/**
 * Returns null (never throws) when Firebase isn't configured yet or
 * the browser doesn't support the Push API/Notifications (e.g. iOS
 * Safari outside a home-screen-installed PWA, or any browser with
 * cookies/storage restricted) — every caller treats null as "push
 * isn't available here right now" and degrades gracefully, per the
 * spec's explicit "gracefully handle unsupported browsers" requirement.
 */
export async function getMessagingInstance(): Promise<Messaging | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const supported = await isSupported();
    if (!supported) return null;
    return getMessaging(getApp());
  } catch {
    return null;
  }
}
