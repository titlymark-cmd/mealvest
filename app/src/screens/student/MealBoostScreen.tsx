import React, { useState, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Zap, Check } from "lucide-react-native";
import { Card } from "../../components/Card";
import { PrimaryButton } from "../../components/PrimaryButton";
import { COLORS, FONTS, RADIUS } from "../../theme/theme";
import { useAuth } from "../../context/AuthContext";
import { initializeBoostPayment, verifyPayment } from "../../services/paymentsApi";

const PRESETS = [200, 500, 1000, 2000];

type Stage = "form" | "opening_checkout" | "waiting" | "confirming" | "success" | "error";

/**
 * Same verified-payment shape as BudgetOnboardingScreen (initialize ->
 * open Paystack checkout -> poll verify -> only THEN is anything
 * credited) — see that screen's own comment for the full rationale.
 * The only real difference here is what's being paid for: this tops
 * up the plan the student already has, it doesn't start a new one.
 */
export default function MealBoostScreen({ navigation }: any) {
  const { authFetch, user } = useAuth();

  const [amount, setAmount] = useState("500");
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);
  const referenceRef = useRef<string | null>(null);
  const pollAttemptsRef = useRef(0);

  const startPayment = async () => {
    setError(null);
    const boostAmount = Number(amount);

    if (!boostAmount || boostAmount <= 0) return setError("Enter an amount greater than zero.");
    if (phone.replace(/\D/g, "").length < 9) return setError("Enter a valid phone number for M-Pesa.");
    if (!user?.email) return setError("Your account has no email on file — please contact support.");

    setStage("opening_checkout");
    try {
      const { reference, checkoutUrl } = await initializeBoostPayment(authFetch, {
        amount: boostAmount,
        phone: phone.trim(),
        email: user.email,
      });
      referenceRef.current = reference;

      setStage("waiting");
      await WebBrowser.openBrowserAsync(checkoutUrl);
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
          navigation.reset({ index: 0, routes: [{ name: "StudentHome" }] });
        }, 1200);
        return;
      }
      if (result.status === "failed") {
        setError("Payment failed or was cancelled. You have not been charged.");
        setStage("error");
        return;
      }
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
        <Text style={styles.statusText}>Boost confirmed!</Text>
        <Text style={styles.statusSubtext}>Updating your plan…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.iconRow}>
        <View style={styles.modeIcon}>
          <Zap size={16} color={COLORS.primary} />
        </View>
        <Text style={styles.title}>Meal Boost</Text>
      </View>
      <Text style={styles.subtitle}>
        Add a bit more money to your current plan — it goes straight into what's left, so your daily amount goes up
        for the rest of the plan.
      </Text>

      <Text style={styles.label}>How much would you like to add?</Text>
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

      <Text style={[styles.label, { marginTop: 20 }]}>M-Pesa phone number to pay with</Text>
      <TextInput
        style={styles.input}
        keyboardType="phone-pad"
        placeholder="07XX XXX XXX"
        placeholderTextColor={COLORS.textFaint}
        value={phone}
        onChangeText={setPhone}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <PrimaryButton onPress={startPayment} style={{ marginTop: 20, backgroundColor: COLORS.primaryDark }}>
        Boost my plan
      </PrimaryButton>

      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.cancelLink}>Not now</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: COLORS.bg, padding: 20, paddingTop: 60 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg, padding: 24 },
  statusText: { fontFamily: FONTS.displayBold, fontSize: 16, color: COLORS.text, marginTop: 16, textAlign: "center" },
  statusSubtext: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted, marginTop: 6, textAlign: "center" },
  iconRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modeIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "#EFF9FF",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 21, fontFamily: FONTS.displayBold, color: COLORS.text },
  subtitle: { fontSize: 13, fontFamily: FONTS.body, color: COLORS.textMuted, marginTop: 12, marginBottom: 22, lineHeight: 19 },
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
  error: { color: COLORS.danger, fontSize: 13, marginTop: 14, fontFamily: FONTS.bodySemibold, textAlign: "center" },
  cancelLink: { color: COLORS.textMuted, fontFamily: FONTS.bodySemibold, fontSize: 13, textAlign: "center", marginTop: 18 },
});
