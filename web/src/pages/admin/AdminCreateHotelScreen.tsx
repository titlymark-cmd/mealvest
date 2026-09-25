import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card } from "../../components/Card";
import { PrimaryButton } from "../../components/PrimaryButton";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { createHotel } from "../../services/adminApi";

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={styles.input} />;
}

export default function AdminCreateHotelScreen() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
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
      navigate(-1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register this hotel.");
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
      <h1 style={styles.title}>Register a hotel</h1>
      <p style={styles.subtitle}>Admin-created hotels go live immediately — no separate approval step.</p>

      <Card style={{ marginTop: 16, display: "flex", flexDirection: "column" }}>
        <Input placeholder="Hotel name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" />
        <Input placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoCapitalize="none" />
        <Input placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />
        <Input placeholder="Owner's full name" value={ownerContactName} onChange={(e) => setOwnerContactName(e.target.value)} />
        <Input placeholder="Admin login username" value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} autoCapitalize="none" />
        <Input placeholder="Password (min 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} type="password" />

        <span style={styles.sectionLabel}>M-PESA TILL</span>
        <Input placeholder="Till number" value={tillNumber} onChange={(e) => setTillNumber(e.target.value)} inputMode="numeric" />
        <Input placeholder="Business name on till" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />

        <span style={styles.sectionLabel}>COMMERCIAL TERMS</span>
        <Input placeholder="Registration fee (KSh)" value={registrationFee} onChange={(e) => setRegistrationFee(e.target.value)} inputMode="numeric" />
        <Input placeholder="Commission % (max 10)" value={commissionPercent} onChange={(e) => setCommissionPercent(e.target.value)} inputMode="numeric" />

        {error && <p style={styles.errorText}>{error}</p>}

        <PrimaryButton onPress={submit} disabled={!valid} loading={saving} showArrow={false} style={{ marginTop: 6 }}>
          Register hotel
        </PrimaryButton>
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, width: "100%", minHeight: "100%", backgroundColor: COLORS.bg, padding: 20, paddingTop: 56, paddingBottom: 40, display: "flex", flexDirection: "column" },
  backRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.primary },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 20, color: COLORS.textOnDark, margin: 0 },
  subtitle: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textOnDarkMuted, marginTop: 4 },
  sectionLabel: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 10, color: COLORS.textFaint, letterSpacing: 0.5, marginTop: 6, marginBottom: 8 },
  input: {
    backgroundColor: COLORS.cardWhite, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.borderSoft}`,
    paddingLeft: 14, paddingRight: 14, paddingTop: 12, paddingBottom: 12, marginBottom: 10, fontSize: 14,
    fontFamily: FONTS.bodyMedium, fontWeight: 500, color: COLORS.text, outline: "none", width: "100%",
  },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.danger, marginBottom: 10 },
};
