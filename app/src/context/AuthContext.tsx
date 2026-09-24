import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import * as SecureStore from "../services/secureStorage";
import * as authApi from "../services/authApi";
import { AuthUser } from "../services/authApi";
import { API_BASE_URL } from "../services/config";

const REFRESH_TOKEN_KEY = "mealvest_refresh_token";

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean; // true only during the initial silent-refresh check on launch
  loginWithPassword: (identifier: string, password: string) => Promise<void>;
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

  const applySession = useCallback(async (result: authApi.AuthResult) => {
    setUser(result.user);
    setAccessToken(result.accessToken);
    setRefreshTokenValue(result.refreshToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, result.refreshToken);
  }, []);

  const clearSession = useCallback(async () => {
    setUser(null);
    setAccessToken(null);
    setRefreshTokenValue(null);
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
        const result = await authApi.refreshTokens(stored);
        await applySession(result);
      } catch {
        await clearSession();
      } finally {
        setIsLoading(false);
      }
    })();
  }, [applySession, clearSession]);

  const loginWithPassword = useCallback(
    async (identifier: string, password: string) => {
      const result = await authApi.login(identifier, password);
      await applySession(result);
    },
    [applySession]
  );

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
      await applySession(result);
    },
    [applySession]
  );

  const registerHotel = useCallback(
    async (input: Parameters<typeof authApi.registerHotel>[0]) => {
      const result = await authApi.registerHotel(input);
      await applySession(result);
    },
    [applySession]
  );

  const logout = useCallback(async () => {
    if (refreshTokenValue) {
      await authApi.logoutRequest(refreshTokenValue);
    }
    await clearSession();
  }, [refreshTokenValue, clearSession]);

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
          const fresh = await authApi.refreshTokens(refreshTokenValue);
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
    [accessToken, refreshTokenValue, applySession, clearSession]
  );

  const value = useMemo(
    () => ({
      user,
      accessToken,
      isLoading,
      loginWithPassword,
      loginWithGoogle,
      registerStudent,
      registerHotel,
      logout,
      authFetch,
    }),
    [user, accessToken, isLoading, loginWithPassword, loginWithGoogle, registerStudent, registerHotel, logout, authFetch]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
