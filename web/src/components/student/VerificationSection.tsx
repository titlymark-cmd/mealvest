import React, { useState } from "react";
import { MailCheck, Smartphone, CheckCircle2 } from "lucide-react";
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
    <section aria-labelledby="verify-heading">
      <h2 className="sv-group-title" id="verify-heading">
        Verify your contact details
      </h2>
      <div className="sv-group">
        {error && (
          <div className="sv-toast" data-tone="bad" role="alert" style={{ margin: 12 }}>
            {error}
          </div>
        )}
        {info && (
          <div className="sv-toast" data-tone="ok" role="status" style={{ margin: 12 }}>
            <CheckCircle2 size={16} aria-hidden />
            {info}
          </div>
        )}

        <div className="sv-row">
          <span className="sv-row-icon" aria-hidden="true">
            <MailCheck size={18} />
          </span>
          <span className="sv-row-main">
            <span className="sv-row-label">{emailVerified ? "Email verified" : "Email not verified yet"}</span>
            {!emailVerified && <span className="sv-row-sub">We'll send a confirmation link to your inbox.</span>}
          </span>
          {emailVerified ? (
            <CheckCircle2 size={18} aria-hidden style={{ color: "var(--sv-ok)" }} />
          ) : (
            <button
              type="button"
              className="sv-btn"
              data-variant="primary"
              disabled={busy !== null}
              onClick={() =>
                run("email", async () => {
                  await requestEmailVerification(authFetch);
                  setInfo("Check your inbox for a confirmation link (valid for 24 hours).");
                })
              }
            >
              {busy === "email" ? "Sending…" : "Send link"}
            </button>
          )}
        </div>

        <div className="sv-row">
          <span className="sv-row-icon" aria-hidden="true">
            <Smartphone size={18} />
          </span>
          <span className="sv-row-main">
            <span className="sv-row-label">{phoneVerified ? "Phone verified" : "Phone not verified yet"}</span>
            {!phoneVerified && <span className="sv-row-sub">We'll text you a 6-digit code.</span>}
          </span>
          {phoneVerified ? (
            <CheckCircle2 size={18} aria-hidden style={{ color: "var(--sv-ok)" }} />
          ) : (
            <button
              type="button"
              className="sv-btn"
              data-variant="primary"
              disabled={busy !== null}
              onClick={() =>
                run("phone", async () => {
                  await requestPhoneVerification(authFetch);
                  setCodeSent(true);
                  setInfo("We sent a 6-digit code by SMS (valid for 10 minutes).");
                })
              }
            >
              {busy === "phone" ? "Sending…" : codeSent ? "Resend code" : "Send code"}
            </button>
          )}
        </div>

        {!phoneVerified && codeSent && (
          <div className="sv-inline-input" style={{ paddingTop: 12, borderTop: "1px solid var(--mv-hairline)" }}>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="6-digit code"
              aria-label="Verification code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            />
            <button
              type="button"
              className="sv-btn"
              data-variant="primary"
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
              {busy === "code" ? "Checking…" : "Verify"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
