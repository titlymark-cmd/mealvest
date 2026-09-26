import React, { useState } from "react";
import { X } from "lucide-react";
import { PrimaryButton } from "../PrimaryButton";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { useWindowSize } from "../../hooks/useWindowSize";
import { createHotel } from "../../services/adminApi";

// Narrower than ADMIN_MOBILE_BREAKPOINT on purpose — the modal panel
// itself is capped at 600px wide, so its two-column field rows only
// need to collapse once the panel is actually phone-narrow, not at
// the same breakpoint the full-width sidebar/grid pages use.
const MODAL_NARROW_BREAKPOINT = 640;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={styles.input} />;
}

export function AddHotelModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { authFetch } = useAuth();
  const { width } = useWindowSize();
  const isNarrow = width < MODAL_NARROW_BREAKPOINT;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");
  const [ownerContactName, setOwnerContactName] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tillNumber, setTillNumber] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [registrationFee, setRegistrationFee] = useState("500");
  const [commissionPercent, setCommissionPercent] = useState("8");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    name.trim() && phone.trim() && email.trim() && ownerContactName.trim() &&
    adminUsername.trim() && password.length >= 8 && tillNumber.trim() && businessName.trim();

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await createHotel(authFetch, {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        location: location.trim() || undefined,
        ownerContactName: ownerContactName.trim(),
        adminUsername: adminUsername.trim(),
        password,
        payment: { method: "mpesa_till", tillNumber: tillNumber.trim(), businessName: businessName.trim() },
        registrationFee: Number(registrationFee) || 0,
        commissionPercent: Number(commissionPercent) || 0,
        termsAccepted: true,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register this hotel.");
    } finally {
      setSaving(false);
    }
  };

  const row2Style: React.CSSProperties = { ...styles.row2, gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr" };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={{ minWidth: 0 }}>
            <h2 style={styles.title}>Register a hotel</h2>
            <p style={styles.subtitle}>Admin-created hotels go live immediately — no separate approval step.</p>
          </div>
          <button onClick={onClose} style={styles.closeBtn} aria-label="Close">
            <X size={18} color={COLORS.textMuted} />
          </button>
        </div>

        <div style={styles.body}>
          <span style={styles.sectionLabel}>HOTEL DETAILS</span>
          <div style={row2Style}>
            <Field label="Hotel name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mama Nadia's Kitchen" />
            </Field>
            <Field label="Location (optional)">
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Homa Bay Town" />
            </Field>
          </div>
          <div style={row2Style}>
            <Field label="Phone number">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" placeholder="07XXXXXXXX" />
            </Field>
            <Field label="Email address">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoCapitalize="none" placeholder="hotel@example.com" />
            </Field>
          </div>

          <span style={styles.sectionLabel}>OWNER &amp; LOGIN</span>
          <Field label="Owner's full name">
            <Input value={ownerContactName} onChange={(e) => setOwnerContactName(e.target.value)} placeholder="Full name" />
          </Field>
          <div style={row2Style}>
            <Field label="Admin login username">
              <Input value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} autoCapitalize="none" placeholder="Username" />
            </Field>
            <Field label="Password">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Min 8 characters" />
            </Field>
          </div>

          <span style={styles.sectionLabel}>M-PESA TILL</span>
          <div style={row2Style}>
            <Field label="Till number">
              <Input value={tillNumber} onChange={(e) => setTillNumber(e.target.value)} inputMode="numeric" placeholder="e.g. 123456" />
            </Field>
            <Field label="Business name on till">
              <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Registered till name" />
            </Field>
          </div>

          <span style={styles.sectionLabel}>COMMERCIAL TERMS</span>
          <div style={row2Style}>
            <Field label="Registration fee (KSh)">
              <Input value={registrationFee} onChange={(e) => setRegistrationFee(e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Commission % (max 10)">
              <Input value={commissionPercent} onChange={(e) => setCommissionPercent(e.target.value)} inputMode="numeric" />
            </Field>
          </div>

          {error && <p style={styles.errorText}>{error}</p>}

          <PrimaryButton onPress={submit} disabled={!valid} loading={saving} showArrow={false} style={{ marginTop: 8 }}>
            Register hotel
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(29,21,17,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 200,
  },
  panel: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    width: "100%",
    maxWidth: 600,
    maxHeight: "90vh",
    overflowY: "auto",
    boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    padding: "22px 24px 0 24px",
  },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 19, color: COLORS.text, margin: 0 },
  subtitle: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted, marginTop: 5, lineHeight: "16px" },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(44,22,16,0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: { padding: 24, display: "flex", flexDirection: "column" },
  sectionLabel: {
    display: "block",
    fontFamily: FONTS.bodySemibold,
    fontWeight: 700,
    fontSize: 10,
    color: COLORS.textFaint,
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 10,
  },
  row2: { display: "grid", gap: 12 },
  field: { display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 },
  label: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.text },
  input: {
    backgroundColor: COLORS.cardWhite,
    borderRadius: RADIUS.sm,
    border: `1px solid ${COLORS.borderSoft}`,
    paddingLeft: 14,
    paddingRight: 14,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 14,
    fontFamily: FONTS.bodyMedium,
    fontWeight: 500,
    color: COLORS.text,
    outline: "none",
    width: "100%",
  },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.danger, margin: "4px 0 12px 0" },
};
