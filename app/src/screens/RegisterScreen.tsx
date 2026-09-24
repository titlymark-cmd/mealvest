import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { ShieldCheck, Store, User } from "lucide-react-native";
import { Logo } from "../components/Logo";
import { PrimaryButton } from "../components/PrimaryButton";
import { COLORS, FONTS, RADIUS } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../services/authApi";

type Mode = "student" | "hotel";

const BUSINESS_TYPES = [
  { value: "hotel", label: "Hotel" },
  { value: "restaurant", label: "Restaurant" },
  { value: "cafeteria", label: "Cafeteria" },
  { value: "canteen", label: "Canteen" },
  { value: "food_kiosk", label: "Food Kiosk" },
  { value: "cafe", label: "Café" },
];

export default function RegisterScreen({ navigation, mode }: any & { mode: Mode }) {
  const { registerStudent, registerHotel } = useAuth();

  // Shared
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");

  // Student-only
  const [fullName, setFullName] = useState("");

  // Hotel-only — key fields only for MVP1; the rest (KRA PIN, hours,
  // branch count, other settlement methods) are an MVP2 "complete
  // your hotel profile" flow, per explicit scope decision.
  const [hotelName, setHotelName] = useState("");
  const [businessType, setBusinessType] = useState("hotel");
  const [location, setLocation] = useState("");
  const [contactFullName, setContactFullName] = useState("");
  const [tillNumber, setTillNumber] = useState("");
  const [tillName, setTillName] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          settlement: {
            method: "mpesa_till",
            tillNumber,
            tillName,
            // The same phone number used to log in doubles as the
            // M-Pesa-registered number for MVP1 — one less field to
            // collect. A hotel can register a different number for
            // this later in the MVP2 profile-completion flow.
            registeredPhoneNumber: phoneNumber,
          },
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
          placeholderTextColor={COLORS.textFaint}
          value={fullName}
          onChangeText={setFullName}
        />
      )}

      <TextInput
        style={styles.input}
        placeholder="Email address"
        placeholderTextColor={COLORS.textFaint}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Phone number (07xx xxx xxx)"
        placeholderTextColor={COLORS.textFaint}
        keyboardType="phone-pad"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
      />
      <TextInput
        style={styles.input}
        placeholder="Password (at least 8 characters)"
        placeholderTextColor={COLORS.textFaint}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <TextInput
        style={styles.input}
        placeholder="Create a 4-digit PIN"
        placeholderTextColor={COLORS.textFaint}
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
            placeholderTextColor={COLORS.textFaint}
            value={hotelName}
            onChangeText={setHotelName}
          />
          <View style={styles.wrapRow}>
            {BUSINESS_TYPES.map((t) => (
              <TouchableOpacity
                key={t.value}
                onPress={() => setBusinessType(t.value)}
                style={[styles.typePill, businessType === t.value && styles.typePillActive]}
              >
                <Text style={[styles.typePillText, businessType === t.value && styles.typePillTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Location / area"
            placeholderTextColor={COLORS.textFaint}
            value={location}
            onChangeText={setLocation}
          />

          <Text style={styles.sectionLabel}>Owner details</Text>
          <TextInput
            style={styles.input}
            placeholder="Owner's full name"
            placeholderTextColor={COLORS.textFaint}
            value={contactFullName}
            onChangeText={setContactFullName}
          />

          <Text style={styles.sectionLabel}>Payment details (M-Pesa Till)</Text>
          <TextInput
            style={styles.input}
            placeholder="Till number"
            placeholderTextColor={COLORS.textFaint}
            keyboardType="number-pad"
            value={tillNumber}
            onChangeText={setTillNumber}
          />
          <TextInput
            style={styles.input}
            placeholder="Name registered on the till"
            placeholderTextColor={COLORS.textFaint}
            value={tillName}
            onChangeText={setTillName}
          />

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
    backgroundColor: "#EFF9FF",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 21, fontFamily: FONTS.displayBold, color: COLORS.text, flexShrink: 1 },
  subtitle: { fontSize: 13, fontFamily: FONTS.body, color: COLORS.textMuted, marginTop: 4, marginBottom: 22 },
  sectionLabel: { fontSize: 11, fontFamily: FONTS.bodySemibold, color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 8, marginTop: 6 },
  input: {
    backgroundColor: "#fff",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    fontSize: 15,
    fontFamily: FONTS.bodyMedium,
    color: COLORS.text,
  },
  pinHint: { fontSize: 11, fontFamily: FONTS.body, color: COLORS.textMuted, marginTop: -6, marginBottom: 12 },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  typePill: { borderWidth: 2, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingVertical: 8, paddingHorizontal: 12 },
  typePillActive: { borderColor: COLORS.primary, backgroundColor: "#EFF9FF" },
  typePillText: { color: COLORS.text, fontFamily: FONTS.bodySemibold, fontSize: 12 },
  typePillTextActive: { color: COLORS.primary },
  verifyNote: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  verifyNoteText: { fontSize: 11, fontFamily: FONTS.body, color: COLORS.textMuted, flexShrink: 1 },
  error: { color: COLORS.danger, fontSize: 13, marginBottom: 12, fontFamily: FONTS.bodySemibold },
  link: { color: COLORS.primary, fontFamily: FONTS.bodySemibold, fontSize: 13, textAlign: "center", marginTop: 20, marginBottom: 20 },
});
