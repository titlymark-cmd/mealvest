import React, { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { forgotPassword } from "../../services/authApi";
import { Banner, Panel, PanelHead } from "../hotel/hd";

/**
 * There is deliberately no "change password" form that takes the old password: the account's
 * one password-change path is the emailed, single-use reset link (which also signs out every
 * other device). This simply starts that existing flow for the signed-in user.
 */
export function PasswordResetPanel() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await forgotPassword(user.email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the password reset. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <PanelHead icon={<LockKeyhole size={18} />} title="Password" subtitle="Change your password with a one-time link sent to your email." />
      {error && <Banner tone="bad" title="Couldn't start the reset">{error}</Banner>}
      {sent && (
        <Banner tone="good" title="Check your inbox">
          If your account can receive email, a reset link is on its way. It expires in 30 minutes, and using it signs you out of every device.
        </Banner>
      )}
      <div>
        <button type="button" className="hd-btn hd-btn-quiet" onClick={send} disabled={busy || sent}>
          {busy ? "Sending…" : sent ? "Link sent" : "Email me a reset link"}
        </button>
      </div>
    </Panel>
  );
}
