import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, CheckCircle2 } from "lucide-react";
import { Logo } from "../components/Logo";
import { PrimaryButton } from "../components/PrimaryButton";
import { COLORS, FONTS, RADIUS } from "../styles/theme";
import { forgotPassword, ApiError } from "../services/authApi";

/**
 * Standalone screen (not part of AuthScreen's animated diagonal-split
 * login/register toggle — this is a separate, simpler flow reached by
 * a real route change from the "Forgot password?" link on
 * LoginFormContent). Styled to match PinGateScreen's centered-card
 * pattern rather than duplicating AuthScreen's split-screen geometry.
 *
 * The success state is shown for ANY submission, matching the
 * backend's own generic response — this screen never learns whether
 * the identifier matched a real account, by design (see
 * authService.requestPasswordReset's doc comment).
 */
export function ForgotPasswordScreen() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError("Enter your email or phone number.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await forgotPassword(identifier.trim());
      setSent(true);
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
          {sent ? <CheckCircle2 size={22} color="#fff" /> : <Mail size={22} color="#fff" />}
        </div>

        {sent ? (
          <>
            <h1 style={styles.title}>Check your email</h1>
            <p style={styles.subtitle}>
              If an account exists for that email or phone number, we've sent a password reset link to its email
              address. The link expires in 30 minutes.
            </p>
          </>
        ) : (
          <>
            <h1 style={styles.title}>Forgot your password?</h1>
            <p style={styles.subtitle}>Enter the email or phone number on your account and we'll send you a reset link.</p>

            <form style={styles.form} onSubmit={submit}>
              <input
                style={styles.input}
                placeholder="Email or phone number"
                autoCapitalize="none"
                autoFocus
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
              {error && <p style={styles.error}>{error}</p>}
              <PrimaryButton onPress={() => {}} loading={loading} showArrow={false} style={{ marginTop: 6 }}>
                Send reset link
              </PrimaryButton>
            </form>
          </>
        )}

        <button onClick={() => navigate("/login")} style={styles.backLink}>
          <span style={styles.backLinkText}>Back to sign in</span>
        </button>
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
  error: { color: COLORS.danger, fontSize: 13, fontFamily: FONTS.bodySemibold, fontWeight: 600, textAlign: "center", margin: 0 },
  backLink: { marginTop: 18 },
  backLinkText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.textMuted },
};
