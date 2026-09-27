import React, { useEffect, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LogOut, TrendingUp, Sparkles, Receipt, PiggyBank, Zap, Phone, Lock, User } from "lucide-react";
import { Card } from "../../components/Card";
import { PlateRing } from "../../components/PlateRing";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS, GRADIENT } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { getActiveBudget, transferToNextDay, Budget } from "../../services/budgetApi";
import { fetchCustomerCarePhone } from "../../services/settingsApi";

export default function StudentHomeScreen() {
  const { user, logout, authFetch } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const passedBudget: Budget | undefined = (location.state as any)?.budget;
  const hotelName: string | undefined = (location.state as any)?.hotelName;

  const [budget, setBudget] = useState<Budget | null>(passedBudget || null);
  const [loading, setLoading] = useState(!passedBudget);
  const [error, setError] = useState<string | null>(null);
  const [careOpen, setCareOpen] = useState(false);
  const [carePhone, setCarePhone] = useState<string | null>(null);

  useEffect(() => {
    fetchCustomerCarePhone()
      .then(setCarePhone)
      .catch(() => setCarePhone(null));
  }, []);

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
    // navigation state — no need to refetch immediately. Otherwise
    // (e.g. landing here straight from a silent-refresh app
    // relaunch), fetch it fresh from the server.
    if (!passedBudget) {
      loadBudget();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dailyCredit = budget ? Number(budget.daily_allowance) : 0;
  // `remaining`/`spent` below are computed but unused in the original
  // screen too — kept byte-identical rather than pruned.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const remaining = budget ? Number(budget.remaining_amount) : 0;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const spent = budget ? Number(budget.amount_spent) : 0;
  const bankedAmount = budget ? Number(budget.banked_amount) : 0;
  const spentToday = budget ? Number(budget.spent_today) : 0;
  const spendableToday = Math.max(0, dailyCredit + bankedAmount - spentToday);
  const pct = dailyCredit + bankedAmount > 0 ? spentToday / (dailyCredit + bankedAmount) : 0;

  const showRolloverInfo = () => {
    window.alert(
      "Carried over from previous days\n\n" +
        `KSh ${bankedAmount.toLocaleString()} of unused daily allowance has automatically been added to today's balance. ` +
        `You now have KSh ${spendableToday.toLocaleString()} available today.`
    );
  };

  // Frozen MVP2 feature — no navigation, no API call, matches the
  // backend's own defense-in-depth rejection at POST /student/hotel-transfer.
  const showTransferLockedNotice = () => {
    window.alert(
      "Hotel Transfer — Coming in MVP 2\n\n" +
        "Soon you'll be able to switch your active plan to another MealVest hotel for a KSh 50 fee. This isn't available yet."
    );
  };

  const [transferring, setTransferring] = useState(false);

  const confirmTransferToNextDay = () => {
    if (spendableToday <= 0) return;
    const confirmed = window.confirm(
      "Move to tomorrow?\n\n" +
        `KSh ${spendableToday.toLocaleString()} is available today. Are you sure you want to transfer it to tomorrow instead of using it today? ` +
        `It won't be spendable again until tomorrow.`
    );
    if (confirmed) doTransferToNextDay();
  };

  const doTransferToNextDay = async () => {
    setTransferring(true);
    try {
      const updated = await transferToNextDay(authFetch);
      setBudget(updated);
    } catch (err) {
      window.alert("Couldn't transfer\n\n" + (err instanceof Error ? err.message : "Something went wrong."));
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <div>
          <span style={styles.greeting}>Good day 👋</span>
          <h1 style={styles.title}>Your MEALVEST Plan</h1>
        </div>
        <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
          {bankedAmount > 0 && (
            <button style={styles.logoutIcon} onClick={showRolloverInfo}>
              <PiggyBank size={16} color={COLORS.primary} />
              <div style={styles.notifDot} />
            </button>
          )}
          <button style={styles.logoutIcon} onClick={() => navigate("/student/orders")}>
            <Receipt size={16} color={COLORS.primary} />
          </button>
          <button style={styles.logoutIcon} onClick={() => setCareOpen((v) => !v)} aria-label="Customer Care">
            <Phone size={16} color={COLORS.primary} />
          </button>
          <button style={styles.logoutIcon} onClick={() => navigate("/student/profile")} aria-label="My Profile">
            <User size={16} color={COLORS.primary} />
          </button>
          <button style={styles.logoutIcon} onClick={() => logout()}>
            <LogOut size={18} color={COLORS.danger} />
          </button>
        </div>
      </div>

      {careOpen && (
        <Card style={styles.careCard}>
          <span style={styles.careLabel}>CUSTOMER CARE</span>
          {carePhone ? (
            <>
              <span style={styles.carePhone}>{carePhone}</span>
              <a href={`tel:${carePhone}`} className="mv-action" style={styles.careCallBtn}>
                <Phone size={14} color="#fff" />
                <span style={styles.careCallText}>Call now</span>
              </a>
            </>
          ) : (
            <span style={styles.careUnavailable}>Customer care number is not available right now.</span>
          )}
        </Card>
      )}

      {user && <span style={styles.welcome}>Signed in as {user.fullName || user.email}</span>}

      {loading && (
        <div style={styles.center}>
          <Spinner color={COLORS.primary} />
        </div>
      )}

      {!loading && error && (
        <Card style={{ marginTop: 20 }}>
          <p style={styles.errorText}>{error}</p>
        </Card>
      )}

      {!loading && !error && budget && (
        <>
          <Card style={styles.ringCard}>
            <PlateRing pct={pct}>
              <span style={styles.ringLabel}>DAILY CREDIT</span>
              <span style={styles.ringValue}>KSh {dailyCredit.toLocaleString()}</span>
            </PlateRing>
            <div style={styles.ringFooterRow}>
              <div style={styles.ringFooterItem}>
                <span style={styles.ringFooterLabel}>Spent today</span>
                <span style={styles.ringFooterValue}>KSh {spentToday.toLocaleString()}</span>
              </div>
              <div style={styles.ringDivider} />
              <button style={styles.ringFooterItem} onClick={confirmTransferToNextDay} disabled={spendableToday <= 0 || transferring}>
                <span style={styles.ringFooterLabel}>Available today{spendableToday > 0 ? " · tap" : ""}</span>
                <span
                  style={{
                    ...styles.ringFooterValue,
                    color: COLORS.primary,
                    textDecoration: spendableToday > 0 ? "underline" : "none",
                  }}
                >
                  {transferring ? "…" : `KSh ${spendableToday.toLocaleString()}`}
                </span>
              </button>
            </div>
            {bankedAmount > 0 && (
              <button onClick={showRolloverInfo} style={styles.rolloverBanner}>
                <PiggyBank size={13} color={COLORS.primary} />
                <span style={styles.rolloverBannerText}>KSh {bankedAmount.toLocaleString()} carried over from previous days</span>
              </button>
            )}
          </Card>

          <div style={styles.statsRow}>
            <Card style={styles.statCard}>
              <TrendingUp size={16} color={COLORS.primary} />
              <span style={styles.statLabel}>Total budget</span>
              <span style={styles.statValue}>KSh {Number(budget.total_amount).toLocaleString()}</span>
            </Card>
            <Card style={styles.statCard}>
              <span style={styles.statEmoji}>📅</span>
              <span style={styles.statLabel}>Plan length</span>
              <span style={styles.statValue}>
                {budget.remainingDays ?? budget.number_of_days} / {budget.number_of_days} days left
              </span>
            </Card>
          </div>

          <button className="mv-action" style={styles.boostCard} onClick={() => navigate("/student/meal-boost")}>
            <div style={styles.boostIconCircle}>
              <Zap size={16} color="#fff" />
            </div>
            <div style={{ flex: 1, textAlign: "left" }}>
              <span style={styles.boostTitle}>Meal Boost</span>
              <span style={styles.boostSubtitle}>Feeling short? Add a bit more to raise your daily amount.</span>
            </div>
          </button>

          {hotelName && (
            <Card style={styles.hotelCard}>
              <span style={styles.hotelLabel}>Your hotel</span>
              <span style={styles.hotelValue}>{hotelName}</span>
              <button style={styles.transferRow} onClick={showTransferLockedNotice}>
                <div style={styles.transferLeft}>
                  <Lock size={12} color={COLORS.textFaint} />
                  <span style={styles.transferText}>Switch hotel · KSh 50</span>
                </div>
                <span style={styles.mvp2Badge}>MVP 2</span>
              </button>
            </Card>
          )}

          <div style={styles.aiCard}>
            <div style={styles.aiHeader}>
              <Sparkles size={15} color="#fff" />
              <span style={styles.aiHeaderText}>MEALVEST AI</span>
            </div>
            <p style={styles.aiText}>You're all set for today — KSh {dailyCredit.toLocaleString()} is ready whenever you're hungry.</p>
          </div>
        </>
      )}

      {!loading && !error && !budget && (
        <Card style={{ marginTop: 20 }}>
          <p style={styles.note}>You don't have an active meal plan yet. Ordering will bring you back through hotel selection to set one up.</p>
        </Card>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flexShrink: 0, width: "100%", minHeight: "100%", backgroundColor: COLORS.bg, padding: 20, paddingTop: 60, paddingBottom: 40, display: "flex", flexDirection: "column" },
  headerRow: { display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  greeting: { display: "block", fontSize: 13, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted },
  title: { fontSize: 21, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.textOnDark, margin: 0, marginTop: 2 },
  logoutIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    border: `1px solid ${COLORS.border}`,
    backgroundColor: "rgba(252,244,234,0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    flexShrink: 0,
  },
  notifDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.danger,
    border: `1.5px solid ${COLORS.bg}`,
  },
  rolloverBanner: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    backgroundColor: COLORS.accentSoft,
    borderRadius: RADIUS.sm,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
    width: "100%",
  },
  rolloverBannerText: { fontSize: 11, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.primary },
  welcome: { display: "block", fontSize: 12, fontFamily: FONTS.bodyMedium, fontWeight: 500, color: COLORS.accent, marginTop: 6, marginBottom: 16 },
  center: { display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 40, paddingBottom: 40 },
  note: { fontSize: 13, fontFamily: FONTS.body, color: COLORS.textMuted, textAlign: "center", margin: 0 },
  errorText: { fontSize: 13, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.danger, textAlign: "center", margin: 0 },
  ringCard: { display: "flex", flexDirection: "column", alignItems: "center", marginTop: 8 },
  ringLabel: { display: "block", fontSize: 10, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.primary, textAlign: "center" },
  ringValue: { display: "block", fontSize: 20, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.text, textAlign: "center", marginTop: 2 },
  ringFooterRow: { display: "flex", flexDirection: "row", width: "100%", marginTop: 16 },
  ringFooterItem: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center" },
  ringFooterLabel: { fontSize: 11, fontFamily: FONTS.body, color: COLORS.textMuted },
  ringFooterValue: { fontSize: 14, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.text, marginTop: 2 },
  ringDivider: { width: 1, backgroundColor: COLORS.borderSoft },
  statsRow: { display: "flex", flexDirection: "row", gap: 10, marginTop: 12 },
  statCard: { flex: 1, display: "flex", flexDirection: "column" },
  statEmoji: { fontSize: 16 },
  statLabel: { display: "block", fontSize: 11, fontFamily: FONTS.body, color: COLORS.textMuted, marginTop: 8 },
  statValue: { display: "block", fontSize: 14, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.text, marginTop: 2 },
  boostCard: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.sm,
    border: `1px solid ${COLORS.borderSoft}`,
    padding: 14,
    width: "100%",
  },
  boostIconCircle: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: `linear-gradient(135deg, ${GRADIENT[0]}, ${GRADIENT[1]})`,
    flexShrink: 0,
  },
  boostTitle: { display: "block", fontSize: 14, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.text },
  boostSubtitle: { display: "block", fontSize: 11, fontFamily: FONTS.body, color: COLORS.textMuted, marginTop: 2 },
  hotelCard: { marginTop: 12, display: "flex", flexDirection: "column" },
  hotelLabel: { display: "block", fontSize: 11, fontFamily: FONTS.body, color: COLORS.textMuted, textTransform: "uppercase" },
  hotelValue: { display: "block", fontSize: 15, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.text, marginTop: 2 },
  transferRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 10,
    borderTop: `1px solid ${COLORS.borderSoft}`,
    opacity: 0.65,
  },
  transferLeft: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6 },
  transferText: { fontSize: 12, fontFamily: FONTS.bodyMedium, fontWeight: 500, color: COLORS.textMuted },
  mvp2Badge: {
    fontSize: 9,
    fontFamily: FONTS.bodySemibold,
    fontWeight: 700,
    color: COLORS.textFaint,
    backgroundColor: "rgba(0,0,0,0.06)",
    borderRadius: RADIUS.pill,
    padding: "3px 8px",
    letterSpacing: 0.4,
  },
  careCard: { marginTop: 14, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 },
  careLabel: { fontSize: 10, fontFamily: FONTS.bodySemibold, fontWeight: 700, color: COLORS.textFaint, letterSpacing: 0.6 },
  carePhone: { fontSize: 18, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.text },
  careCallBtn: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    padding: "9px 16px",
  },
  careCallText: { color: "#fff", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12 },
  careUnavailable: { fontSize: 12, fontFamily: FONTS.body, color: COLORS.textMuted },
  aiCard: { marginTop: 12, borderRadius: RADIUS.sm, padding: 16, background: `linear-gradient(135deg, ${GRADIENT[0]}, ${GRADIENT[1]})` },
  aiHeader: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  aiHeaderText: { color: "#fff", fontSize: 11, fontFamily: FONTS.bodySemibold, fontWeight: 600, letterSpacing: 0.5 },
  aiText: { color: "#fff", fontSize: 13, fontFamily: FONTS.body, lineHeight: "19px", margin: 0 },
};
