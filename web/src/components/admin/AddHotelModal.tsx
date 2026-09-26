import React, { useState } from "react";
import { X, Eye, EyeOff } from "lucide-react";
import { PrimaryButton } from "../PrimaryButton";
import { COLORS, FONTS, RADIUS, GRADIENT } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { useWindowSize } from "../../hooks/useWindowSize";
import { createHotel } from "../../services/adminApi";
import { SettlementInput } from "../../services/authApi";

// Narrower than ADMIN_MOBILE_BREAKPOINT on purpose — the modal panel
// itself is capped at 600px wide, so its two-column field rows only
// need to collapse once the panel is actually phone-narrow, not at
// the same breakpoint the full-width sidebar/grid pages use.
const MODAL_NARROW_BREAKPOINT = 640;

// Same 6 types and 5 settlement methods offered on the public hotel
// self-registration form (RegisterFormContent.tsx) — kept in sync so
// both hotel-creation paths collect the same real data.
const BUSINESS_TYPES = [
  { value: "hotel", label: "Hotel" },
  { value: "restaurant", label: "Restaurant" },
  { value: "cafeteria", label: "Cafeteria" },
  { value: "canteen", label: "Canteen" },
  { value: "food_kiosk", label: "Food Kiosk" },
  { value: "cafe", label: "Café" },
];

type SettlementMethod = SettlementInput["method"];

const SETTLEMENT_METHODS: { value: SettlementMethod; label: string }[] = [
  { value: "mpesa_till", label: "M-Pesa Till" },
  { value: "paybill", label: "Paybill" },
  { value: "send_money", label: "Send Money" },
  { value: "pochi_la_biashara", label: "Pochi la Biashara" },
  { value: "bank", label: "Bank Account" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...styles.input, ...props.style }} />;
}

/** A selectable chip — gradient when active, translucent outline otherwise. */
function SelectPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <button type="button" onClick={onPress} style={active ? styles.pillActive : styles.pill}>
      <span style={active ? styles.pillTextActive : styles.pillText}>{label}</span>
    </button>
  );
}

