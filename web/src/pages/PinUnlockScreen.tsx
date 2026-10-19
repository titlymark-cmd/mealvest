import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { Logo } from "../components/Logo";
import { PrimaryButton } from "../components/PrimaryButton";
import { COLORS, FONTS, NEU, RADIUS } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../services/authApi";

/**
 * Shown when a valid session exists on this device but the app is locked
 * (installed PWA reopened, or backgrounded past the lock timeout — see
 * services/appLock.ts). This is NOT the login screen: the account is still
 * signed in, so it asks for the PIN only and never for the password.
 *
 * The PIN goes to the server (/api/auth/pin/verify), which owns the attempt
 * counter and lockout. Nothing about the PIN is stored, logged or put in a URL;
 * the field is cleared after every failed attempt.
 */
export function PinUnlockScreen() {
  const { unlockWithPin, logout } = useAuth();
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const submitting = useRef(false); // blocks double-submits (Enter + tap, fast taps)
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const submit = async () => {
    if (submitting.current) return;
    if (pin.length !== 4) {
      setError("Enter your 4-digit PIN.");
      return;
    }
    submitting.current = true;
    setLoading(true);
    setError(null);
    try {
      await unlockWithPin(pin);
      // RootGate swaps to the role's routes as soon as the session is restored,
      // at the same URL the user was on.
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "We couldn't reach MEALVEST. Check your connection and try again."
      );
      setPin("");
      inputRef.current?.focus();
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  const usePassword = async () => {
    setLeaving(true);
    try {
      await logout(); // revokes this device's session server-side, then clears it
      navigate("/login", { replace: true });
    } catch {
      setError("Couldn't sign you out right now. Check your connection and try again.");
      setLeaving(false);
    }
  };

  return (
    <main style={styles.page}>
      <form
        style={styles.card}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        aria-labelledby="mv-unlock-title"
      >
        <Logo size="md" dark />
        <div style={styles.iconWell} aria-hidden>
          <Lock size={22} color={COLORS.primary} />
        </div>
        <h1 id="mv-unlock-title" style={styles.title}>
          Welcome back
        </h1>
        <p style={styles.subtitle}>MEALVEST is locked. Enter your 4-digit PIN to continue where you left off.</p>

        <label htmlFor="mv-unlock-pin" style={styles.srOnly}>
          4-digit PIN
        </label>
        <input
          id="mv-unlock-pin"
          ref={inputRef}
          style={styles.pinInput}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          maxLength={4}
          value={pin}
          disabled={loading}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="••••"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "mv-unlock-error" : undefined}
        />

        <div aria-live="assertive" style={{ minHeight: 22, width: "100%" }}>
          {error && (
            <p id="mv-unlock-error" role="alert" style={styles.error}>
              {error}
            </p>
          )}
        </div>

        <PrimaryButton type="submit" loading={loading} showArrow={false} disabled={leaving}>
          Unlock
        </PrimaryButton>

        <button type="button" onClick={usePassword} disabled={loading || leaving} style={styles.link}>
          Sign in with password instead
        </button>
      </form>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100%",
    width: "100%",
    backgroundColor: COLORS.bg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "calc(20px + env(safe-area-inset-top, 0px)) 20px calc(20px + env(safe-area-inset-bottom, 0px))",
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: COLORS.card,
    boxShadow: NEU.creamRaised,
    borderRadius: RADIUS.xl,
    padding: "32px 28px 24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: 4,
  },
  iconWell: {
    width: 52,
    height: 52,
    borderRadius: "50%",
    marginTop: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4E8D8",
    boxShadow: NEU.creamInset,
  },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 22, color: COLORS.text, margin: "12px 0 0" },
  subtitle: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textMuted, margin: "6px 0 18px", lineHeight: "19px" },
  pinInput: {
    width: "100%",
    backgroundColor: "#F4E8D8",
    borderRadius: RADIUS.sm,
    border: `1.5px solid ${COLORS.borderSoft}`,
    padding: "14px 16px",
    fontSize: 24,
    letterSpacing: 12,
    textAlign: "center",
    fontFamily: FONTS.displayBold,
    fontWeight: 800,
    color: COLORS.text,
    outline: "none",
  },
  error: { color: COLORS.dangerText, fontSize: 13, fontFamily: FONTS.bodySemibold, fontWeight: 600, margin: "10px 0 0" },
  link: {
    marginTop: 12,
    minHeight: 44,
    padding: "0 12px",
    fontFamily: FONTS.bodySemibold,
    fontWeight: 600,
    fontSize: 13,
    color: COLORS.textMuted,
    textDecoration: "underline",
  },
  srOnly: { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" },
};
