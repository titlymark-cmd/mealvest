import React, { useState } from "react";
import { MailCheck, Smartphone, CheckCircle2 } from "lucide-react";
import { Card } from "../Card";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { requestEmailVerification, requestPhoneVerification, confirmPhoneVerification } from "../../services/authApi";

/**
 * Contact verification (security fix H7/M3). Email: one-time link sent to
 * the account's own address. Phone: 6-digit SMS code to the account's own
 * number. The server decides everything (expiry, single use, attempt and
 * daily limits); this only collects the user's action.
 */
export function VerificationSection({
  emailVerified,
  phoneVerified,
  onVerified,
}: {
  emailVerified: boolean;
  phoneVerified: boolean;
  onVerified: () => void;
}) {
  const { authFetch } = useAuth();
  const [busy, setBusy] = useState<"email" | "phone" | "code" | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");

  if (emailVerified && phoneVerified) return null;

  const run = async (kind: "email" | "phone" | "code", fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={styles.card}>
      <span style={styles.heading}>Verify your contact details</span>
      {error && <p style={styles.error}>{error}</p>}
      {info && <p style={styles.info}>{info}</p>}

      <div style={styles.row}>
        <MailCheck size={16} color={emailVerified ? COLORS.success : COLORS.textMuted} />
        <span style={styles.rowText}>{emailVerified ? "Email verified" : "Email not verified yet"}</span>
        {emailVerified ? (
          <CheckCircle2 size={16} color={COLORS.success} />
        ) : (
          <button
            style={styles.btn}
            disabled={busy !== null}
            onClick={() =>
              run("email", async () => {
                await requestEmailVerification(authFetch);
                setInfo("Check your inbox for a confirmation link (valid for 24 hours).");
              })
            }
          >
            <span style={styles.btnText}>{busy === "email" ? "Sending…" : "Send link"}</span>
          </button>
        )}
      </div>

      <div style={styles.row}>
        <Smartphone size={16} color={phoneVerified ? COLORS.success : COLORS.textMuted} />
        <span style={styles.rowText}>{phoneVerified ? "Phone verified" : "Phone not verified yet"}</span>
        {phoneVerified ? (
          <CheckCircle2 size={16} color={COLORS.success} />
        ) : (
          <button
            style={styles.btn}
            disabled={busy !== null}
            onClick={() =>
              run("phone", async () => {
                await requestPhoneVerification(authFetch);
                setCodeSent(true);
                setInfo("We sent a 6-digit code by SMS (valid for 10 minutes).");
              })
            }
          >
            <span style={styles.btnText}>{busy === "phone" ? "Sending…" : codeSent ? "Resend code" : "Send code"}</span>
          </button>
        )}
      </div>

      {!phoneVerified && codeSent && (
        <div style={styles.row}>
          <input
            style={styles.input}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6-digit code"
            aria-label="Verification code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
          />
          <button
            style={styles.btn}
            disabled={busy !== null || code.length !== 6}
            onClick={() =>
              run("code", async () => {
                await confirmPhoneVerification(authFetch, code);
                setCode("");
                setCodeSent(false);
                setInfo("Phone number verified.");
                onVerified();
              })
            }
          >
            <span style={styles.btnText}>{busy === "code" ? "Checking…" : "Verify"}</span>
          </button>
        </div>
      )}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { display: "flex", flexDirection: "column", gap: 12, marginTop: 18 },
  heading: { fontFamily: FONTS.displaySemibold, fontWeight: 700, fontSize: 15, color: COLORS.text },
  row: { display: "flex", flexDirection: "row", alignItems: "center", gap: 10 },
  rowText: { flex: 1, fontFamily: FONTS.bodyMedium, fontWeight: 500, fontSize: 14, color: COLORS.text },
  btn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.pill, padding: "7px 14px", flexShrink: 0 },
  btnText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: "#fff" },
  input: {
    flex: 1,
    backgroundColor: COLORS.cardWhite,
    borderRadius: RADIUS.sm,
    border: `1px solid ${COLORS.borderSoft}`,
    padding: "9px 12px",
    fontSize: 15,
    fontFamily: FONTS.bodyMedium,
    color: COLORS.text,
    outline: "none",
    letterSpacing: 2,
  },
  error: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.danger, margin: 0 },
  info: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted, margin: 0 },
};
