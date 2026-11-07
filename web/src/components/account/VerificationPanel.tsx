import React, { useCallback, useEffect, useRef, useState } from "react";
import { MailCheck, Smartphone, CheckCircle2, RefreshCw } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  ApiError,
  confirmPhoneVerification,
  getVerificationStatus,
  requestEmailVerification,
  requestPhoneVerification,
  VerificationStatus,
} from "../../services/authApi";
import { Banner, Panel, PanelHead, StatusPill } from "../hotel/hd";

/**
 * Contact verification for EVERY role — one component, two visual skins:
 *   skin="student" → the student app's grouped-settings look (.sv-*)
 *   skin="hotel"   → the hotel/staff/admin dashboard look (.hd-*)
 * The server owns all the rules (expiry, single use, attempt/daily limits, delivery);
 * this only shows true status and collects the user's action. It never claims a message was
 * sent unless the server confirmed delivery, and it never sends anything on its own — every
 * send is an explicit tap.
 */
type Skin = "student" | "hotel";

function cooldownFrom(err: unknown): number | null {
  if (err instanceof ApiError && err.code === "VERIFICATION_COOLDOWN") {
    const m = err.message.match(/(\d+)\s*second/);
    return m ? Number(m[1]) : 60;
  }
  return null;
}

export function VerificationPanel({ skin, onVerified }: { skin: Skin; onVerified?: () => void }) {
  const { authFetch } = useAuth();
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"email" | "phone" | "code" | "refresh" | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [emailWait, setEmailWait] = useState(0);
  const [phoneWait, setPhoneWait] = useState(0);
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;

  const load = useCallback(async () => {
    try {
      setStatus(await getVerificationStatus(authFetch));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load your verification status.");
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  // The email link is usually opened in another tab/app — re-check when the user comes back.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  // Resend countdowns.
  useEffect(() => {
    if (emailWait <= 0 && phoneWait <= 0) return;
    const t = window.setTimeout(() => {
      setEmailWait((s) => Math.max(0, s - 1));
      setPhoneWait((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearTimeout(t);
  }, [emailWait, phoneWait]);

  const run = async (kind: "email" | "phone" | "code" | "refresh", fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (err) {
      const wait = cooldownFrom(err);
      if (wait !== null) {
        if (kind === "email") setEmailWait(wait);
        if (kind === "phone") setPhoneWait(wait);
      }
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const sendEmail = () =>
    run("email", async () => {
      const r = await requestEmailVerification(authFetch);
      if (r.alreadyVerified) {
        await load();
        return;
      }
      setEmailWait(r.resendAfterSeconds ?? 60);
      setInfo("Check your inbox for the confirmation link (valid for 24 hours). If you can't see it, look in spam.");
    });

  const sendCode = () =>
    run("phone", async () => {
      const r = await requestPhoneVerification(authFetch);
      if (r.alreadyVerified) {
        await load();
        return;
      }
      setPhoneWait(r.resendAfterSeconds ?? 60);
      setCodeSent(true);
      setInfo("We sent a 6-digit code by SMS (valid for 10 minutes).");
    });

  const confirmCode = () =>
    run("code", async () => {
      await confirmPhoneVerification(authFetch, code);
      setCode("");
      setCodeSent(false);
      setInfo("Phone number verified.");
      await load();
      onVerifiedRef.current?.();
    });

  const refresh = () =>
    run("refresh", async () => {
      await load();
      onVerifiedRef.current?.();
    });

  if (!status) {
    return loadError ? (
      skin === "hotel" ? (
        <Banner tone="bad" title="Couldn't load verification status" action={<button className="hd-btn hd-btn-dark hd-btn-sm" onClick={load}>Try again</button>}>
          {loadError}
        </Banner>
      ) : (
        <div className="sv-toast" data-tone="bad" role="alert">
          {loadError}{" "}
          <button type="button" className="sv-link" onClick={load}>
            Try again
          </button>
        </div>
      )
    ) : (
      <div className={skin === "hotel" ? "hd-panel" : "mv-skel"} style={{ minHeight: 120 }} aria-busy="true" aria-label="Loading verification status" />
    );
  }

  const emailBlocked = !status.emailDeliveryAvailable;
  const phoneBlocked = !status.smsDeliveryAvailable;
  const hasPhone = Boolean(status.phoneNumber);

  const emailAction = status.emailVerified ? null : (
    <button
      type="button"
      className={skin === "hotel" ? "hd-btn hd-btn-dark hd-btn-sm" : "sv-btn"}
      data-variant="primary"
      disabled={busy !== null || emailWait > 0 || emailBlocked}
      onClick={sendEmail}
    >
      {busy === "email" ? "Sending…" : emailWait > 0 ? `Resend in ${emailWait}s` : "Send link"}
    </button>
  );
  const phoneAction =
    status.phoneVerified || !hasPhone ? null : (
      <button
        type="button"
        className={skin === "hotel" ? "hd-btn hd-btn-dark hd-btn-sm" : "sv-btn"}
        data-variant="primary"
        disabled={busy !== null || phoneWait > 0 || phoneBlocked}
        onClick={sendCode}
      >
        {busy === "phone" ? "Sending…" : phoneWait > 0 ? `Resend in ${phoneWait}s` : codeSent ? "Resend code" : "Send code"}
      </button>
    );

  const emailSub = status.emailVerified
    ? status.email
    : emailBlocked
    ? "Email verification isn't available right now. Please try again later."
    : `We'll send a confirmation link to ${status.email}.`;
  const phoneSub = !hasPhone
    ? "No phone number on this account."
    : status.phoneVerified
    ? status.phoneNumber!
    : phoneBlocked
    ? "SMS verification isn't available right now. Please try again later."
    : "We'll text a 6-digit code to the number on your account.";

  const codeBox = !status.phoneVerified && codeSent && (
    <div className={skin === "hotel" ? "hd-form" : "sv-inline-input"} style={{ paddingTop: 12 }}>
      <input
        className={skin === "hotel" ? "hd-input" : undefined}
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
        className={skin === "hotel" ? "hd-btn hd-btn-primary hd-btn-sm" : "sv-btn"}
        data-variant="primary"
        disabled={busy !== null || code.length !== 6}
        onClick={confirmCode}
      >
        {busy === "code" ? "Checking…" : "Verify"}
      </button>
    </div>
  );

  if (skin === "hotel") {
    return (
      <Panel>
        <PanelHead
          icon={<MailCheck size={18} />}
          title="Verify your contact details"
          subtitle="Verified contact details keep your account recoverable and unlock sensitive actions."
          right={
            <button type="button" className="hd-btn hd-btn-quiet hd-btn-sm" onClick={refresh} disabled={busy !== null} aria-label="Refresh verification status">
              <RefreshCw size={14} aria-hidden="true" /> Refresh
            </button>
          }
        />
        {error && <Banner tone="bad" title="That didn't work">{error}</Banner>}
        {info && <Banner tone="good" title={info} />}
        <div className="hd-row">
          <div className="hd-row-main">
            <span className="hd-row-title">Email</span>
            <span className="hd-row-meta">{emailSub}</span>
          </div>
          {status.emailVerified ? <StatusPill tone="good">Verified</StatusPill> : <StatusPill tone="warn">Not verified</StatusPill>}
          {emailAction}
        </div>
        <div className="hd-row">
          <div className="hd-row-main">
            <span className="hd-row-title">Phone</span>
            <span className="hd-row-meta">{phoneSub}</span>
          </div>
          {status.phoneVerified ? <StatusPill tone="good">Verified</StatusPill> : <StatusPill tone="warn">Not verified</StatusPill>}
          {phoneAction}
        </div>
        {codeBox}
      </Panel>
    );
  }

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
            <span className="sv-row-label">{status.emailVerified ? "Email verified" : "Email not verified yet"}</span>
            <span className="sv-row-sub">{emailSub}</span>
          </span>
          {status.emailVerified ? <CheckCircle2 size={18} aria-label="Verified" style={{ color: "var(--sv-ok)" }} /> : emailAction}
        </div>
        <div className="sv-row">
          <span className="sv-row-icon" aria-hidden="true">
            <Smartphone size={18} />
          </span>
          <span className="sv-row-main">
            <span className="sv-row-label">{status.phoneVerified ? "Phone verified" : "Phone not verified yet"}</span>
            <span className="sv-row-sub">{phoneSub}</span>
          </span>
          {status.phoneVerified ? <CheckCircle2 size={18} aria-label="Verified" style={{ color: "var(--sv-ok)" }} /> : phoneAction}
        </div>
        {codeBox}
      </div>
    </section>
  );
}
