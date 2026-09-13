import React, { useState, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Sparkles, Check } from "lucide-react-native";
import { Card } from "../../components/Card";
import { PrimaryButton } from "../../components/PrimaryButton";
import { COLORS, FONTS, RADIUS } from "../../theme/theme";
import { useAuth } from "../../context/AuthContext";
import { initializePayment, verifyPayment } from "../../services/paymentsApi";

const PRESETS = [2000, 3000, 5000, 12000, 15000];

const DISCLAIMER_TEXT =
  "Before you continue, please understand:\n\n" +
  "• Money committed to your Mealvest plan is intended for meals during the selected plan period.\n" +
  "• Committed funds are not immediately withdrawable or refundable before the plan period ends, except where a supported cancellation policy applies.\n" +
  "• Unused daily meal balance is carried forward automatically according to Mealvest's rules.\n" +
  "• Please review your amount, days, and hotel before confirming.";

type Stage = "form" | "opening_checkout" | "waiting" | "confirming" | "success" | "error";

/**
 * Real Paystack flow, matching exactly what the backend actually
 * enforces:
 *   1. initializePayment() — requires termsAccepted:true, or the
 *      backend rejects the request before Paystack is ever contacted.
 *   2. Open the returned checkoutUrl in a real browser — this is the
 *      ONLY place money can actually move; nothing in this screen can
 *      mark a payment successful on its own.
 *   3. After the browser closes, poll verifyPayment() — which calls
 *      Paystack's own API server-side and only THEN activates the
 *      budget. A closed browser tab is not, by itself, evidence of
 *      anything; verify() is the actual source of truth.
 *   4. Timeout after ~90s of polling if Paystack never confirms —
 *      the student can check again later rather than being stuck on
 *      an infinite spinner.
 */
