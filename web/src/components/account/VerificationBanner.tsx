import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MailWarning } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { getVerificationStatus } from "../../services/authApi";
import { Banner } from "../hotel/hd";

/**
 * A gentle, dismissible nudge to verify the email address — shown after registration and
 * whenever the address is still unverified. It NEVER sends anything itself (no email on page
 * load); it only points to the screen where the user taps "Send link". It hides when the address
 * is verified, when the server can't deliver email right now (nothing useful to offer), and for
 * the rest of the browser session once dismissed.
 */
export function VerificationBanner({ to, skin }: { to: string; skin: "student" | "hotel" }) {
  const { authFetch, user } = useAuth();
  const key = `mealvest_verify_banner_dismissed_${user?.id ?? ""}`;
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    try {
      if (sessionStorage.getItem(key) === "1") return;
    } catch {
      /* storage blocked — just show it */
    }
    getVerificationStatus(authFetch)
      .then((s) => {
        if (!cancelled && !s.emailVerified && s.emailDeliveryAvailable) setShow(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authFetch, key]);

  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* fine */
    }
  };

  if (skin === "hotel") {
    return (
      <div style={{ padding: "12px 16px 0" }}>
        <Banner
          tone="warn"
          title="Verify your email"
          action={
            <span style={{ display: "inline-flex", gap: 8 }}>
              <Link to={to} className="hd-btn hd-btn-dark hd-btn-sm">Verify</Link>
              <button type="button" className="hd-btn hd-btn-quiet hd-btn-sm" onClick={dismiss}>Later</button>
            </span>
          }
        >
          Confirm your email so you can recover your account and use sensitive features.
        </Banner>
      </div>
    );
  }

  return (
    <div className="sv-toast" data-tone="warn" role="status" style={{ margin: "12px 16px 0", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <MailWarning size={16} aria-hidden />
      <span style={{ flex: 1, minWidth: 180 }}>Verify your email to secure your account.</span>
      <Link to={to} className="sv-link">Verify</Link>
      <button type="button" className="sv-link" onClick={dismiss}>Later</button>
    </div>
  );
}
