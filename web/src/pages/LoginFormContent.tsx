import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PrimaryButton } from "../components/PrimaryButton";
import { Field } from "../components/ui/Field";
import { PasswordField } from "../components/ui/PasswordField";
import { COLORS, FONTS, RADIUS } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../services/authApi";
import { isGoogleAuthConfigured } from "../services/googleAuth";
import { GoogleSignInButton } from "../components/GoogleSignInButton";

/**
 * Login form. Auth logic is unchanged (loginWithPassword / loginWithGoogle,
 * same errors, same PIN second step handled by RootGate); only the
 * presentation was rebuilt.
 */
export function LoginFormContent({ onSwitchToRegister }: { onSwitchToRegister: (role: "student" | "hotel") => void }) {
  const navigate = useNavigate();
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
        // No manual navigation — the root route gate watches `user`.
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
      <h1 style={styles.title}>Welcome back</h1>
      <p style={styles.subtitle}>Sign in to continue.</p>

      {googleConfigured && (
        <>
          <GoogleSignInButton onIdToken={handleGoogleIdToken} loading={googleLoading} />
          <p style={styles.or}>or sign in with your email or phone</p>
        </>
      )}

      <Field label="Email or phone number" value={identifier} onChange={setIdentifier} autoComplete="username" autoCapitalize="none" enterKeyHint="next" />
      <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" enterKeyHint="go" />

      <button type="button" style={styles.forgot} onClick={() => navigate("/forgot-password")}>
        Forgot password?
      </button>

      {error && (
        <p role="alert" style={styles.error}>
          {error}
        </p>
      )}

      <PrimaryButton loading={loading} showArrow={false} style={{ marginTop: 8 }}>
        Sign in
      </PrimaryButton>

      <div style={styles.links}>
        <PrimaryButton variant="secondary" type="button" showArrow={false} onPress={() => onSwitchToRegister("student")}>
          New student? Create an account
        </PrimaryButton>
      </div>
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { width: "100%", maxWidth: 440, display: "flex", flexDirection: "column" },
  title: { margin: 0, fontSize: 28, lineHeight: "34px", fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.textOnDark },
  subtitle: { fontSize: 14, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted, margin: "6px 0 24px" },
  or: { textAlign: "center", fontFamily: FONTS.body, fontSize: 12, color: COLORS.textOnDarkMuted, margin: "14px 0 20px" },
  forgot: { alignSelf: "flex-end", minHeight: 44, marginTop: -6, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.primaryLight },
  error: { margin: "0 0 8px", padding: "12px 14px", borderRadius: RADIUS.sm, backgroundColor: "rgba(229,72,46,0.12)", border: "1px solid rgba(229,72,46,0.5)", color: "#FF9A82", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13 },
  links: { display: "flex", flexDirection: "column", gap: 6, marginTop: 22 },
};
