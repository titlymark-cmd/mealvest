import React, { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Card } from "../Card";
import { Switch } from "../Switch";
import { Spinner } from "../Spinner";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { fetchPreferences, updatePreferences, sendTestNotification, NotificationPreferences } from "../../services/notificationsApi";
import { isPushSupported, getPermissionState, enablePush, disablePushOnThisDevice } from "../../services/pushNotifications";

const TOGGLE_ROWS: Array<{ key: keyof NotificationPreferences; label: string; sub: string }> = [
  { key: "meal_reminders", label: "Meal Reminders", sub: "Reminders to use your meal pass" },
  { key: "payment_updates", label: "Payment Updates", sub: "Plan and Meal Boost payment results" },
  { key: "wallet_alerts", label: "Wallet Alerts", sub: "Meal passes, redemptions, low balance" },
  { key: "announcements", label: "Announcements", sub: "Platform news from MEALVEST" },
  { key: "security_alerts", label: "Security Alerts", sub: "Password and account changes" },
];

/** Embedded in StudentProfileScreen — see that file for the surrounding page. Uses the same Card/Field visual language, not a redesign. */
export function NotificationSettingsSection() {
  const { authFetch } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
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

  const handlePushToggle = async () => {
    if (!prefs) return;
    setPushError(null);
    setPushBusy(true);
    try {
      if (prefs.push_enabled) {
        await disablePushOnThisDevice(authFetch);
        const updated = await updatePreferences(authFetch, { pushEnabled: false });
        setPrefs(updated);
      } else {
        const result = await enablePush(authFetch);
        if (!result.ok) {
          setPushError(result.message);
          setPushBusy(false);
          return;
        }
        const updated = await updatePreferences(authFetch, { pushEnabled: true });
        setPrefs(updated);
      }
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Could not update push notifications.");
    } finally {
      setPushBusy(false);
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
    return (
      <Card style={{ display: "flex", justifyContent: "center", padding: 24 }}>
        <Spinner color={COLORS.primary} />
      </Card>
    );
  }

  const permissionState = getPermissionState();
  const showDeniedHint = isPushSupported() && permissionState === "denied";

  return (
    <Card style={styles.card}>
      <div style={styles.headerRow}>
        <Bell size={16} color={COLORS.primary} />
        <span style={styles.headerTitle}>Notifications</span>
      </div>

      <div style={styles.row}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={styles.rowLabel}>Push Notifications</span>
          <span style={styles.rowSub}>Receive MEALVEST alerts on this device</span>
          {showDeniedHint && (
            <span style={styles.deniedHint}>Blocked in your browser — enable notifications for this site in your browser settings, then toggle this on again.</span>
          )}
          {pushError && <span style={styles.deniedHint}>{pushError}</span>}
        </div>
        <Switch value={prefs.push_enabled} onValueChange={handlePushToggle} />
      </div>

      {TOGGLE_ROWS.map((row) => (
        <div key={row.key} style={styles.row}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={styles.rowLabel}>{row.label}</span>
            <span style={styles.rowSub}>{row.sub}</span>
          </div>
          <Switch value={Boolean(prefs[row.key])} onValueChange={() => toggle(row.key)} />
        </div>
      ))}

      <button onClick={handleTest} disabled={testStatus === "sending"} style={styles.testBtn}>
        <span style={styles.testText}>
          {testStatus === "sending" ? "Sending…" : testStatus === "sent" ? "Test sent ✓" : "Send Test Notification"}
        </span>
      </button>
      {(savingKey || pushBusy) && <span style={styles.savingHint}>Saving…</span>}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { display: "flex", flexDirection: "column", marginTop: 16 },
  headerRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  headerTitle: { fontFamily: FONTS.displaySemibold, fontWeight: 700, fontSize: 15, color: COLORS.text },
  row: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 12,
    paddingBottom: 12,
    borderTop: `1px solid ${COLORS.borderSoft}`,
  },
  rowLabel: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.text },
  rowSub: { display: "block", fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  deniedHint: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: COLORS.danger, marginTop: 4 },
  testBtn: { marginTop: 14, backgroundColor: "rgba(0,0,0,0.05)", borderRadius: RADIUS.sm, padding: "11px 12px" },
  testText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.primary, textAlign: "center", display: "block" },
  savingHint: { fontFamily: FONTS.body, fontSize: 10, color: COLORS.textFaint, textAlign: "center", marginTop: 6 },
};
