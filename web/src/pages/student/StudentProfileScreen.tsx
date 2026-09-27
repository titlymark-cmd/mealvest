import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User } from "lucide-react";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { fetchStudentProfile, updateStudentProfile, StudentProfile } from "../../services/studentProfileApi";

/** Single row: static label above, either the plain value or (in edit mode) an input. */
function Field({
  label,
  value,
  editing,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange?: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      {editing ? (
        <input
          style={styles.input}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
        />
      ) : (
        <span style={styles.fieldValue}>{value || "—"}</span>
      )}
    </div>
  );
}

export default function StudentProfileScreen() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [alternatePhoneNumber, setAlternatePhoneNumber] = useState("");
  const [institution, setInstitution] = useState("");
  const [admissionNumber, setAdmissionNumber] = useState("");

  const applyProfileToDraft = (p: StudentProfile) => {
    setFullName(p.full_name || "");
    setPhoneNumber(p.phone_number || "");
    setAlternatePhoneNumber(p.alternate_phone_number || "");
    setInstitution(p.institution || "");
    setAdmissionNumber(p.admission_number || "");
  };

  const load = useCallback(async () => {
    try {
      const p = await fetchStudentProfile(authFetch);
      setProfile(p);
      applyProfileToDraft(p);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const startEditing = () => {
    if (profile) applyProfileToDraft(profile);
    setSaveError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    if (profile) applyProfileToDraft(profile);
    setSaveError(null);
    setEditing(false);
  };

  const save = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const updated = await updateStudentProfile(authFetch, {
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        alternatePhoneNumber: alternatePhoneNumber.trim(),
        institution: institution.trim(),
        admissionNumber: admissionNumber.trim(),
      });
      setProfile(updated);
      applyProfileToDraft(updated);
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.container}>
      <button onClick={() => navigate(-1)} style={styles.backRow}>
        <ArrowLeft size={16} color={COLORS.primary} />
        <span style={styles.backText}>Back</span>
      </button>

      <div style={styles.titleRow}>
        <div style={styles.avatarCircle}>
          <User size={20} color={COLORS.primary} />
        </div>
        <h1 style={styles.title}>My Profile</h1>
      </div>

      {loading && (
        <div style={{ marginTop: 30, display: "flex" }}>
          <Spinner color={COLORS.primary} />
        </div>
      )}

      {!loading && loadError && <p style={styles.errorText}>{loadError}</p>}

      {!loading && !loadError && profile && (
        <Card style={styles.card}>
          <Field label="Email" value={profile.email} editing={false} />
          <Field label="Full name" value={editing ? fullName : profile.full_name} editing={editing} onChange={setFullName} />
          <Field
            label="Phone number"
            value={editing ? phoneNumber : profile.phone_number}
            editing={editing}
            onChange={setPhoneNumber}
          />
          <Field
            label="Alternate phone number"
            value={editing ? alternatePhoneNumber : profile.alternate_phone_number || ""}
            editing={editing}
            onChange={setAlternatePhoneNumber}
            placeholder="Optional — e.g. a parent's number"
          />
          <Field
            label="Institution"
            value={editing ? institution : profile.institution || ""}
            editing={editing}
            onChange={setInstitution}
            placeholder="Optional"
          />
          <Field
            label="Admission number"
            value={editing ? admissionNumber : profile.admission_number || ""}
            editing={editing}
            onChange={setAdmissionNumber}
            placeholder="Optional"
          />

          {saveError && <p style={styles.saveErrorText}>{saveError}</p>}

          {editing ? (
            <div style={styles.btnRow}>
              <button style={styles.cancelBtn} onClick={cancelEditing} disabled={saving}>
                <span style={styles.cancelText}>Cancel</span>
              </button>
              <button style={styles.saveBtn} onClick={save} disabled={saving}>
                <span style={styles.saveText}>{saving ? "Saving…" : "Save changes"}</span>
              </button>
            </div>
          ) : (
            <button style={styles.editBtn} onClick={startEditing}>
              <span style={styles.editText}>Edit profile</span>
            </button>
          )}
        </Card>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flexShrink: 0, width: "100%", minHeight: "100%", backgroundColor: COLORS.bg, padding: 20, paddingTop: 56, display: "flex", flexDirection: "column" },
  backRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.primary },
  titleRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(252,244,234,0.06)",
    border: `1px solid ${COLORS.border}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 20, color: COLORS.textOnDark, margin: 0 },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger, textAlign: "center", marginTop: 20 },
  card: { display: "flex", flexDirection: "column", gap: 14 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  fieldLabel: { fontSize: 11, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.textFaint, textTransform: "uppercase", letterSpacing: 0.4 },
  fieldValue: { fontSize: 15, fontFamily: FONTS.bodyMedium, fontWeight: 500, color: COLORS.text },
  input: {
    backgroundColor: COLORS.cardWhite,
    borderRadius: RADIUS.sm,
    border: `1px solid ${COLORS.borderSoft}`,
    padding: "11px 14px",
    fontSize: 15,
    fontFamily: FONTS.bodyMedium,
    fontWeight: 500,
    color: COLORS.text,
    outline: "none",
    width: "100%",
  },
  saveErrorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.danger, margin: "0 0 -6px 0" },
  btnRow: { display: "flex", flexDirection: "row", gap: 8, marginTop: 6 },
  cancelBtn: { flex: 1, backgroundColor: "rgba(0,0,0,0.05)", borderRadius: RADIUS.sm, padding: "11px 12px" },
  cancelText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.textMuted, textAlign: "center", display: "block" },
  saveBtn: { flex: 1, backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, padding: "11px 12px" },
  saveText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: "#fff", textAlign: "center", display: "block" },
  editBtn: { marginTop: 6, backgroundColor: "rgba(0,0,0,0.05)", borderRadius: RADIUS.sm, padding: "11px 12px" },
  editText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.primary, textAlign: "center", display: "block" },
};
