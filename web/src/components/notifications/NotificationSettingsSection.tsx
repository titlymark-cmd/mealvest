import React, { useEffect, useState } from "react";
import { BellRing, CreditCard, Wallet, Megaphone, ShieldAlert, UtensilsCrossed, Send } from "lucide-react";
import { Switch } from "../Switch";
import { useAuth } from "../../context/AuthContext";
import { fetchPreferences, updatePreferences, sendTestNotification, NotificationPreferences } from "../../services/notificationsApi";

const TOGGLE_ROWS: Array<{ key: keyof NotificationPreferences; label: string; sub: string; Icon: React.ComponentType<{ size?: number }> }> = [
  { key: "meal_reminders", label: "Meal reminders", sub: "Reminders to use your meal pass", Icon: UtensilsCrossed },
  { key: "payment_updates", label: "Payment updates", sub: "Plan and Meal Boost payment results", Icon: CreditCard },
  { key: "wallet_alerts", label: "Wallet alerts", sub: "Meal passes, redemptions, low balance", Icon: Wallet },
  { key: "announcements", label: "Announcements", sub: "Platform news from MEALVEST", Icon: Megaphone },
  { key: "security_alerts", label: "Security alerts", sub: "Password and account changes", Icon: ShieldAlert },
];

/**
 * Embedded in StudentProfileScreen — see that file for the surrounding
 * page. Renders as a grouped settings list (.sv-group rows).
 *
 * Push notifications need a Firebase project configured server-side
 * (see fcmService.ts) before they can actually send anything — until
 * that's set up, the toggle below is shown as "Coming soon" instead of
 * a live control (see ComingSoonBadge.tsx for the fuller explanation
 * surfaced elsewhere in the app). The backend is fully built and
 * wired — the ONLY thing missing is real Firebase credentials — so
 * re-enabling this is a one-line change (swap the chip back for a
 * <Switch> bound to prefs.push_enabled / pushNotifications.enablePush)
 * once those are set in Vercel.
 */
export function NotificationSettingsSection() {
  const { authFetch } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent">("idle");

  useEffect(() => {
    fetchPreferences(authFetch)
      .then(setPrefs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authFetch]);

  const toggle = async (key: keyof NotificationPreferences) => {
    if (!prefs) return;
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) as any;
    const nextValue = !prefs[key];
    setSavingKey(key);
    setPrefs({ ...prefs, [key]: nextValue });
    try {
      const updated = await updatePreferences(authFetch, { [camelKey]: nextValue });
      setPrefs(updated);
    } catch {
      setPrefs((p) => (p ? { ...p, [key]: !nextValue } : p)); // revert on failure
    } finally {
      setSavingKey(null);
    }
  };

  const handleTest = async () => {
    setTestStatus("sending");
    try {
      await sendTestNotification(authFetch);
      setTestStatus("sent");
      setTimeout(() => setTestStatus("idle"), 3000);
    } catch {
      setTestStatus("idle");
    }
  };

  if (loading || !prefs) {
    return <div className="mv-skel" style={{ height: 120 }} aria-busy="true" aria-label="Loading notification settings" />;
  }

  return (
    <section aria-labelledby="notif-settings-heading">
      <h2 className="sv-group-title" id="notif-settings-heading">
        Notifications
      </h2>
      <div className="sv-group">
        <div className="sv-row">
          <span className="sv-row-icon" aria-hidden="true">
            <BellRing size={18} />
          </span>
          <span className="sv-row-main">
            <span className="sv-row-label">Push notifications</span>
            <span className="sv-row-sub">Get alerts on this device, even when the app is closed</span>
          </span>
          <span className="sv-badge" data-tone="warn">
            Coming soon
          </span>
        </div>

        {TOGGLE_ROWS.map(({ key, label, sub, Icon }) => (
          <div key={key} className="sv-row">
            <span className="sv-row-icon" aria-hidden="true">
              <Icon size={18} />
            </span>
            <span className="sv-row-main">
              <span className="sv-row-label" id={`pref-${key}`}>
                {label}
              </span>
              <span className="sv-row-sub">{sub}</span>
            </span>
            <span aria-labelledby={`pref-${key}`} style={{ display: "inline-flex" }}>
              <Switch value={Boolean(prefs[key])} onValueChange={() => toggle(key)} />
            </span>
          </div>
        ))}

        <button type="button" className="sv-row" onClick={handleTest} disabled={testStatus === "sending"}>
          <span className="sv-row-icon" aria-hidden="true">
            <Send size={18} />
          </span>
          <span className="sv-row-main">
            <span className="sv-row-label">
              {testStatus === "sending" ? "Sending…" : testStatus === "sent" ? "Test sent" : "Send a test notification"}
            </span>
            <span className="sv-row-sub">Check that alerts reach you</span>
          </span>
        </button>
      </div>
      {savingKey && (
        <span className="sv-meta" role="status" style={{ display: "block", marginTop: 8, marginLeft: 6 }}>
          Saving…
        </span>
      )}
    </section>
  );
}
