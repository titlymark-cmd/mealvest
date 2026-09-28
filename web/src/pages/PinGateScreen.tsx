import React, { useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { Logo } from "../components/Logo";
import { PrimaryButton } from "../components/PrimaryButton";
import { COLORS, FONTS, RADIUS } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../services/authApi";

/**
 * Mandatory second factor, shown right after a password login
 * succeeds (see AuthContext.pendingLogin) — rendered by RootGate
 * ahead of everything else, the same way the splash/loading gates
 * are, since at this point `user` is still null but a real login is
 * in progress. Two modes off of the SAME pendingLogin.pinSet flag the
 * backend already told us: an existing PIN to enter, or a brand new
 * one to create (double-entry, to catch typos on something that has
 * no "forgot PIN" recovery flow yet).
 */
export function PinGateScreen() {
  const { pendingLogin, confirmLoginPin, createLoginPin, cancelPendingLogin } = useAuth();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!pendingLogin) return null;
  const isCreating = !pendingLogin.pinSet;

  const digitsOnly = (v: string) => v.replace(/\D/g, "").slice(0, 4);

  const submit = async () => {
    setError(null);

    if (pin.length !== 4) return setError("Enter your 4-digit PIN.");
    if (isCreating && pin !== confirmPin) return setError("PINs don't match — try again.");

    setLoading(true);
    try {
      if (isCreating) {
        await createLoginPin(pin);
      } else {
        await confirmLoginPin(pin);
      }
      // No manual navigation — RootGate switches to the right role
      // stack the moment `user` is set, same as every other login path.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setPin("");
      setConfirmPin("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <Logo size="md" dark />

        <div style={styles.iconCircle}>
          {isCreating ? <ShieldCheck size={22} color="#fff" /> : <Lock size={22} color="#fff" />}
        </div>

        <h1 style={styles.title}>{isCreating ? "Create your PIN" : "Enter your PIN"}</h1>
        <p style={styles.subtitle}>
          {isCreating
            ? "Set a 4-digit PIN now — you'll need it every time you sign in with your password, alongside your password itself."
            : "For your security, enter your 4-digit PIN to finish signing in."}
        </p>

        <div style={styles.form}>
          <input
            style={styles.pinInput}
            type="password"
            inputMode="numeric"
            autoFocus
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(digitsOnly(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && !isCreating && submit()}
            placeholder="••••"
          />
          {isCreating && (
            <input
              style={styles.pinInput}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={confirmPin}
              onChange={(e) => setConfirmPin(digitsOnly(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Confirm PIN"
            />
          )}

          {error && <p style={styles.error}>{error}</p>}

          <PrimaryButton onPress={submit} loading={loading} showArrow={false} style={{ marginTop: 6 }}>
            {isCreating ? "Create PIN & continue" : "Confirm"}
          </PrimaryButton>
        </div>

        <button onClick={cancelPendingLogin} style={styles.backLink}>
          <span style={styles.backLinkText}>Use a different account</span>
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
  pinInput: {
    backgroundColor: COLORS.cardWhite,
    borderRadius: RADIUS.sm,
    border: `1.5px solid ${COLORS.borderSoft}`,
    padding: "14px 16px",
    fontSize: 22,
    letterSpacing: 10,
    textAlign: "center",
    fontFamily: FONTS.displayBold,
    fontWeight: 800,
    color: COLORS.text,
    outline: "none",
    width: "100%",
  },
  error: { color: COLORS.danger, fontSize: 13, fontFamily: FONTS.bodySemibold, fontWeight: 600, textAlign: "center", margin: 0 },
  backLink: { marginTop: 18 },
  backLinkText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.textMuted },
};
