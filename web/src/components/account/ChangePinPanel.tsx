import React, { useState } from "react";
import { KeyRound } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiError, changePin } from "../../services/authApi";
import { Banner, Panel, PanelHead } from "../hotel/hd";

/**
 * Change the 4-digit PIN (the app's second sign-in factor). The server requires the CURRENT
 * password as proof, so a stolen unlocked phone can't quietly change it.
 */
export function ChangePinPanel() {
  const { authFetch } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (!currentPassword) return setError("Enter your current password to confirm this change.");
    if (!/^\d{4}$/.test(pin)) return setError("PIN must be exactly 4 digits.");
    if (pin !== confirm) return setError("The two PINs don't match.");
    setBusy(true);
    try {
      await changePin(authFetch, pin, currentPassword);
      setDone(true);
      setCurrentPassword("");
      setPin("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change your PIN. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <PanelHead icon={<KeyRound size={18} />} title="Change PIN" subtitle="Your 4-digit PIN unlocks the app after sign-in." />
      {error && <Banner tone="bad" title="PIN not changed">{error}</Banner>}
      {done && <Banner tone="good" title="Your PIN was changed." />}
      <form className="hd-form" onSubmit={submit} noValidate>
        <div className="hd-field">
          <label htmlFor="cp-pass">Current password</label>
          <input id="cp-pass" className="hd-input" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div className="hd-grid-2">
          <div className="hd-field">
            <label htmlFor="cp-pin">New PIN</label>
            <input id="cp-pin" className="hd-input" inputMode="numeric" autoComplete="new-password" maxLength={4} type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </div>
          <div className="hd-field">
            <label htmlFor="cp-pin2">Confirm new PIN</label>
            <input id="cp-pin2" className="hd-input" inputMode="numeric" autoComplete="new-password" maxLength={4} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </div>
        </div>
        <div>
          <button type="submit" className="hd-btn hd-btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Change PIN"}
          </button>
        </div>
      </form>
    </Panel>
  );
}
