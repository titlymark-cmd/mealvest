import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { LogOut, TrendingUp, Sparkles, Receipt, PiggyBank, Zap } from "lucide-react-native";
import { Card } from "../../components/Card";
import { PlateRing } from "../../components/PlateRing";
import { COLORS, FONTS, RADIUS, GRADIENT } from "../../theme/theme";
import { useAuth } from "../../context/AuthContext";
import { getActiveBudget, transferToNextDay, Budget } from "../../services/budgetApi";

export default function StudentHomeScreen({ route, navigation }: any) {
  const { user, logout, authFetch } = useAuth();
  const passedBudget: Budget | undefined = route?.params?.budget;
  const hotelName: string | undefined = route?.params?.hotelName;

  const [budget, setBudget] = useState<Budget | null>(passedBudget || null);
  const [loading, setLoading] = useState(!passedBudget);
  const [error, setError] = useState<string | null>(null);

  const loadBudget = useCallback(async () => {
    try {
      const b = await getActiveBudget(authFetch);
      setBudget(b);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your plan.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    // If we just came from onboarding we already have the budget in
    // route params — no need to refetch immediately. Otherwise (e.g.
    // landing here straight from a silent-refresh app relaunch),
    // fetch it fresh from the server.
    if (!passedBudget) {
      loadBudget();
    }
  }, [passedBudget, loadBudget]);

  const dailyCredit = budget ? Number(budget.daily_allowance) : 0;
  const remaining = budget ? Number(budget.remaining_amount) : 0;
  const spent = budget ? Number(budget.amount_spent) : 0;
  const bankedAmount = budget ? Number(budget.banked_amount) : 0;
  const spentToday = budget ? Number(budget.spent_today) : 0;
  const spendableToday = Math.max(0, dailyCredit + bankedAmount - spentToday);
  const pct = dailyCredit + bankedAmount > 0 ? spentToday / (dailyCredit + bankedAmount) : 0;

  const showRolloverInfo = () => {
    Alert.alert(
      "Carried over from previous days",
      `KSh ${bankedAmount.toLocaleString()} of unused daily allowance has automatically been added to today's balance. ` +
        `You now have KSh ${spendableToday.toLocaleString()} available today.`,
      [{ text: "Got it" }]
    );
  };

  const [transferring, setTransferring] = useState(false);

  const confirmTransferToNextDay = () => {
    if (spendableToday <= 0) return;
    Alert.alert(
      "Move to tomorrow?",
      `KSh ${spendableToday.toLocaleString()} is available today. Are you sure you want to transfer it to tomorrow instead of using it today? ` +
        `It won't be spendable again until tomorrow.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Yes, transfer it", style: "default", onPress: doTransferToNextDay },
      ]
    );
  };

  const doTransferToNextDay = async () => {
    setTransferring(true);
    try {
      const updated = await transferToNextDay(authFetch);
      setBudget(updated);
    } catch (err) {
      Alert.alert("Couldn't transfer", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setTransferring(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.greeting}>Good day 👋</Text>
          <Text style={styles.title}>Your MEALVEST Plan</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {bankedAmount > 0 && (
            <TouchableOpacity style={styles.logoutIcon} onPress={showRolloverInfo}>
              <PiggyBank size={16} color={COLORS.primary} />
              <View style={styles.notifDot} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.logoutIcon} onPress={() => navigation.navigate("OrderHistory")}>
            <Receipt size={16} color={COLORS.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutIcon} onPress={() => logout()}>
            <LogOut size={18} color={COLORS.danger} />
          </TouchableOpacity>
        </View>
      </View>

      {user && <Text style={styles.welcome}>Signed in as {user.fullName || user.email}</Text>}

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      )}

      {!loading && error && (
        <Card style={{ marginTop: 20 }}>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      )}

      {!loading && !error && budget && (
        <>
          <Card style={styles.ringCard}>
            <PlateRing pct={pct}>
              <Text style={styles.ringLabel}>DAILY CREDIT</Text>
              <Text style={styles.ringValue}>KSh {dailyCredit.toLocaleString()}</Text>
            </PlateRing>
            <View style={styles.ringFooterRow}>
              <View style={styles.ringFooterItem}>
                <Text style={styles.ringFooterLabel}>Spent today</Text>
                <Text style={styles.ringFooterValue}>KSh {spentToday.toLocaleString()}</Text>
              </View>
              <View style={styles.ringDivider} />
              <TouchableOpacity
                style={styles.ringFooterItem}
                onPress={confirmTransferToNextDay}
                disabled={spendableToday <= 0 || transferring}
                activeOpacity={0.6}
              >
                <Text style={styles.ringFooterLabel}>
                  Available today{spendableToday > 0 ? " · tap" : ""}
                </Text>
                <Text style={[styles.ringFooterValue, { color: COLORS.primary, textDecorationLine: spendableToday > 0 ? "underline" : "none" }]}>
                  {transferring ? "…" : `KSh ${spendableToday.toLocaleString()}`}
                </Text>
              </TouchableOpacity>
            </View>
            {bankedAmount > 0 && (
              <TouchableOpacity onPress={showRolloverInfo} style={styles.rolloverBanner}>
                <PiggyBank size={13} color={COLORS.primary} />
                <Text style={styles.rolloverBannerText}>
                  KSh {bankedAmount.toLocaleString()} carried over from previous days
                </Text>
              </TouchableOpacity>
            )}
          </Card>

          <View style={styles.statsRow}>
            <Card style={styles.statCard}>
              <TrendingUp size={16} color={COLORS.primary} />
              <Text style={styles.statLabel}>Total budget</Text>
              <Text style={styles.statValue}>KSh {Number(budget.total_amount).toLocaleString()}</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={styles.statEmoji}>📅</Text>
              <Text style={styles.statLabel}>Plan length</Text>
              <Text style={styles.statValue}>
                {budget.remainingDays ?? budget.number_of_days} / {budget.number_of_days} days left
              </Text>
            </Card>
          </View>

          <TouchableOpacity style={styles.boostCard} onPress={() => navigation.navigate("MealBoost")} activeOpacity={0.85}>
            <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.boostIconCircle}>
              <Zap size={16} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.boostTitle}>Meal Boost</Text>
              <Text style={styles.boostSubtitle}>Feeling short? Add a bit more to raise your daily amount.</Text>
            </View>
          </TouchableOpacity>

          {hotelName && (
            <Card style={styles.hotelCard}>
              <Text style={styles.hotelLabel}>Your hotel</Text>
              <Text style={styles.hotelValue}>{hotelName}</Text>
            </Card>
          )}

          <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.aiCard}>
            <View style={styles.aiHeader}>
              <Sparkles size={15} color="#fff" />
              <Text style={styles.aiHeaderText}>MEALVEST AI</Text>
            </View>
            <Text style={styles.aiText}>
              You're all set for today — KSh {dailyCredit.toLocaleString()} is ready whenever you're hungry.
            </Text>
          </LinearGradient>
        </>
      )}

      {!loading && !error && !budget && (
        <Card style={{ marginTop: 20 }}>
          <Text style={styles.note}>
            You don't have an active meal plan yet. Ordering will bring you back through hotel selection to set one up.
          </Text>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  greeting: { fontSize: 13, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted },
  title: { fontSize: 21, fontFamily: FONTS.displayBold, color: COLORS.textOnDark, marginTop: 2 },
  logoutIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(252,244,234,0.06)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  notifDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.danger,
    borderWidth: 1.5,
    borderColor: COLORS.bg,
  },
  rolloverBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    backgroundColor: COLORS.accentSoft,
    borderRadius: RADIUS.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  rolloverBannerText: { fontSize: 11, fontFamily: FONTS.bodySemibold, color: COLORS.primary },
  welcome: { fontSize: 12, fontFamily: FONTS.bodyMedium, color: COLORS.accent, marginTop: 6, marginBottom: 16 },
  center: { alignItems: "center", paddingVertical: 40 },
  note: { fontSize: 13, fontFamily: FONTS.body, color: COLORS.textMuted, textAlign: "center" },
  errorText: { fontSize: 13, fontFamily: FONTS.bodySemibold, color: COLORS.danger, textAlign: "center" },
  ringCard: { alignItems: "center", marginTop: 8 },
  ringLabel: { fontSize: 10, fontFamily: FONTS.bodySemibold, color: COLORS.primary, textAlign: "center" },
  ringValue: { fontSize: 20, fontFamily: FONTS.displayBold, color: COLORS.text, textAlign: "center", marginTop: 2 },
  ringFooterRow: { flexDirection: "row", width: "100%", marginTop: 16 },
  ringFooterItem: { flex: 1, alignItems: "center" },
  ringFooterLabel: { fontSize: 11, fontFamily: FONTS.body, color: COLORS.textMuted },
  ringFooterValue: { fontSize: 14, fontFamily: FONTS.bodySemibold, color: COLORS.text, marginTop: 2 },
  ringDivider: { width: 1, backgroundColor: COLORS.borderSoft },
  statsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  statCard: { flex: 1 },
  statEmoji: { fontSize: 16 },
  statLabel: { fontSize: 11, fontFamily: FONTS.body, color: COLORS.textMuted, marginTop: 8 },
  statValue: { fontSize: 14, fontFamily: FONTS.displayBold, color: COLORS.text, marginTop: 2 },
  boostCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: 14,
  },
  boostIconCircle: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  boostTitle: { fontSize: 14, fontFamily: FONTS.bodySemibold, color: COLORS.text },
  boostSubtitle: { fontSize: 11, fontFamily: FONTS.body, color: COLORS.textMuted, marginTop: 2 },
  hotelCard: { marginTop: 12 },
  hotelLabel: { fontSize: 11, fontFamily: FONTS.body, color: COLORS.textMuted, textTransform: "uppercase" },
  hotelValue: { fontSize: 15, fontFamily: FONTS.bodySemibold, color: COLORS.text, marginTop: 2 },
  aiCard: { marginTop: 12, borderRadius: RADIUS.sm, padding: 16 },
  aiHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  aiHeaderText: { color: "#fff", fontSize: 11, fontFamily: FONTS.bodySemibold, letterSpacing: 0.5 },
  aiText: { color: "#fff", fontSize: 13, fontFamily: FONTS.body, lineHeight: 19 },
});
