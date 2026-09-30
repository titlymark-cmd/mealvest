import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, KeyRound, CheckCircle2 } from "lucide-react";
import { Logo } from "../components/Logo";
import { PrimaryButton } from "../components/PrimaryButton";
import { COLORS, FONTS, RADIUS } from "../styles/theme";
import { resetPassword, ApiError } from "../services/authApi";

/**
 * Reached via the link emailed by ForgotPasswordScreen's flow
 * (/reset-password?token=...). Standalone, matching PinGateScreen's
 * card style, not part of AuthScreen's animated login/register split.
 */
export function ResetPasswordScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <Logo size="md" dark />
          <h1 style={styles.title}>Invalid reset link</h1>
          <p style={styles.subtitle}>This link is missing its reset token. Request a new one from the sign-in screen.</p>
          <button onClick={() => navigate("/forgot-password")} style={styles.backLink}>
            <span style={styles.backLinkText}>Request a new link</span>
          </button>
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) return setError("Password must be at least 8 characters.");
    if (newPassword !== confirmPassword) return setError("Passwords don't match — try again.");

    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <Logo size="md" dark />

        <div style={styles.iconCircle}>
          {done ? <CheckCircle2 size={22} color="#fff" /> : <KeyRound size={22} color="#fff" />}
        </div>

        {done ? (
          <>
            <h1 style={styles.title}>Password reset</h1>
            <p style={styles.subtitle}>Your password has been changed. Any other signed-in devices have been logged out for your security.</p>
            <PrimaryButton onPress={() => navigate("/login")} showArrow={false} style={{ marginTop: 18 }}>
              Sign in
            </PrimaryButton>
          </>
        ) : (
          <>
            <h1 style={styles.title}>Choose a new password</h1>
            <p style={styles.subtitle}>Must be at least 8 characters.</p>

            <form style={styles.form} onSubmit={submit}>
              <div style={styles.passwordRow}>
                <input
                  style={{ ...styles.input, ...styles.passwordInput }}
                  placeholder="New password"
                  type={showPassword ? "text" : "password"}
                  autoFocus
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <button
                  type="button"
                  style={styles.eyeButton}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} color={COLORS.textMuted} /> : <Eye size={18} color={COLORS.textMuted} />}
                </button>
              </div>
              <input
                style={styles.input}
                placeholder="Confirm new password"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              {error && <p style={styles.error}>{error}</p>}
              <PrimaryButton onPress={() => {}} loading={loading} showArrow={false} style={{ marginTop: 6 }}>
                Reset password
              </PrimaryButton>
            </form>
          </>
        )}

        {!done && (
          <button onClick={() => navigate("/login")} style={styles.backLink}>
            <span style={styles.backLinkText}>Back to sign in</span>
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    width: "100%",
    backgroundColor: COLORS.bg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.xl,
    padding: "32px 28px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
    marginBottom: 6,
  },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 20, color: COLORS.text, margin: "8px 0 0 0" },
  subtitle: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textMuted, marginTop: 8, lineHeight: "19px" },
  form: { width: "100%", display: "flex", flexDirection: "column", gap: 10, marginTop: 22 },
  input: {
    backgroundColor: COLORS.cardWhite,
    borderRadius: RADIUS.sm,
    border: `1.5px solid ${COLORS.borderSoft}`,
    padding: "14px 16px",
    fontSize: 15,
    fontFamily: FONTS.bodyMedium,
    fontWeight: 500,
    color: COLORS.text,
    outline: "none",
    width: "100%",
  },
  passwordRow: { position: "relative", display: "flex", flexDirection: "column", justifyContent: "center" },
  passwordInput: { paddingRight: 44 },
  eyeButton: { position: "absolute", right: 14, height: "100%", display: "flex", justifyContent: "center", alignItems: "center" },
  error: { color: COLORS.danger, fontSize: 13, fontFamily: FONTS.bodySemibold, fontWeight: 600, textAlign: "center", margin: 0 },
  backLink: { marginTop: 18 },
  backLinkText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.textMuted },
};
