import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ShieldCheck, Store, User, Eye, EyeOff } from "lucide-react-native";
import { Logo } from "../components/Logo";
import { PrimaryButton } from "../components/PrimaryButton";
import { COLORS, FONTS, RADIUS, GRADIENT } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { ApiError, SettlementInput } from "../services/authApi";

type Mode = "student" | "hotel";

/** A selectable chip — gradient when active, translucent outline otherwise. */
function SelectPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  if (active) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.typePillActive}>
          <Text style={styles.typePillTextActive}>{label}</Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity onPress={onPress} style={styles.typePill} activeOpacity={0.85}>
      <Text style={styles.typePillText}>{label}</Text>
    </TouchableOpacity>
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

export default function RegisterScreen({ navigation, mode }: any & { mode: Mode }) {
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

  const submit = async () => {
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
    <ScrollView contentContainerStyle={styles.container}>
      <Logo size="sm" />
      <View style={styles.iconRow}>
        <View style={styles.modeIcon}>
          {mode === "student" ? <User size={16} color={COLORS.primary} /> : <Store size={16} color={COLORS.primary} />}
        </View>
        <Text style={styles.title}>{mode === "student" ? "Create your MEALVEST account" : "Register your hotel"}</Text>
      </View>
      <Text style={styles.subtitle}>
        {mode === "student" ? "Takes less than a minute." : "Just the essentials for now — you can complete your full profile later."}
      </Text>

      {mode === "student" && (
        <TextInput
          style={styles.input}
          placeholder="Full name"
          placeholderTextColor={COLORS.textOnDarkMuted}
          value={fullName}
          onChangeText={setFullName}
        />
      )}

      <TextInput
        style={styles.input}
        placeholder="Email address"
        placeholderTextColor={COLORS.textOnDarkMuted}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Phone number (07xx xxx xxx)"
        placeholderTextColor={COLORS.textOnDarkMuted}
        keyboardType="phone-pad"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
      />
      <View style={styles.passwordRow}>
        <TextInput
          style={[styles.input, styles.passwordInput]}
          placeholder="Password (at least 8 characters)"
          placeholderTextColor={COLORS.textOnDarkMuted}
          secureTextEntry={!showPassword}
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={() => setShowPassword((v) => !v)}
          accessibilityLabel={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? (
            <EyeOff size={18} color={COLORS.textOnDarkMuted} />
          ) : (
            <Eye size={18} color={COLORS.textOnDarkMuted} />
          )}
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.input}
        placeholder="Create a 4-digit PIN"
        placeholderTextColor={COLORS.textOnDarkMuted}
        secureTextEntry
        keyboardType="number-pad"
        maxLength={4}
        value={pin}
        onChangeText={(text) => setPin(text.replace(/[^0-9]/g, ""))}
      />
      <Text style={styles.pinHint}>Used to quickly unlock the app later without retyping your password.</Text>

      {mode === "hotel" && (
        <>
          <Text style={styles.sectionLabel}>Hotel details</Text>
          <TextInput
            style={styles.input}
            placeholder="Hotel / restaurant name"
            placeholderTextColor={COLORS.textOnDarkMuted}
            value={hotelName}
            onChangeText={setHotelName}
          />
          <View style={styles.wrapRow}>
            {BUSINESS_TYPES.map((t) => (
              <SelectPill key={t.value} label={t.label} active={businessType === t.value} onPress={() => setBusinessType(t.value)} />
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Location / area"
            placeholderTextColor={COLORS.textOnDarkMuted}
            value={location}
            onChangeText={setLocation}
          />

          <Text style={styles.sectionLabel}>Owner details</Text>
          <TextInput
            style={styles.input}
            placeholder="Owner's full name"
            placeholderTextColor={COLORS.textOnDarkMuted}
            value={contactFullName}
            onChangeText={setContactFullName}
          />

          <Text style={styles.sectionLabel}>How do you get paid?</Text>
          <View style={styles.wrapRow}>
            {SETTLEMENT_METHODS.map((m) => (
              <SelectPill key={m.value} label={m.label} active={settlementMethod === m.value} onPress={() => setSettlementMethod(m.value)} />
            ))}
          </View>

          {settlementMethod === "mpesa_till" && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Till number"
                placeholderTextColor={COLORS.textOnDarkMuted}
                keyboardType="number-pad"
                value={tillNumber}
                onChangeText={setTillNumber}
              />
              <TextInput
                style={styles.input}
                placeholder="Name registered on the till"
                placeholderTextColor={COLORS.textOnDarkMuted}
                value={tillName}
                onChangeText={setTillName}
              />
            </>
          )}

          {settlementMethod === "paybill" && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Paybill number"
                placeholderTextColor={COLORS.textOnDarkMuted}
                keyboardType="number-pad"
                value={paybillNumber}
                onChangeText={setPaybillNumber}
              />
              <TextInput
                style={styles.input}
                placeholder="Account number"
                placeholderTextColor={COLORS.textOnDarkMuted}
                value={paybillAccountNumber}
                onChangeText={setPaybillAccountNumber}
              />
              <TextInput
                style={styles.input}
                placeholder="Business name registered on the paybill"
                placeholderTextColor={COLORS.textOnDarkMuted}
                value={paybillBusinessName}
                onChangeText={setPaybillBusinessName}
              />
            </>
          )}

          {settlementMethod === "send_money" && (
            <>
              <TextInput
                style={styles.input}
                placeholder="M-Pesa phone number to receive payments"
                placeholderTextColor={COLORS.textOnDarkMuted}
                keyboardType="phone-pad"
                value={sendMoneyPhone}
                onChangeText={setSendMoneyPhone}
              />
              <TextInput
                style={styles.input}
                placeholder="Name on that M-Pesa account"
                placeholderTextColor={COLORS.textOnDarkMuted}
                value={accountHolderName}
                onChangeText={setAccountHolderName}
              />
              <Text style={styles.pinHint}>
                This number must belong to you or an authorized person at your business — we'll confirm this before
                activating payouts.
              </Text>
            </>
          )}

          {settlementMethod === "pochi_la_biashara" && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Pochi la Biashara phone number"
                placeholderTextColor={COLORS.textOnDarkMuted}
                keyboardType="phone-pad"
                value={pochiPhoneNumber}
                onChangeText={setPochiPhoneNumber}
              />
              <TextInput
                style={styles.input}
                placeholder="Business account name"
                placeholderTextColor={COLORS.textOnDarkMuted}
                value={businessAccountName}
                onChangeText={setBusinessAccountName}
              />
              <TextInput
                style={styles.input}
                placeholder="Registered name"
                placeholderTextColor={COLORS.textOnDarkMuted}
                value={registeredName}
                onChangeText={setRegisteredName}
              />
            </>
          )}

          {settlementMethod === "bank" && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Bank name"
                placeholderTextColor={COLORS.textOnDarkMuted}
                value={bankName}
                onChangeText={setBankName}
              />
              <TextInput
                style={styles.input}
                placeholder="Account name"
                placeholderTextColor={COLORS.textOnDarkMuted}
                value={bankAccountName}
                onChangeText={setBankAccountName}
              />
              <TextInput
                style={styles.input}
                placeholder="Account number"
                placeholderTextColor={COLORS.textOnDarkMuted}
                keyboardType="number-pad"
                value={bankAccountNumber}
                onChangeText={setBankAccountNumber}
              />
              <TextInput
                style={styles.input}
                placeholder="Branch (optional)"
                placeholderTextColor={COLORS.textOnDarkMuted}
                value={bankBranch}
                onChangeText={setBankBranch}
              />
            </>
          )}

          <View style={styles.verifyNote}>
            <ShieldCheck size={14} color={COLORS.success} />
            <Text style={styles.verifyNoteText}>Payment details are verified by an admin before payouts begin.</Text>
          </View>
        </>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <PrimaryButton onPress={submit} loading={loading} showArrow={false} style={{ marginTop: 8 }}>
        Create account
      </PrimaryButton>

      <TouchableOpacity onPress={() => navigation.navigate("Login")}>
        <Text style={styles.link}>Already have an account? Log in</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: COLORS.bg, padding: 24, paddingTop: 56 },
  iconRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 22 },
  modeIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "rgba(252,244,234,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 21, fontFamily: FONTS.displayBold, color: COLORS.textOnDark, flexShrink: 1 },
  subtitle: { fontSize: 13, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted, marginTop: 4, marginBottom: 22 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: FONTS.bodySemibold,
    color: COLORS.textOnDarkMuted,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 6,
  },
  input: {
    backgroundColor: "rgba(252,244,234,0.06)",
    borderRadius: RADIUS.sm,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    fontSize: 15,
    fontFamily: FONTS.bodyMedium,
    color: COLORS.textOnDark,
  },
  pinHint: { fontSize: 11, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted, marginTop: -6, marginBottom: 12 },
  passwordRow: { position: "relative", justifyContent: "center" },
  passwordInput: { paddingRight: 44 },
  eyeButton: { position: "absolute", right: 14, height: "100%", justifyContent: "center", alignItems: "center" },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  typePill: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "rgba(252,244,234,0.05)",
  },
  typePillActive: { borderRadius: RADIUS.pill, paddingVertical: 8, paddingHorizontal: 14 },
  typePillText: { color: COLORS.textOnDarkMuted, fontFamily: FONTS.bodySemibold, fontSize: 12 },
  typePillTextActive: { color: "#fff", fontFamily: FONTS.bodySemibold, fontSize: 12 },
  verifyNote: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  verifyNoteText: { fontSize: 11, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted, flexShrink: 1 },
  error: { color: COLORS.danger, fontSize: 13, marginBottom: 12, fontFamily: FONTS.bodySemibold },
  link: { color: COLORS.primary, fontFamily: FONTS.bodySemibold, fontSize: 13, textAlign: "center", marginTop: 20, marginBottom: 20 },
});
