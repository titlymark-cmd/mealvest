import React, { useEffect, useState } from "react";
import { BellRing, Send } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { Banner, HdSwitch, Panel, PanelHead, useNotice } from "../hotel/hd";
import { usePushControl } from "../../hooks/usePushControl";
import {
  describeTestResult,
  fetchPreferences,
  NotificationPreferences,
  sendTestNotification,
  updatePreferences,
} from "../../services/notificationsApi";

/**
 * Notification preferences for the hotel-side roles (owner and staff) in the dashboard skin.
 * Only the categories a hotel account can actually receive are shown — orders & redemptions,
 * announcements and security alerts — never student-only ones (meal reminders, wallet alerts).
 * It talks to the SAME notification API and push registration as every other role; nothing here
 * is a second notification system.
 */
const ROWS: Array<{ key: keyof NotificationPreferences; label: string; sub: string }> = [
  { key: "payment_updates", label: "Orders & redemptions", sub: "New orders and meals redeemed at your hotel" },
  { key: "announcements", label: "Announcements", sub: "News from MEALVEST" },
  { key: "security_alerts", label: "Security alerts", sub: "Password and account changes" },
];

export function HotelNotificationSettings() {
  const { authFetch } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const push = usePushControl();
  const { notice, notify } = useNotice();

  useEffect(() => {
    fetchPreferences(authFetch)
      .then(setPrefs)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load your notification settings."));
  }, [authFetch]);

  const toggle = async (key: keyof NotificationPreferences) => {
    if (!prefs) return;
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const next = !prefs[key];
    setPrefs({ ...prefs, [key]: next });
    try {
      setPrefs(await updatePreferences(authFetch, { [camel]: next }));
    } catch (err) {
      setPrefs((p) => (p ? { ...p, [key]: !next } : p));
      notify(err instanceof Error ? err.message : "Could not save that change.", "bad");
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = describeTestResult(await sendTestNotification(authFetch));
      notify(r.message, r.ok ? "good" : "bad");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not send a test notification.", "bad");
    } finally {
      setTesting(false);
    }
  };

  const pushControl =
    push.status === "unavailable" || push.status === "blocked" ? null : (
      <HdSwitch
        checked={push.status === "on"}
        disabled={push.busy || push.status === "checking"}
        onChange={() => (push.status === "on" ? push.turnOff() : push.turnOn())}
        label={push.status === "on" ? "On" : "Off"}
      />
    );

  return (
    <Panel>
      <PanelHead icon={<BellRing size={18} />} title="Notifications" subtitle="Choose what reaches you, and turn on alerts for this device." />
      {loadError && <Banner tone="bad" title="Couldn't load your notification settings">{loadError}</Banner>}
      {push.error && <Banner tone="bad" title="Push notifications">{push.error}</Banner>}

      <div className="hd-row">
        <div className="hd-row-main">
          <span className="hd-row-title">Push notifications on this device</span>
          <span className="hd-row-meta">
            {push.explanation ?? (push.status === "on" ? "On — alerts arrive even when the app is closed." : "Get alerts even when the app is closed.")}
          </span>
        </div>
        {pushControl}
      </div>

      {prefs &&
        ROWS.map(({ key, label, sub }) => (
          <div key={key} className="hd-row">
            <div className="hd-row-main">
              <span className="hd-row-title">{label}</span>
              <span className="hd-row-meta">{sub}</span>
            </div>
            <HdSwitch checked={Boolean(prefs[key])} onChange={() => toggle(key)} label={prefs[key] ? "On" : "Off"} />
          </div>
        ))}

      <div className="hd-row">
        <div className="hd-row-main">
          <span className="hd-row-title">Send a test notification</span>
          <span className="hd-row-meta">Check that alerts reach this device.</span>
        </div>
        <button type="button" className="hd-btn hd-btn-quiet hd-btn-sm" onClick={test} disabled={testing}>
          <Send size={14} aria-hidden="true" /> {testing ? "Sending…" : "Send test"}
        </button>
      </div>
      {notice}
    </Panel>
  );
}
