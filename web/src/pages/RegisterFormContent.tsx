import React, { useState } from "react";
import { ShieldCheck, Store, User, Eye, EyeOff } from "lucide-react";
import { Logo } from "../components/Logo";
import { PrimaryButton } from "../components/PrimaryButton";
import { COLORS, FONTS, RADIUS, GRADIENT } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import { ApiError, SettlementInput } from "../services/authApi";

type Mode = "student" | "hotel";

/** A selectable chip — gradient when active, translucent outline otherwise. */
function SelectPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  if (active) {
    return (
      <button type="button" onClick={onPress} style={styles.typePillActive}>
        <span style={styles.typePillTextActive}>{label}</span>
      </button>
    );
  }
  return (
    <button type="button" onClick={onPress} style={styles.typePill}>
      <span style={styles.typePillText}>{label}</span>
    </button>
  );
}

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

/**
 * The actual registration form and its logic — ported unchanged from
 * the original app/src/screens/RegisterFormContent.tsx (same fields,
 * same validation, same registerStudent/registerHotel calls, same
 * settlement-method handling). Only the JSX elements changed
 * (View/TextInput/TouchableOpacity -> div/input/button).
 */
export function RegisterFormContent({ mode, onSwitchToLogin }: { mode: Mode; onSwitchToLogin: () => void }) {
  const { registerStudent, registerHotel } = useAuth();

  // Shared
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pin, setPin] = useState("");

  // Student-only
  const [fullName, setFullName] = useState("");

  // Hotel-only — key fields only for MVP1; the rest (KRA PIN, hours,
  // branch count) are an MVP2 "complete your hotel profile" flow, per
  // explicit scope decision. Settlement method itself covers the
  // common Kenyan business payout options (see settlementMethodSchema
  // on the backend), not just M-Pesa Till.
  const [hotelName, setHotelName] = useState("");
  const [businessType, setBusinessType] = useState("hotel");
  const [location, setLocation] = useState("");
  const [contactFullName, setContactFullName] = useState("");

  // Settlement — how the hotel actually gets paid out. Kenyan
  // businesses use a handful of common collection methods; which
  // fields are required depends on which one is picked (mirrors
  // server/src/schemas/settlementMethodSchema.ts exactly).
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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildSettlement = (): SettlementInput => {
    switch (settlementMethod) {
      case "mpesa_till":
        return {
          method: "mpesa_till",
          tillNumber,
          tillName,
          // The same phone number used to log in doubles as the
          // M-Pesa-registered number — one less field to collect.
          registeredPhoneNumber: phoneNumber,
        };
      case "paybill":
        return {
          method: "paybill",
          paybillNumber,
          accountNumber: paybillAccountNumber,
          paybillBusinessName,
          registeredPhoneNumber: phoneNumber,
        };
      case "send_money":
        return {
          method: "send_money",
          phoneNumber: sendMoneyPhone,
          accountHolderName,
        };
      case "pochi_la_biashara":
        return {
          method: "pochi_la_biashara",
          pochiPhoneNumber,
          businessAccountName,
          registeredName,
        };
      case "bank":
        return {
          method: "bank",
          bankName,
          accountName: bankAccountName,
          accountNumber: bankAccountNumber,
          branch: bankBranch || undefined,
        };
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "student") {
        await registerStudent({ fullName, email: email.trim(), phoneNumber, password, pin });
      } else {
        await registerHotel({
          email: email.trim(),
          phoneNumber,
          password,
          pin,
          hotelName,
          businessType,
          location,
          contactFullName,
          settlement: buildSettlement(),
        });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form style={styles.wrap} onSubmit={submit}>
      <Logo size="sm" />
      <div style={styles.iconRow}>
        <div style={styles.modeIcon}>
          {mode === "student" ? <User size={16} color={COLORS.primary} /> : <Store size={16} color={COLORS.primary} />}
        </div>
        <h1 style={styles.title}>{mode === "student" ? "Create your MEALVEST account" : "Register your hotel"}</h1>
      </div>
      <p style={styles.subtitle}>
        {mode === "student" ? "Takes less than a minute." : "Just the essentials for now — you can complete your full profile later."}
      </p>

      {mode === "student" && (
        <input style={styles.input} placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      )}

      <input
        style={styles.input}
        placeholder="Email address"
        autoCapitalize="none"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        style={styles.input}
        placeholder="Phone number (07xx xxx xxx)"
        type="tel"
        inputMode="tel"
        value={phoneNumber}
        onChange={(e) => setPhoneNumber(e.target.value)}
      />
      <div style={styles.passwordRow}>
        <input
          style={{ ...styles.input, ...styles.passwordInput }}
          placeholder="Password (at least 8 characters)"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="button"
          style={styles.eyeButton}
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? <EyeOff size={18} color={COLORS.textOnDarkMuted} /> : <Eye size={18} color={COLORS.textOnDarkMuted} />}
        </button>
      </div>
      <input
        style={styles.input}
        placeholder="Create a 4-digit PIN"
        type="password"
        inputMode="numeric"
        maxLength={4}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
      />
      <p style={styles.pinHint}>Used to quickly unlock the app later without retyping your password.</p>

      {mode === "hotel" && (
        <>
          <span style={styles.sectionLabel}>Hotel details</span>
          <input
            style={styles.input}
            placeholder="Hotel / restaurant name"
            value={hotelName}
            onChange={(e) => setHotelName(e.target.value)}
          />
          <div style={styles.wrapRow}>
            {BUSINESS_TYPES.map((t) => (
              <SelectPill key={t.value} label={t.label} active={businessType === t.value} onPress={() => setBusinessType(t.value)} />
            ))}
          </div>
          <input style={styles.input} placeholder="Location / area" value={location} onChange={(e) => setLocation(e.target.value)} />

          <span style={styles.sectionLabel}>Owner details</span>
          <input
            style={styles.input}
            placeholder="Owner's full name"
            value={contactFullName}
            onChange={(e) => setContactFullName(e.target.value)}
          />

          <span style={styles.sectionLabel}>How do you get paid?</span>
          <div style={styles.wrapRow}>
            {SETTLEMENT_METHODS.map((m) => (
              <SelectPill key={m.value} label={m.label} active={settlementMethod === m.value} onPress={() => setSettlementMethod(m.value)} />
            ))}
          </div>

          {settlementMethod === "mpesa_till" && (
            <>
              <input
                style={styles.input}
                placeholder="Till number"
                inputMode="numeric"
                value={tillNumber}
                onChange={(e) => setTillNumber(e.target.value)}
              />
              <input
                style={styles.input}
                placeholder="Name registered on the till"
                value={tillName}
                onChange={(e) => setTillName(e.target.value)}
              />
            </>
          )}

          {settlementMethod === "paybill" && (
            <>
              <input
                style={styles.input}
                placeholder="Paybill number"
                inputMode="numeric"
                value={paybillNumber}
                onChange={(e) => setPaybillNumber(e.target.value)}
              />
              <input
                style={styles.input}
                placeholder="Account number"
                value={paybillAccountNumber}
                onChange={(e) => setPaybillAccountNumber(e.target.value)}
              />
              <input
                style={styles.input}
                placeholder="Business name registered on the paybill"
                value={paybillBusinessName}
                onChange={(e) => setPaybillBusinessName(e.target.value)}
              />
            </>
          )}

          {settlementMethod === "send_money" && (
            <>
              <input
                style={styles.input}
                placeholder="M-Pesa phone number to receive payments"
                type="tel"
                inputMode="tel"
                value={sendMoneyPhone}
                onChange={(e) => setSendMoneyPhone(e.target.value)}
              />
              <input
                style={styles.input}
                placeholder="Name on that M-Pesa account"
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
              />
              <p style={styles.pinHint}>
                This number must belong to you or an authorized person at your business — we'll confirm this before activating
                payouts.
              </p>
            </>
          )}

          {settlementMethod === "pochi_la_biashara" && (
            <>
              <input
                style={styles.input}
                placeholder="Pochi la Biashara phone number"
                type="tel"
                inputMode="tel"
                value={pochiPhoneNumber}
                onChange={(e) => setPochiPhoneNumber(e.target.value)}
              />
              <input
                style={styles.input}
                placeholder="Business account name"
                value={businessAccountName}
                onChange={(e) => setBusinessAccountName(e.target.value)}
              />
              <input
                style={styles.input}
                placeholder="Registered name"
                value={registeredName}
                onChange={(e) => setRegisteredName(e.target.value)}
              />
            </>
          )}

          {settlementMethod === "bank" && (
            <>
              <input style={styles.input} placeholder="Bank name" value={bankName} onChange={(e) => setBankName(e.target.value)} />
              <input
                style={styles.input}
                placeholder="Account name"
                value={bankAccountName}
                onChange={(e) => setBankAccountName(e.target.value)}
              />
              <input
                style={styles.input}
                placeholder="Account number"
                inputMode="numeric"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
              />
              <input
                style={styles.input}
                placeholder="Branch (optional)"
                value={bankBranch}
                onChange={(e) => setBankBranch(e.target.value)}
              />
            </>
          )}

          <div style={styles.verifyNote}>
            <ShieldCheck size={14} color={COLORS.success} />
            <span style={styles.verifyNoteText}>Payment details are verified by an admin before payouts begin.</span>
          </div>
        </>
      )}

      {error && <p style={styles.error}>{error}</p>}

      <PrimaryButton onPress={() => {}} loading={loading} showArrow={false} style={{ marginTop: 8 }}>
        Create account
      </PrimaryButton>

      <button type="button" style={styles.linkButton} onClick={onSwitchToLogin}>
        <span style={styles.link}>Already have an account? Log in</span>
      </button>
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { width: "100%", maxWidth: 420, display: "flex", flexDirection: "column" },
  iconRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 8, marginTop: 22 },
  modeIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "rgba(252,244,234,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: { fontSize: 21, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.textOnDark, flexShrink: 1, margin: 0 },
  subtitle: { fontSize: 13, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted, marginTop: 4, marginBottom: 22 },
  sectionLabel: {
    display: "block",
    fontSize: 11,
    fontFamily: FONTS.bodySemibold,
    fontWeight: 600,
    color: COLORS.textOnDarkMuted,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 6,
  },
  input: {
    backgroundColor: "rgba(252,244,234,0.06)",
    borderRadius: RADIUS.sm,
    border: `1.5px solid ${COLORS.border}`,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 14,
    paddingBottom: 14,
    marginBottom: 12,
    fontSize: 15,
    fontFamily: FONTS.bodyMedium,
    fontWeight: 500,
    color: COLORS.textOnDark,
    outline: "none",
    width: "100%",
  },
  pinHint: { fontSize: 11, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted, marginTop: -6, marginBottom: 12 },
  passwordRow: { position: "relative", display: "flex", flexDirection: "column", justifyContent: "center" },
  passwordInput: { paddingRight: 44 },
  eyeButton: { position: "absolute", right: 14, height: "100%", display: "flex", justifyContent: "center", alignItems: "center" },
  wrapRow: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  typePill: {
    border: `1.5px solid ${COLORS.border}`,
    borderRadius: RADIUS.pill,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 14,
    paddingRight: 14,
    backgroundColor: "rgba(252,244,234,0.05)",
  },
  typePillActive: {
    borderRadius: RADIUS.pill,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 14,
    paddingRight: 14,
    border: "none",
    background: `linear-gradient(135deg, ${GRADIENT[0]}, ${GRADIENT[1]})`,
  },
  typePillText: { color: COLORS.textOnDarkMuted, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12 },
  typePillTextActive: { color: "#fff", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12 },
  verifyNote: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  verifyNoteText: { fontSize: 11, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted, flexShrink: 1 },
  error: { color: COLORS.danger, fontSize: 13, marginBottom: 12, marginTop: 0, fontFamily: FONTS.bodySemibold, fontWeight: 600 },
  linkButton: { alignSelf: "center" },
  link: { color: COLORS.primary, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, textAlign: "center", marginTop: 20, marginBottom: 20 },
};
