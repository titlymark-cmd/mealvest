import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, MailWarning } from "lucide-react";
import { Logo } from "../components/Logo";
import { Spinner } from "../components/Spinner";
import { COLORS, FONTS, RADIUS } from "../styles/theme";
import { confirmEmailVerification } from "../services/authApi";

/**
 * Landing page for the one-time email-verification link (security fix
 * H7/M3). Works whether or not the user is signed in on this device —
 * the token itself is the proof, and it is single-use and short-lived on
 * the server. The token is removed from the address bar immediately so it
 * doesn't linger in history or get shared by accident.
 */
export function VerifyEmailScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<"working" | "done" | "failed">("working");
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // React strict-mode double effect: redeem once
    started.current = true;
    const token = searchParams.get("token");
    window.history.replaceState(null, "", "/verify-email");
    if (!token) {
      setState("failed");
      setMessage("This link is missing its verification token.");
      return;
    }
    confirmEmailVerification(token)
      .then(() => setState("done"))
      .catch((err: unknown) => {
        setState("failed");
        setMessage(err instanceof Error ? err.message : "This verification link is invalid or has expired.");
      });
  }, [searchParams]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <Logo size="md" dark />
        {state === "working" && (
          <>
            <Spinner size="large" color={COLORS.primary} />
            <p style={styles.subtitle}>Confirming your email…</p>
          </>
        )}
        {state === "done" && (
          <>
            <CheckCircle2 size={40} color={COLORS.success} />
            <h1 style={styles.title}>Email confirmed</h1>
            <p style={styles.subtitle}>Thanks — your MEALVEST email address is now verified.</p>
          </>
        )}
        {state === "failed" && (
          <>
            <MailWarning size={40} color={COLORS.danger} />
            <h1 style={styles.title}>Link didn't work</h1>
            <p style={styles.subtitle}>{message} You can request a new link from your profile.</p>
          </>
        )}
        {state !== "working" && (
          <button onClick={() => navigate("/", { replace: true })} style={styles.backLink}>
            <span style={styles.backLinkText}>Continue to MEALVEST</span>
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: "100vh", width: "100%", backgroundColor: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
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
    gap: 14,
  },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 20, color: COLORS.text, margin: 0 },
  subtitle: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.textMuted, margin: 0, lineHeight: "20px" },
  backLink: { marginTop: 6 },
  backLinkText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 14, color: COLORS.primary },
};
