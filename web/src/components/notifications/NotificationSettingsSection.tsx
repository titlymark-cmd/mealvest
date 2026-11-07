import React, { useEffect, useState } from "react";
import { BellRing, CreditCard, Wallet, Megaphone, ShieldAlert, UtensilsCrossed, Send } from "lucide-react";
import { Switch } from "../Switch";
import { useAuth } from "../../context/AuthContext";
import {
  fetchPreferences,
  updatePreferences,
  sendTestNotification,
  describeTestResult,
  NotificationPreferences,
} from "../../services/notificationsApi";
import { usePushControl } from "../../hooks/usePushControl";

const TOGGLE_ROWS: Array<{ key: keyof NotificationPreferences; label: string; sub: string; Icon: React.ComponentType<{ size?: number }> }> = [
  { key: "meal_reminders", label: "Meal reminders", sub: "Reminders to use your meal pass", Icon: UtensilsCrossed },
  { key: "payment_updates", label: "Payment updates", sub: "Plan and Meal Boost payment results", Icon: CreditCard },
  { key: "wallet_alerts", label: "Wallet alerts", sub: "Meal passes, redemptions, low balance", Icon: Wallet },
  { key: "announcements", label: "Announcements", sub: "Platform news from MEALVEST", Icon: Megaphone },
  { key: "security_alerts", label: "Security alerts", sub: "Password and account changes", Icon: ShieldAlert },
];

/**
 * Embedded in StudentProfileScreen — renders as a grouped settings list (.sv-group rows).
 *
 * The push switch is real: it reflects whether THIS browser is actually subscribed (not a stored
 * flag), asks for browser permission only when turned on, and explains plainly when push can't
 * work here (blocked, iPhone browser tab, unsupported browser, or not configured on this
 * deployment). The test button reports what really happened to the push.
 */
export function NotificationSettingsSection() {
  const { authFetch } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<"idle" | "sending">("idle");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const push = usePushControl();

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
    setTestResult(null);
    try {
      setTestResult(describeTestResult(await sendTestNotification(authFetch)));
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : "Could not send a test notification." });
    } finally {
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
            <span className="sv-row-label" id="pref-push">
              Push notifications
            </span>
            <span className="sv-row-sub">
              {push.explanation ?? (push.status === "on" ? "On for this device" : "Get alerts on this device, even when the app is closed")}
            </span>
          </span>
          {push.status === "unavailable" || push.status === "blocked" ? (
            <span className="sv-badge" data-tone="warn">
              {push.status === "blocked" ? "Blocked" : "Unavailable"}
            </span>
          ) : (
            <span aria-labelledby="pref-push" style={{ display: "inline-flex" }}>
              <Switch
                value={push.status === "on"}
                disabled={push.busy || push.status === "checking"}
                onValueChange={() => (push.status === "on" ? push.turnOff() : push.turnOn())}
              />
            </span>
          )}
        </div>
        {push.error && (
          <div className="sv-toast" data-tone="bad" role="alert" style={{ margin: 12 }}>
            {push.error}
          </div>
        )}

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
              {testStatus === "sending" ? "Sending…" : "Send a test notification"}
            </span>
            <span className="sv-row-sub">Check that alerts reach you</span>
          </span>
        </button>
      </div>
      {testResult && (
        <div className="sv-toast" data-tone={testResult.ok ? "ok" : "bad"} role={testResult.ok ? "status" : "alert"} style={{ marginTop: 10 }}>
          {testResult.message}
        </div>
      )}
      {savingKey && (
        <span className="sv-meta" role="status" style={{ display: "block", marginTop: 8, marginLeft: 6 }}>
          Saving…
        </span>
      )}
    </section>
  );
}
