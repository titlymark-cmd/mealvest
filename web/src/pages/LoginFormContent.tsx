import React, { useState, useCallback } from "react";
import { Logo } from "../components/Logo";
import { PrimaryButton } from "../components/PrimaryButton";
import { COLORS, FONTS, RADIUS } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../services/authApi";
import { isGoogleAuthConfigured } from "../services/googleAuth";
import { GoogleSignInButton } from "../components/GoogleSignInButton";

/**
 * The actual login form and its logic — ported unchanged from the
 * original app/src/screens/LoginFormContent.tsx. Every API call,
 * validation rule, and piece of auth state here is identical; only
 * the JSX elements changed (View/Text/TextInput -> div/span/input),
 * and navigation.navigate(...) was already a local callback prop in
 * the RN version (for the diagonal-split animation), so nothing
 * changes there either.
 */
export function LoginFormContent({
  onSwitchToRegister,
}: {
  onSwitchToRegister: (role: "student" | "hotel") => void;
}) {
  const { loginWithPassword, loginWithGoogle } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleIdToken = useCallback(
    async (idToken: string) => {
      setError(null);
      setGoogleLoading(true);
      try {
        await loginWithGoogle(idToken);
        // No manual navigation — the root route gate watches `user`
        // from AuthContext and switches to the correct role stack
        // automatically, exactly the same as password login.
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Google sign-in failed. Please try again.");
      } finally {
        setGoogleLoading(false);
      }
    },
    [loginWithGoogle]
  );

  const googleConfigured = isGoogleAuthConfigured();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginWithPassword(identifier.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form style={styles.wrap} onSubmit={submit}>
      <Logo />
      <h1 style={styles.title}>Welcome back</h1>
      <p style={styles.subtitle}>Sign in to continue.</p>

      {googleConfigured && (
        <>
          <GoogleSignInButton onIdToken={handleGoogleIdToken} loading={googleLoading} />
          <div style={styles.dividerRow}>
            <div style={styles.dividerLine} />
            <span style={styles.dividerText}>OR</span>
            <div style={styles.dividerLine} />
          </div>
        </>
      )}

      <input
        style={styles.input}
        placeholder="Email or phone number"
        autoCapitalize="none"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
      />
      <input
        style={styles.input}
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {error && <p style={styles.error}>{error}</p>}

      <PrimaryButton onPress={() => {}} loading={loading} showArrow={false} style={{ marginTop: 8 }}>
        Sign in
      </PrimaryButton>

      <button type="button" style={styles.linkButton} onClick={() => onSwitchToRegister("student")}>
        <span style={styles.link}>New student? Create an account</span>
      </button>
      <button type="button" style={styles.linkButton} onClick={() => onSwitchToRegister("hotel")}>
        <span style={styles.link}>Registering a hotel? Sign up here</span>
      </button>
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { width: "100%", maxWidth: 420, display: "flex", flexDirection: "column" },
  title: { fontSize: 24, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.textOnDark, marginTop: 22, marginBottom: 0 },
  subtitle: { fontSize: 14, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted, marginTop: 4, marginBottom: 24 },
  dividerRow: { display: "flex", flexDirection: "row", alignItems: "center", marginTop: 18, marginBottom: 18 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { marginLeft: 10, marginRight: 10, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: COLORS.textOnDarkMuted },
  input: {
    backgroundColor: "rgba(252,244,234,0.06)",
    borderRadius: RADIUS.sm,
    border: `1.5px solid ${COLORS.border}`,
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 16,
    paddingRight: 16,
    marginBottom: 12,
    fontSize: 15,
    fontFamily: FONTS.bodyMedium,
    fontWeight: 500,
    color: COLORS.textOnDark,
    outline: "none",
    width: "100%",
  },
  error: { color: COLORS.danger, fontSize: 13, marginBottom: 12, marginTop: 0, fontFamily: FONTS.bodySemibold, fontWeight: 600 },
  linkButton: { marginTop: 16, alignSelf: "center" },
  link: {
    color: COLORS.primary,
    fontFamily: FONTS.bodySemibold,
    fontWeight: 600,
    fontSize: 13,
    textAlign: "center",
  },
};
