import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { Card } from "../../components/Card";
import { PrimaryButton } from "../../components/PrimaryButton";
import { COLORS, FONTS, RADIUS } from "../../theme/theme";
import { useAuth } from "../../context/AuthContext";
import { createHotel } from "../../services/adminApi";

export default function AdminCreateHotelScreen({ navigation }: any) {
  const { authFetch } = useAuth();
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
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register this hotel.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingTop: 56, paddingBottom: 40 }}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
        <ArrowLeft size={16} color={COLORS.primary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Register a hotel</Text>
      <Text style={styles.subtitle}>Admin-created hotels go live immediately — no separate approval step.</Text>

      <Card style={{ marginTop: 16 }}>
        <Input placeholder="Hotel name" value={name} onChangeText={setName} />
        <Input placeholder="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Input placeholder="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <Input placeholder="Location (optional)" value={location} onChangeText={setLocation} />
        <Input placeholder="Owner's full name" value={ownerContactName} onChangeText={setOwnerContactName} />
        <Input placeholder="Admin login username" value={adminUsername} onChangeText={setAdminUsername} autoCapitalize="none" />
        <Input placeholder="Password (min 8 characters)" value={password} onChangeText={setPassword} secureTextEntry />

        <Text style={styles.sectionLabel}>M-PESA TILL</Text>
        <Input placeholder="Till number" value={tillNumber} onChangeText={setTillNumber} keyboardType="numeric" />
        <Input placeholder="Business name on till" value={businessName} onChangeText={setBusinessName} />

        <Text style={styles.sectionLabel}>COMMERCIAL TERMS</Text>
        <Input placeholder="Registration fee (KSh)" value={registrationFee} onChangeText={setRegistrationFee} keyboardType="numeric" />
        <Input placeholder="Commission % (max 10)" value={commissionPercent} onChangeText={setCommissionPercent} keyboardType="numeric" />

        {error && <Text style={styles.errorText}>{error}</Text>}

        <PrimaryButton onPress={submit} disabled={!valid} loading={saving} showArrow={false} style={{ marginTop: 6 }}>
          Register hotel
        </PrimaryButton>
      </Card>
    </ScrollView>
  );
}

function Input(props: any) {
  return (
    <TextInput
      {...props}
      placeholderTextColor={COLORS.textFaint}
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { fontFamily: FONTS.bodySemibold, fontSize: 13, color: COLORS.primary },
  title: { fontFamily: FONTS.displayBold, fontSize: 20, color: COLORS.textOnDark },
  subtitle: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textOnDarkMuted, marginTop: 4 },
  sectionLabel: { fontFamily: FONTS.bodySemibold, fontSize: 10, color: COLORS.textFaint, letterSpacing: 0.5, marginTop: 6, marginBottom: 8 },
  input: {
    backgroundColor: COLORS.cardWhite, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.borderSoft,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10, fontSize: 14, fontFamily: FONTS.bodyMedium, color: COLORS.text,
  },
  errorText: { fontFamily: FONTS.bodySemibold, fontSize: 12, color: COLORS.danger, marginBottom: 10 },
});
