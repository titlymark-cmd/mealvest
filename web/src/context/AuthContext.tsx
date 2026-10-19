import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import * as SecureStore from "../services/secureStorage";
import * as authApi from "../services/authApi";
import { AuthUser } from "../services/authApi";
import { API_BASE_URL } from "../services/config";
import { disablePushOnThisDevice } from "../services/pushNotifications";
import {
  backgroundLockMs,
  clearHidden,
  clearLockState,
  getHiddenAt,
  isPinLockEnabled,
  isStandaloneDisplay,
  isWindowUnlocked,
  markWindowUnlocked,
  recordHidden,
  setPinLockMarker,
  shouldLockOnLaunch,
  shouldLockOnReturn,
} from "../services/appLock";

const REFRESH_TOKEN_KEY = "mealvest_refresh_token";
const REFRESH_LOCK_NAME = "mealvest-refresh";

/**
 * Refresh tokens are rotated on every use and REUSE of an old one is
 * treated as theft by the server (it revokes the whole session family).
 * Several tabs share one stored token, so a refresh must:
 *   - run one at a time across tabs (Web Locks API where available) and
 *     within a tab (shared in-flight promise), and
 *   - always use the LATEST token in storage, not a stale in-memory copy.
 */
async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & { locks?: { request: (name: string, cb: () => Promise<T>) => Promise<T> } }).locks;
  if (locks?.request) return locks.request(REFRESH_LOCK_NAME, fn);
  return fn();
}

async function refreshWithLatestStoredToken(): Promise<authApi.AuthResult> {
  return withRefreshLock(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const stored = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      if (!stored) throw new authApi.ApiError(401, "NO_SESSION", "Please log in again.");
      try {
        const result = await authApi.refreshTokens(stored);
        await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, result.refreshToken);
        return result;
      } catch (err) {
        // A sibling tab rotated the token a moment ago: its new token is
        // (or is about to be) in storage — re-read and retry once.
        if (err instanceof authApi.ApiError && err.code === "REFRESH_TOKEN_ROTATED" && attempt === 0) {
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
        throw err;
      }
    }
    throw new authApi.ApiError(401, "INVALID_REFRESH_TOKEN", "Please log in again.");
  });
}