export default function BudgetOnboardingScreen({ route, navigation }: any) {
  const { hotelId, hotelName, selectedItemName, selectedItemPrice } = route.params || {};
  const { authFetch, user } = useAuth();

  const [amount, setAmount] = useState("5000");
  const [days, setDays] = useState("30");
  const [phone, setPhone] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);
  const referenceRef = useRef<string | null>(null);
  const pollAttemptsRef = useRef(0);

  const dailyAllowance = (() => {
    const a = Number(amount);
    const d = Number(days);
    if (!a || !d) return null;
    return Math.round((a / d) * 100) / 100;
  })();

  const startPayment = async () => {
    setError(null);
    const totalAmount = Number(amount);
    const numberOfDays = Number(days);

    if (!totalAmount || totalAmount <= 0) return setError("Enter an amount greater than zero.");
    if (!numberOfDays || numberOfDays <= 0) return setError("Enter at least 1 day.");
    if (phone.replace(/\D/g, "").length < 9) return setError("Enter a valid phone number for M-Pesa.");
    if (!termsAccepted) return setError("Please accept the Mealvest payment terms to continue.");
    if (!user?.email) return setError("Your account has no email on file — please contact support.");

    setStage("opening_checkout");
    try {
      const { reference, checkoutUrl } = await initializePayment(authFetch, {
        amount: totalAmount,
        numberOfDays,
        phone: phone.trim(),
        email: user.email,
        hotelId: hotelId ?? null,
        termsAccepted: true,
      });
      referenceRef.current = reference;

      setStage("waiting");
      await WebBrowser.openBrowserAsync(checkoutUrl);
      // openBrowserAsync resolves once the browser is closed —
      // whether the student actually finished paying or just backed
      // out, we don't know yet. verify() below is what finds out.
      pollForConfirmation();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start payment. Please try again.");
      setStage("error");
    }
  };

  const pollForConfirmation = async () => {
    setStage("confirming");
    pollAttemptsRef.current = 0;
    poll();
  };

  const poll = async () => {
    if (!referenceRef.current) return;
    pollAttemptsRef.current += 1;

    try {
      const result = await verifyPayment(authFetch, referenceRef.current);
      if (result.status === "success") {
        setStage("success");
        setTimeout(() => {
          navigation.reset({ index: 0, routes: [{ name: "StudentHome", params: { hotelName } }] });
        }, 1200);
        return;
      }
      if (result.status === "failed") {
        setError("Payment failed or was cancelled. You have not been charged.");
        setStage("error");
        return;
      }
      // still "pending" — Paystack/M-Pesa confirmation can take a
      // little while; keep checking for up to ~90 seconds total.
      if (pollAttemptsRef.current >= 15) {
        setError(
          "We haven't received confirmation yet. If you completed the payment, check back on your dashboard shortly — it will update automatically once Paystack confirms."
        );
        setStage("error");
        return;
      }
      setTimeout(poll, 6000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check payment status.");
      setStage("error");
    }
  };

  if (stage === "opening_checkout" || stage === "waiting" || stage === "confirming") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.statusText}>
          {stage === "opening_checkout" && "Starting payment…"}
          {stage === "waiting" && "Opening M-Pesa checkout…"}
          {stage === "confirming" && "Confirming your payment…"}
        </Text>
        <Text style={styles.statusSubtext}>
          {stage === "confirming" && "This can take up to a minute — don't close the app."}
        </Text>
      </View>
    );
  }

  if (stage === "success") {
    return (
      <View style={styles.center}>
        <Check size={40} color={COLORS.success} />
        <Text style={styles.statusText}>Payment confirmed!</Text>
        <Text style={styles.statusSubtext}>Setting up your plan…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Set up your plan</Text>
      <Text style={styles.subtitle}>
        {hotelName ? `For ${hotelName}. ` : ""}
        Tell us how much you have and how many days it should cover.
      </Text>

      {selectedItemName && (
        <Card style={styles.chosenCard}>
          <Text style={styles.chosenLabel}>You requested</Text>
          <Text style={styles.chosenItem}>
            {selectedItemName} — KSh {Number(selectedItemPrice).toLocaleString()}
          </Text>
        </Card>
      )}

      <Text style={styles.label}>How much do you have for food?</Text>
      <View style={styles.amountRow}>
        <Text style={styles.currencyPrefix}>KSh</Text>
        <TextInput style={styles.amountInput} keyboardType="numeric" value={amount} onChangeText={setAmount} />
      </View>
      <View style={styles.pillRow}>
        {PRESETS.map((v) => (
          <TouchableOpacity key={v} style={styles.presetPill} onPress={() => setAmount(String(v))}>
            <Text style={styles.presetPillText}>KSh {v.toLocaleString()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.label, { marginTop: 20 }]}>How many days should this cover?</Text>
      <TextInput style={styles.input} keyboardType="numeric" value={days} onChangeText={setDays} />

      <Text style={[styles.label, { marginTop: 20 }]}>M-Pesa phone number to pay with</Text>
      <TextInput
        style={styles.input}
        keyboardType="phone-pad"
        placeholder="07XX XXX XXX"
        placeholderTextColor={COLORS.textFaint}
        value={phone}
        onChangeText={setPhone}
      />

      {dailyAllowance !== null && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Sparkles size={14} color="#fff" />
            <Text style={styles.summaryLabel}>DAILY MEAL CREDIT</Text>
          </View>
          <Text style={styles.summaryValue}>KSh {dailyAllowance.toLocaleString()}/day</Text>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Card style={styles.disclaimerCard}>
        <Text style={styles.disclaimerTitle}>IMPORTANT MEALVEST TERMS</Text>
        <Text style={styles.disclaimerBody}>{DISCLAIMER_TEXT}</Text>
      </Card>

      <TouchableOpacity style={styles.checkboxRow} onPress={() => setTermsAccepted((v) => !v)} activeOpacity={0.7}>
        <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
          {termsAccepted && <Check size={13} color="#fff" strokeWidth={3} />}
        </View>
        <Text style={styles.checkboxLabel}>I have read and understand the Mealvest payment and contract terms.</Text>
      </TouchableOpacity>

      <PrimaryButton onPress={startPayment} disabled={!termsAccepted} style={{ marginTop: 14, backgroundColor: COLORS.primaryDark }}>
        Pay with M-Pesa
      </PrimaryButton>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: COLORS.bg, padding: 20, paddingTop: 60 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg, padding: 24 },
  statusText: { fontFamily: FONTS.displayBold, fontSize: 16, color: COLORS.text, marginTop: 16, textAlign: "center" },
  statusSubtext: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted, marginTop: 6, textAlign: "center" },
  title: { fontSize: 22, fontFamily: FONTS.displayBold, color: COLORS.text },
  subtitle: { fontSize: 13, fontFamily: FONTS.body, color: COLORS.textMuted, marginTop: 4, marginBottom: 24 },
  chosenCard: { marginBottom: 20, backgroundColor: "#EFF9FF" },
  chosenLabel: { fontSize: 11, fontFamily: FONTS.bodySemibold, color: COLORS.textMuted, textTransform: "uppercase" },
  chosenItem: { fontSize: 14, fontFamily: FONTS.bodySemibold, color: COLORS.text, marginTop: 2 },
  label: { fontSize: 13, fontFamily: FONTS.bodySemibold, color: COLORS.text, marginBottom: 8 },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
  },
  currencyPrefix: { fontSize: 16, fontFamily: FONTS.displayBold, color: COLORS.primary, marginRight: 8 },
  amountInput: { flex: 1, fontSize: 18, fontFamily: FONTS.displayBold, color: COLORS.text, paddingVertical: 14 },
  input: {
    backgroundColor: "#fff",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: FONTS.displayBold,
    color: COLORS.text,
  },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  presetPill: { borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.pill, paddingVertical: 6, paddingHorizontal: 12 },
  presetPillText: { color: COLORS.primary, fontFamily: FONTS.bodySemibold, fontSize: 12 },
  summaryCard: { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, padding: 16, marginTop: 24, alignItems: "center" },
  summaryHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  summaryLabel: { color: "#E0F2FE", fontSize: 11, fontFamily: FONTS.bodySemibold, letterSpacing: 0.5 },
  summaryValue: { color: "#fff", fontSize: 20, fontFamily: FONTS.displayBold },
  error: { color: COLORS.danger, fontSize: 13, marginTop: 14, fontFamily: FONTS.bodySemibold, textAlign: "center" },
  disclaimerCard: { marginTop: 22, backgroundColor: "#FFF8EB", borderColor: "#FDE9C0" },
  disclaimerTitle: { fontFamily: FONTS.bodySemibold, fontSize: 11, color: "#92620A", letterSpacing: 0.5, marginBottom: 8 },
  disclaimerBody: { fontFamily: FONTS.body, fontSize: 12, color: "#6B4A08", lineHeight: 18 },
  checkboxRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 14 },
  checkbox: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center", marginTop: 1,
  },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkboxLabel: { flex: 1, fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted, lineHeight: 17 },
});
