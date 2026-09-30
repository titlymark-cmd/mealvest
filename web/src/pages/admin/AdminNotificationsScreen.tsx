import React, { useEffect, useState } from "react";
import { Send, Megaphone, FlaskConical } from "lucide-react";
import { Card } from "../../components/Card";
import { Switch } from "../../components/Switch";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { fetchAdminHotels, fetchAdminStudents, AdminHotel, AdminStudent } from "../../services/adminApi";
import { adminBroadcast, adminTestSend, BroadcastAudience } from "../../services/notificationsApi";

type AudienceType = BroadcastAudience["type"];

const AUDIENCE_OPTIONS: { value: AudienceType; label: string }[] = [
  { value: "all_students", label: "All students" },
  { value: "hotel_owners", label: "All hotel owners" },
  { value: "university", label: "Students at a specific institution" },
  { value: "hotel", label: "Students of a specific hotel" },
  { value: "selected_users", label: "Selected students" },
];

/**
 * Admin-only broadcast + test-send console. Hits the same
 * adminBroadcast/adminTestSend endpoints (admin.routes.ts) that
 * already enforce requireRole("mealvest_admin") + a tight rate limit
 * server-side — this screen is just the UI for them, no separate
 * authorization logic needed here.
 */
export default function AdminNotificationsScreen() {
  const { authFetch } = useAuth();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audienceType, setAudienceType] = useState<AudienceType>("all_students");
  const [institution, setInstitution] = useState("");
  const [hotelId, setHotelId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [channels, setChannels] = useState({ push: true, sms: false, inApp: true });
  const [hotels, setHotels] = useState<AdminHotel[]>([]);
  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [testUserId, setTestUserId] = useState("");
  const [testSearch, setTestSearch] = useState("");
  const [testChannel, setTestChannel] = useState<"push" | "sms" | "both">("push");
  const [testMessage, setTestMessage] = useState("This is a test notification from MEALVEST admin.");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminHotels(authFetch).then(setHotels).catch(() => {});
  }, [authFetch]);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (audienceType === "selected_users" && studentSearch.trim().length >= 2) {
        fetchAdminStudents(authFetch, studentSearch.trim()).then(setStudents).catch(() => {});
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [authFetch, audienceType, studentSearch]);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (testSearch.trim().length >= 2) {
        fetchAdminStudents(authFetch, testSearch.trim()).then(setStudents).catch(() => {});
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [authFetch, testSearch]);

  const toggleSelectedUser = (id: string) => {
    setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]));
  };

  const buildAudience = (): BroadcastAudience | null => {
    switch (audienceType) {
      case "all_students":
        return { type: "all_students" };
      case "hotel_owners":
        return { type: "hotel_owners" };
      case "university":
        return institution.trim() ? { type: "university", institution: institution.trim() } : null;
      case "hotel":
        return hotelId ? { type: "hotel", hotelId } : null;
      case "selected_users":
        return selectedUserIds.length > 0 ? { type: "selected_users", userIds: selectedUserIds } : null;
      default:
        return null;
    }
  };

  const handleSend = async () => {
    setError(null);
    setResult(null);
    if (!title.trim() || !body.trim()) {
      setError("Title and message are required.");
      return;
    }
    const audience = buildAudience();
    if (!audience) {
      setError("Choose a valid audience for this audience type.");
      return;
    }
    setSending(true);
    try {
      const queued = await adminBroadcast(authFetch, { title: title.trim(), body: body.trim(), audience, channels });
      setResult(`Queued for ${queued} recipient${queued === 1 ? "" : "s"}.`);
      setTitle("");
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send this broadcast.");
    } finally {
      setSending(false);
    }
  };

  const handleTestSend = async () => {
    setTestError(null);
    setTestResult(null);
    if (!testUserId) {
      setTestError("Pick a recipient first.");
      return;
    }
    if (!testMessage.trim()) {
      setTestError("Message is required.");
      return;
    }
    setTestSending(true);
    try {
      await adminTestSend(authFetch, { userId: testUserId, channel: testChannel, message: testMessage.trim() });
      setTestResult("Test notification sent.");
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Could not send this test notification.");
    } finally {
      setTestSending(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.titleRow}>
        <Megaphone size={20} color={COLORS.primary} />
        <h1 style={styles.title}>Notifications</h1>
      </div>
      <p style={styles.subtitle}>Broadcast a message to students or hotel owners, or send a one-off test to a single account.</p>

      <Card style={styles.card}>
        <span style={styles.cardTitle}>Send a broadcast</span>

        <div style={styles.field}>
          <span style={styles.fieldLabel}>Title</span>
          <input style={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Planned maintenance tonight" />
        </div>

        <div style={styles.field}>
          <span style={styles.fieldLabel}>Message</span>
          <textarea style={styles.textarea} value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} rows={3} placeholder="What do you want to tell them?" />
        </div>

        <div style={styles.field}>
          <span style={styles.fieldLabel}>Audience</span>
          <select style={styles.select} value={audienceType} onChange={(e) => setAudienceType(e.target.value as AudienceType)}>
            {AUDIENCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {audienceType === "university" && (
          <div style={styles.field}>
            <span style={styles.fieldLabel}>Institution name</span>
            <input style={styles.input} value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="e.g. University of Nairobi" />
          </div>
        )}

        {audienceType === "hotel" && (
          <div style={styles.field}>
            <span style={styles.fieldLabel}>Hotel</span>
            <select style={styles.select} value={hotelId} onChange={(e) => setHotelId(e.target.value)}>
              <option value="">Select a hotel…</option>
              {hotels.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>
        )}

        {audienceType === "selected_users" && (
          <div style={styles.field}>
            <span style={styles.fieldLabel}>Search students by name</span>
            <input style={styles.input} value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Type at least 2 letters…" />
            {students.length > 0 && (
              <div style={styles.pickerList}>
                {students.map((s) => (
                  <button key={s.id} onClick={() => toggleSelectedUser(s.id)} style={styles.pickerRow}>
                    <span style={{ ...styles.pickerCheckbox, backgroundColor: selectedUserIds.includes(s.id) ? COLORS.primary : "transparent" }} />
                    <span style={styles.pickerName}>{s.full_name}</span>
                    <span style={styles.pickerEmail}>{s.email}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedUserIds.length > 0 && <span style={styles.selectedCount}>{selectedUserIds.length} selected</span>}
          </div>
        )}

        <div style={styles.channelsRow}>
          <ChannelToggle label="Push" checked={channels.push} onChange={() => setChannels((c) => ({ ...c, push: !c.push }))} />
          <ChannelToggle label="SMS" checked={channels.sms} onChange={() => setChannels((c) => ({ ...c, sms: !c.sms }))} />
          <ChannelToggle label="In-app" checked={channels.inApp} onChange={() => setChannels((c) => ({ ...c, inApp: !c.inApp }))} />
        </div>

        {error && <p style={styles.errorText}>{error}</p>}
        {result && <p style={styles.successText}>{result}</p>}

        <button className="mv-action" onClick={handleSend} disabled={sending} style={styles.sendBtn}>
          <Send size={14} color="#fff" />
          <span style={styles.sendBtnText}>{sending ? "Sending…" : "Send broadcast"}</span>
        </button>
      </Card>

      <Card style={styles.card}>
        <span style={styles.cardTitle}>
          <FlaskConical size={14} color={COLORS.primary} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Send a test notification
        </span>

        <div style={styles.field}>
          <span style={styles.fieldLabel}>Recipient</span>
          <input style={styles.input} value={testSearch} onChange={(e) => setTestSearch(e.target.value)} placeholder="Search students by name…" />
          {students.length > 0 && testSearch.trim().length >= 2 && (
            <div style={styles.pickerList}>
              {students.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setTestUserId(s.id);
                    setTestSearch(s.full_name);
                  }}
                  style={styles.pickerRow}
                >
                  <span style={{ ...styles.pickerCheckbox, backgroundColor: testUserId === s.id ? COLORS.primary : "transparent" }} />
                  <span style={styles.pickerName}>{s.full_name}</span>
                  <span style={styles.pickerEmail}>{s.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={styles.field}>
          <span style={styles.fieldLabel}>Channel</span>
          <select style={styles.select} value={testChannel} onChange={(e) => setTestChannel(e.target.value as "push" | "sms" | "both")}>
            <option value="push">Push only</option>
            <option value="sms">SMS only</option>
            <option value="both">Push and SMS</option>
          </select>
        </div>

        <div style={styles.field}>
          <span style={styles.fieldLabel}>Message</span>
          <textarea style={styles.textarea} value={testMessage} onChange={(e) => setTestMessage(e.target.value)} maxLength={500} rows={2} />
        </div>

        {testError && <p style={styles.errorText}>{testError}</p>}
        {testResult && <p style={styles.successText}>{testResult}</p>}

        <button className="mv-action" onClick={handleTestSend} disabled={testSending} style={styles.testBtn}>
          <span style={styles.testBtnText}>{testSending ? "Sending…" : "Send test"}</span>
        </button>
      </Card>
    </div>
  );
}

function ChannelToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <div style={styles.channelToggle}>
      <span style={styles.channelLabel}>{label}</span>
      <Switch value={checked} onValueChange={onChange} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: "100vh", backgroundColor: COLORS.bg, padding: 24, maxWidth: 640, display: "flex", flexDirection: "column" },
  titleRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 22, color: COLORS.textOnDark, margin: 0 },
  subtitle: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textOnDarkMuted, marginTop: 4, marginBottom: 18 },
  card: { display: "flex", flexDirection: "column", gap: 14, marginBottom: 18 },
  cardTitle: { fontFamily: FONTS.displaySemibold, fontWeight: 700, fontSize: 15, color: COLORS.text },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  fieldLabel: { fontSize: 11, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.textFaint, textTransform: "uppercase", letterSpacing: 0.4 },
  input: {
    backgroundColor: COLORS.cardWhite,
    borderRadius: RADIUS.sm,
    border: `1px solid ${COLORS.borderSoft}`,
    padding: "11px 14px",
    fontSize: 14,
    fontFamily: FONTS.bodyMedium,
    fontWeight: 500,
    color: COLORS.text,
    outline: "none",
    width: "100%",
  },
  textarea: {
    backgroundColor: COLORS.cardWhite,
    borderRadius: RADIUS.sm,
    border: `1px solid ${COLORS.borderSoft}`,
    padding: "11px 14px",
    fontSize: 14,
    fontFamily: FONTS.bodyMedium,
    fontWeight: 500,
    color: COLORS.text,
    outline: "none",
    width: "100%",
    resize: "vertical",
  },
  select: {
    backgroundColor: COLORS.cardWhite,
    borderRadius: RADIUS.sm,
    border: `1px solid ${COLORS.borderSoft}`,
    padding: "11px 14px",
    fontSize: 14,
    fontFamily: FONTS.bodyMedium,
    fontWeight: 500,
    color: COLORS.text,
    outline: "none",
    width: "100%",
  },
  pickerList: {
    display: "flex",
    flexDirection: "column",
    maxHeight: 180,
    overflowY: "auto",
    border: `1px solid ${COLORS.borderSoft}`,
    borderRadius: RADIUS.sm,
  },
  pickerRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "8px 10px",
    borderBottom: `1px solid ${COLORS.borderSoft}`,
    textAlign: "left",
  },
  pickerCheckbox: { width: 14, height: 14, borderRadius: 4, border: `1px solid ${COLORS.borderSoft}`, flexShrink: 0 },
  pickerName: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.text },
  pickerEmail: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted, marginLeft: "auto" },
  selectedCount: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: COLORS.primary },
  channelsRow: { display: "flex", flexDirection: "row", gap: 20 },
  channelToggle: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  channelLabel: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: COLORS.textMuted },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.danger, margin: 0 },
  successText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.success, margin: 0 },
  sendBtn: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    padding: "12px 14px",
  },
  sendBtnText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: "#fff" },
  testBtn: { backgroundColor: "rgba(0,0,0,0.05)", borderRadius: RADIUS.sm, padding: "11px 12px" },
  testBtnText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.primary, textAlign: "center", display: "block" },
};