/** Set right after password verification succeeds, cleared once the PIN step (or its cancellation) resolves. */
export interface PendingLogin {
  pendingToken: string;
  pinSet: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean; // true only during the initial silent-refresh check on launch
  pendingLogin: PendingLogin | null;
  /**
   * True when a valid session exists on this device but the app is locked
   * (reopened installed PWA, or backgrounded too long). Distinct from
   * logged-out: the refresh token is kept, only the in-memory session is
   * withheld until the PIN is verified by the server.
   */
  isLocked: boolean;
  /** Lock the app now without ending the session. */
  lockApp: () => void;
  /** Verify the PIN server-side and restore the existing session. Throws ApiError on a wrong PIN / lockout. */
  unlockWithPin: (pin: string) => Promise<void>;
  loginWithPassword: (identifier: string, password: string) => Promise<void>;
  /** Step 2 of a login where pendingLogin.pinSet is true. */
  confirmLoginPin: (pin: string) => Promise<void>;
  /** Step 2 of a login where pendingLogin.pinSet is false — this pin becomes the account's PIN. */
  createLoginPin: (pin: string) => Promise<void>;
  /** Abandon the pending PIN step and go back to the password form. */
  cancelPendingLogin: () => void;
  loginWithGoogle: (idToken: string) => Promise<void>;
  registerStudent: (input: Parameters<typeof authApi.registerStudent>[0]) => Promise<void>;
  registerHotel: (input: Parameters<typeof authApi.registerHotel>[0]) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Fetch wrapper for any authenticated backend call. Attaches the
   * current access token; on a 401 (expired token) it attempts
   * exactly one silent refresh and retries the request once. If that
   * refresh also fails, the session is cleared and the error is
   * rethrown — screens should treat a thrown error from authFetch as
   * "the user is now logged out" and let RootNavigator's state change
   * carry them back to Welcome, rather than handling it locally.
   */
  authFetch: (path: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Session storage split deliberately:
 *   - accessToken + user live ONLY in React state (memory). They
 *     disappear on app close/reload by design — that's fine, they're
 *     cheap to reobtain via refresh.
 *   - refreshToken is the one thing persisted, via services/secureStorage
 *     (iOS Keychain / Android Keystore on native; localStorage on web,
 *     since expo-secure-store has no web backing at all).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshTokenValue, setRefreshTokenValue] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingLogin, setPendingLogin] = useState<PendingLogin | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  // Mirrors isLocked synchronously so a refresh that was already in flight
  // when the app locked cannot re-populate `user` and quietly bypass the lock.
  const lockedRef = useRef(false);

  const applySession = useCallback(async (result: authApi.AuthResult, opts?: { unlocking?: boolean }) => {
    // Keep the rotated refresh token (the old one is already spent) but never
    // surface a session while locked unless this IS the unlock.
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, result.refreshToken);
    if (lockedRef.current && !opts?.unlocking) return;
    lockedRef.current = false;
    setIsLocked(false);
    setUser(result.user);
    setAccessToken(result.accessToken);
    setRefreshTokenValue(result.refreshToken);
    markWindowUnlocked();
  }, []);

  const clearSession = useCallback(async () => {
    lockedRef.current = false;
    setIsLocked(false);
    setUser(null);
    setAccessToken(null);
    setRefreshTokenValue(null);
    clearLockState();
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  }, []);

  // On launch: look for a stored refresh token and silently try to
  // exchange it for a fresh session. Success -> routed straight to
  // the right role stack (RootNavigator reads `user` for this).
  // Failure/absence -> land on Welcome, same as a first-time user.
  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
        if (!stored) {
          setIsLoading(false);
          return;
        }
        // Reopened installed PWA (or returned after too long in the
        // background): hold the session behind the PIN instead of silently
        // restoring it. Nothing is cleared — the refresh token stays put.
        if (
          shouldLockOnLaunch({
            hasRefreshToken: true,
            lockEnabled: isPinLockEnabled(),
            windowUnlocked: isWindowUnlocked(),
            hiddenAt: getHiddenAt(),
            now: Date.now(),
            standalone: isStandaloneDisplay(),
            timeoutMs: backgroundLockMs(),
          })
        ) {
          lockedRef.current = true;
          setIsLocked(true);
          return;
        }
        const result = await refreshWithLatestStoredToken();
        await applySession(result);
      } catch {
        await clearSession();
      } finally {
        setIsLoading(false);
      }
    })();
  }, [applySession, clearSession]);

  /**
   * Step 1 only — password verification. Never applies a session on
   * its own; a successful call sets `pendingLogin`, and RootGate
   * renders the mandatory PIN step (PinGateScreen) off of that until
   * confirmLoginPin/createLoginPin actually completes the login.
   */
  const loginWithPassword = useCallback(async (identifier: string, password: string) => {
    const result = await authApi.login(identifier, password);
    setPendingLogin({ pendingToken: result.pendingToken, pinSet: result.pinSet });
  }, []);

  const confirmLoginPin = useCallback(
    async (pin: string) => {
      if (!pendingLogin) throw new Error("No login is currently pending.");
      const result = await authApi.verifyLoginPin(pendingLogin.pendingToken, pin);
      setPinLockMarker(true);
      await applySession(result);
      setPendingLogin(null);
    },
    [pendingLogin, applySession]
  );

  const createLoginPin = useCallback(
    async (pin: string) => {
      if (!pendingLogin) throw new Error("No login is currently pending.");
      const result = await authApi.setLoginPin(pendingLogin.pendingToken, pin);
      setPinLockMarker(true);
      await applySession(result);
      setPendingLogin(null);
    },
    [pendingLogin, applySession]
  );

  const cancelPendingLogin = useCallback(() => {
    setPendingLogin(null);
  }, []);

  /**
   * One call handles both first-ever sign-up AND every later
   * sign-in — the backend's find-or-create logic (authService.
   * loginWithGoogle) is what decides which one this is, never the
   * client. That's also what makes a brand new device "just work":
   * the same idToken flow runs regardless of whether SecureStore on
   * THIS device has ever seen this account before.
   */
  const loginWithGoogle = useCallback(
    async (idToken: string) => {
      const result = await authApi.loginWithGoogle(idToken);
      await applySession(result);
    },
    [applySession]
  );

  const registerStudent = useCallback(
    async (input: Parameters<typeof authApi.registerStudent>[0]) => {
      const result = await authApi.registerStudent(input);
      setPinLockMarker(true); // registration requires a PIN
      await applySession(result);
    },
    [applySession]
  );

  const registerHotel = useCallback(
    async (input: Parameters<typeof authApi.registerHotel>[0]) => {
      const result = await authApi.registerHotel(input);
      setPinLockMarker(true); // registration requires a PIN
      await applySession(result);
    },
    [applySession]
  );

  const lockApp = useCallback(() => {
    if (!user) return;
    lockedRef.current = true;
    setIsLocked(true);
    setUser(null);
    setAccessToken(null);
    setRefreshTokenValue(null);
  }, [user]);

  const unlockWithPin = useCallback(
    async (pin: string) => {
      if (!lockedRef.current) return;
      let result: authApi.AuthResult;
      try {
        // Serialised with refreshes, and always the LATEST stored token (a
        // sibling tab may have rotated it) — same rule as refreshWithLatestStoredToken.
        result = await withRefreshLock(async () => {
          for (let attempt = 0; attempt < 2; attempt++) {
            const stored = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
            if (!stored) throw new authApi.ApiError(401, "NO_SESSION", "Please log in again.");
            try {
              return await authApi.unlockWithPin(stored, pin);
            } catch (err) {
              if (err instanceof authApi.ApiError && err.code === "REFRESH_TOKEN_ROTATED" && attempt === 0) {
                await new Promise((r) => setTimeout(r, 300));
                continue;
              }
              throw err;
            }
          }
          throw new authApi.ApiError(401, "INVALID_REFRESH_TOKEN", "Please log in again.");
        });
      } catch (err) {
        if (err instanceof authApi.ApiError) {
          if (err.code === "PIN_NOT_SET") {
            // This account has no PIN (e.g. Google-only), so there is nothing to
            // unlock with: remember that and restore through the normal,
            // existing refresh path (the session itself is still verified).
            setPinLockMarker(false);
            const fresh = await refreshWithLatestStoredToken();
            await applySession(fresh, { unlocking: true });
            return;
          }
          if (err.code === "INVALID_REFRESH_TOKEN" || err.code === "NO_SESSION") {
            // Session expired / revoked / suspended: back to the normal login flow.
            await clearSession();
          }
        }
        throw err;
      }
      setPinLockMarker(true);
      await applySession(result, { unlocking: true });
    },
    [applySession, clearSession]
  );

  // Lock when the app comes back after being backgrounded too long. A plain
  // refresh also fires pagehide/hidden, but reloads in a second or two, well
  // inside the timeout, so it never locks (see services/appLock.ts).
  useEffect(() => {
    if (!user) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        recordHidden();
        return;
      }
      if (isPinLockEnabled() && shouldLockOnReturn(getHiddenAt(), Date.now(), backgroundLockMs())) {
        lockApp();
      } else {
        clearHidden();
      }
    };
    const onPageHide = () => recordHidden();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [user, lockApp]);

  const inFlightRefresh = useRef<Promise<authApi.AuthResult> | null>(null);
  const refreshOnce = useCallback(() => {
    if (!inFlightRefresh.current) {
      inFlightRefresh.current = refreshWithLatestStoredToken().finally(() => {
        inFlightRefresh.current = null;
      });
    }
    return inFlightRefresh.current;
  }, []);

  const logout = useCallback(async () => {
    // M4: detach THIS browser's push token from the account before the
    // session ends, so the next person to sign in on this browser never
    // receives this user's notifications. Only this device's token is
    // touched; failures never block logout.
    if (accessToken && typeof Notification !== "undefined" && Notification.permission === "granted") {
      const pushFetch = (path: string, init: RequestInit = {}) =>
        fetch(`${API_BASE_URL}${path}`, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${accessToken}` } });
      await Promise.race([
        disablePushOnThisDevice(pushFetch).catch(() => {}),
        new Promise((r) => setTimeout(r, 3000)),
      ]);
    }
    const stored = (await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)) || refreshTokenValue;
    if (stored) {
      await authApi.logoutRequest(stored);
    }
    await clearSession();
  }, [accessToken, refreshTokenValue, clearSession]);

  const authFetch = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const doFetch = (token: string | null) =>
        fetch(`${API_BASE_URL}${path}`, {
          ...init,
          headers: {
            ...(init.headers || {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

      let res = await doFetch(accessToken);

      if (res.status === 401 && refreshTokenValue) {
        try {
          const fresh = await refreshOnce();
          await applySession(fresh);
          res = await doFetch(fresh.accessToken);
        } catch (err) {
          await clearSession();
          throw err;
        }

        if (res.status === 401) {
          // Refresh succeeded but the retried request STILL failed
          // auth — something is wrong beyond simple expiry. Force
          // logout rather than leaving the user in a stuck state.
          await clearSession();
        }
      }

      return res;
    },
    [accessToken, refreshTokenValue, applySession, clearSession, refreshOnce]
  );

  const value = useMemo(
    () => ({
      user,
      accessToken,
      isLoading,
      pendingLogin,
      isLocked,
      lockApp,
      unlockWithPin,
      loginWithPassword,
      confirmLoginPin,
      createLoginPin,
      cancelPendingLogin,
      loginWithGoogle,
      registerStudent,
      registerHotel,
      logout,
      authFetch,
    }),
    [
      user,
      accessToken,
      isLoading,
      pendingLogin,
      isLocked,
      lockApp,
      unlockWithPin,
      loginWithPassword,
      confirmLoginPin,
      createLoginPin,
      cancelPendingLogin,
      loginWithGoogle,
      registerStudent,
      registerHotel,
      logout,
      authFetch,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