export function AddHotelModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { authFetch } = useAuth();
  const { width } = useWindowSize();
  const isNarrow = width < MODAL_NARROW_BREAKPOINT;

  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("hotel");
  const [location, setLocation] = useState("");
  const [ownerContactName, setOwnerContactName] = useState("");

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);

  // Settlement — mirrors RegisterFormContent.tsx's field set exactly,
  // since both hotel-creation forms submit the same SettlementInput
  // shape to the backend.
  const [settlementMethod, setSettlementMethod] = useState<SettlementMethod>("mpesa_till");
  const [tillNumber, setTillNumber] = useState("");
  const [tillName, setTillName] = useState("");
  const [paybillNumber, setPaybillNumber] = useState("");
  const [paybillAccountNumber, setPaybillAccountNumber] = useState("");
  const [paybillBusinessName, setPaybillBusinessName] = useState("");
  const [sendMoneyPhone, setSendMoneyPhone] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [pochiPhoneNumber, setPochiPhoneNumber] = useState("");
  const [businessAccountName, setBusinessAccountName] = useState("");
  const [registeredName, setRegisteredName] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankBranch, setBankBranch] = useState("");

  const [registrationFee, setRegistrationFee] = useState("500");
  const [commissionPercent, setCommissionPercent] = useState("8");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildSettlement = (): SettlementInput => {
    switch (settlementMethod) {
      case "mpesa_till":
        return { method: "mpesa_till", tillNumber, tillName, registeredPhoneNumber: phone };
      case "paybill":
        return { method: "paybill", paybillNumber, accountNumber: paybillAccountNumber, paybillBusinessName, registeredPhoneNumber: phone };
      case "send_money":
        return { method: "send_money", phoneNumber: sendMoneyPhone, accountHolderName };
      case "pochi_la_biashara":
        return { method: "pochi_la_biashara", pochiPhoneNumber, businessAccountName, registeredName };
      case "bank":
        return { method: "bank", bankName, accountName: bankAccountName, accountNumber: bankAccountNumber, branch: bankBranch || undefined };
    }
  };

  const settlementValid = (() => {
    switch (settlementMethod) {
      case "mpesa_till":
        return tillNumber.trim() && tillName.trim();
      case "paybill":
        return paybillNumber.trim() && paybillAccountNumber.trim() && paybillBusinessName.trim();
      case "send_money":
        return sendMoneyPhone.trim() && accountHolderName.trim();
      case "pochi_la_biashara":
        return pochiPhoneNumber.trim() && businessAccountName.trim() && registeredName.trim();
      case "bank":
        return bankName.trim() && bankAccountName.trim() && bankAccountNumber.trim();
    }
  })();

  const valid =
    name.trim() && ownerContactName.trim() && phone.trim() && email.trim() &&
    adminUsername.trim() && password.length >= 8 && /^\d{4}$/.test(pin) && settlementValid;

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await createHotel(authFetch, {
        name: name.trim(),
        businessType,
        location: location.trim() || undefined,
        ownerContactName: ownerContactName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        adminUsername: adminUsername.trim(),
        password,
        pin,
        payment: buildSettlement(),
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
          <div style={styles.pillRow}>
            {BUSINESS_TYPES.map((t) => (
              <SelectPill key={t.value} label={t.label} active={businessType === t.value} onPress={() => setBusinessType(t.value)} />
            ))}
          </div>

          <span style={styles.sectionLabel}>OWNER DETAILS</span>
          <Field label="Owner's full name">
            <Input value={ownerContactName} onChange={(e) => setOwnerContactName(e.target.value)} placeholder="Full name" />
          </Field>

          <span style={styles.sectionLabel}>LOGIN CREDENTIALS</span>
          <div style={row2Style}>
            <Field label="Phone number">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" placeholder="07XXXXXXXX" />
            </Field>
            <Field label="Email address">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoCapitalize="none" placeholder="hotel@example.com" />
            </Field>
          </div>
          <div style={row2Style}>
            <Field label="Admin login username">
              <Input value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} autoCapitalize="none" placeholder="Username" />
            </Field>
            <Field label="Password">
              <div style={styles.passwordRow}>
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder="Min 8 characters"
                  style={styles.passwordInput}
                />
                <button
                  type="button"
                  style={styles.eyeButton}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} color={COLORS.textMuted} /> : <Eye size={16} color={COLORS.textMuted} />}
                </button>
              </div>
            </Field>
          </div>
          <Field label="4-digit PIN">
            <div style={styles.passwordRow}>
              <Input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                maxLength={4}
                placeholder="e.g. 1234"
                style={styles.passwordInput}
              />
              <button type="button" style={styles.eyeButton} onClick={() => setShowPin((v) => !v)} aria-label={showPin ? "Hide PIN" : "Show PIN"}>
                {showPin ? <EyeOff size={16} color={COLORS.textMuted} /> : <Eye size={16} color={COLORS.textMuted} />}
              </button>
            </div>
          </Field>
          <p style={styles.pinHint}>Lets the owner quickly unlock the app later without retyping their password.</p>

          <span style={styles.sectionLabel}>HOW DO YOU GET PAID?</span>
          <div style={styles.pillRow}>
            {SETTLEMENT_METHODS.map((m) => (
              <SelectPill key={m.value} label={m.label} active={settlementMethod === m.value} onPress={() => setSettlementMethod(m.value)} />
            ))}
          </div>

          {settlementMethod === "mpesa_till" && (
            <div style={row2Style}>
              <Field label="Till number">
                <Input value={tillNumber} onChange={(e) => setTillNumber(e.target.value)} inputMode="numeric" placeholder="e.g. 123456" />
              </Field>
              <Field label="Name registered on the till">
                <Input value={tillName} onChange={(e) => setTillName(e.target.value)} placeholder="Registered till name" />
              </Field>
            </div>
          )}

          {settlementMethod === "paybill" && (
            <>
              <div style={row2Style}>
                <Field label="Paybill number">
                  <Input value={paybillNumber} onChange={(e) => setPaybillNumber(e.target.value)} inputMode="numeric" placeholder="e.g. 400200" />
                </Field>
                <Field label="Account number">
                  <Input value={paybillAccountNumber} onChange={(e) => setPaybillAccountNumber(e.target.value)} placeholder="Account number" />
                </Field>
              </div>
              <Field label="Business name registered on the paybill">
                <Input value={paybillBusinessName} onChange={(e) => setPaybillBusinessName(e.target.value)} placeholder="Business name" />
              </Field>
            </>
          )}

          {settlementMethod === "send_money" && (
            <div style={row2Style}>
              <Field label="M-Pesa phone to receive payments">
                <Input value={sendMoneyPhone} onChange={(e) => setSendMoneyPhone(e.target.value)} type="tel" inputMode="tel" placeholder="07XXXXXXXX" />
              </Field>
              <Field label="Name on that M-Pesa account">
                <Input value={accountHolderName} onChange={(e) => setAccountHolderName(e.target.value)} placeholder="Full name" />
              </Field>
            </div>
          )}

          {settlementMethod === "pochi_la_biashara" && (
            <>
              <div style={row2Style}>
                <Field label="Pochi la Biashara phone number">
                  <Input value={pochiPhoneNumber} onChange={(e) => setPochiPhoneNumber(e.target.value)} type="tel" inputMode="tel" placeholder="07XXXXXXXX" />
                </Field>
                <Field label="Business account name">
                  <Input value={businessAccountName} onChange={(e) => setBusinessAccountName(e.target.value)} placeholder="Business name" />
                </Field>
              </div>
              <Field label="Registered name">
                <Input value={registeredName} onChange={(e) => setRegisteredName(e.target.value)} placeholder="Registered name" />
              </Field>
            </>
          )}

          {settlementMethod === "bank" && (
            <>
              <div style={row2Style}>
                <Field label="Bank name">
                  <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Bank name" />
                </Field>
                <Field label="Account name">
                  <Input value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} placeholder="Account name" />
                </Field>
              </div>
              <div style={row2Style}>
                <Field label="Account number">
                  <Input value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} inputMode="numeric" placeholder="Account number" />
                </Field>
                <Field label="Branch (optional)">
                  <Input value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} placeholder="Branch" />
                </Field>
              </div>
            </>
          )}

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
  passwordRow: { position: "relative", display: "flex", flexDirection: "column", justifyContent: "center" },
  passwordInput: { paddingRight: 40 },
  eyeButton: { position: "absolute", right: 12, height: "100%", display: "flex", justifyContent: "center", alignItems: "center" },
  pinHint: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted, marginTop: -6, marginBottom: 4 },
  pillRow: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  pill: {
    border: `1.5px solid ${COLORS.borderSoft}`,
    borderRadius: RADIUS.pill,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 14,
    paddingRight: 14,
    backgroundColor: COLORS.cardWhite,
  },
  pillActive: {
    borderRadius: RADIUS.pill,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 14,
    paddingRight: 14,
    border: "none",
    background: `linear-gradient(135deg, ${GRADIENT[0]}, ${GRADIENT[1]})`,
  },
  pillText: { color: COLORS.textMuted, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12 },
  pillTextActive: { color: "#fff", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12 },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.danger, margin: "4px 0 12px 0" },
};
