import React, { useEffect, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PiggyBank, Zap, Lock, UtensilsCrossed, ChevronRight, Phone, ArrowRightLeft, CalendarDays, Info, RefreshCw, Store } from "lucide-react";
import { Card } from "../../components/Card";
import { PlateRing } from "../../components/PlateRing";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Modal } from "../../components/ui/Modal";
import { COLORS, FONTS, NEU, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { useWindowSize } from "../../hooks/useWindowSize";
import { getActiveBudget, transferToNextDay, getWithdrawalStatus, Budget, WithdrawalStatus } from "../../services/budgetApi";
import { fetchCustomerCarePhone } from "../../services/settingsApi";
import { RolloverPrompt } from "../../components/student/RolloverPrompt";
import { getDailyCreditStatus } from "../../utils/dailyCreditStatus";
import { NotificationPermissionBanner } from "../../components/notifications/NotificationPermissionBanner";

type Dialog = null | "rollover" | "transfer-confirm" | "hotel-switch" | { error: string };

/** Greeting follows the device clock only — it never implies data we don't have. */
function greetingForNow() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function StudentHomeScreen() {
  const { user, authFetch } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { width: viewportWidth } = useWindowSize();
  const ringSize = viewportWidth < 360 ? 80 : 96;
  const passedBudget: Budget | undefined = (location.state as any)?.budget;
  const hotelName: string | undefined = (location.state as any)?.hotelName;

  const [budget, setBudget] = useState<Budget | null>(passedBudget || null);
  const [loading, setLoading] = useState(!passedBudget);
  const [error, setError] = useState<string | null>(null);
  // Savings = the unspent balance (incl. rollover) that becomes
  // withdrawable when the plan ends; the server decides locked/unlocked.
  const [withdrawal, setWithdrawal] = useState<WithdrawalStatus | null>(null);
  // Customer care is a single tap-to-call icon: the number itself is
  // never shown, the tel: link opens the phone app with it pre-filled.
  const [carePhone, setCarePhone] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    fetchCustomerCarePhone()
      .then(setCarePhone)
      .catch(() => setCarePhone(null));
  }, []);

  useEffect(() => {
    getWithdrawalStatus(authFetch)
      .then(setWithdrawal)
      .catch(() => setWithdrawal(null));
  }, [authFetch]);

  const loadBudget = useCallback(async () => {
    setError(null);
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
  const bankedAmount = budget ? Number(budget.banked_amount) : 0;
  const spentToday = budget ? Number(budget.spent_today) : 0;
  const spendableToday = Math.max(0, dailyCredit + bankedAmount - spentToday);
  const todayTotal = dailyCredit + bankedAmount;
  const pct = todayTotal > 0 ? spentToday / todayTotal : 0;
  const dailyCreditStatus = getDailyCreditStatus(spentToday, todayTotal);
  const dailyCreditColor =
    dailyCreditStatus === "unused" ? COLORS.success : dailyCreditStatus === "low" ? COLORS.danger : COLORS.warning;
  // Status is always spelled out in words too — colour is only a supporting signal.
  const statusLabel = dailyCreditStatus === "unused" ? "Nothing spent yet" : dailyCreditStatus === "low" ? "Running low" : "Spending as planned";

  const daysTotal = budget?.number_of_days ?? 0;
  const daysLeft = budget ? budget.remainingDays ?? budget.number_of_days : 0;
  const planProgress = daysTotal > 0 ? Math.min(1, Math.max(0, (daysTotal - daysLeft) / daysTotal)) : 0;

  const doTransferToNextDay = async () => {
    setDialog(null);
    setTransferring(true);
    try {
      const updated = await transferToNextDay(authFetch);
      setBudget(updated);
    } catch (err) {
      setDialog({ error: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setTransferring(false);
    }
  };

  const firstName = (user?.fullName || "").trim().split(/\s+/)[0] || "there";
  const savingsAmount = Number(withdrawal?.availableSavings ?? budget?.remaining_amount ?? 0);
  const savingsOpen = Boolean(withdrawal && !withdrawal.locked);

  return (
    <div className="mv-container" style={styles.page}>
      <NotificationPermissionBanner />

      {budget && Number(budget.pending_rollover_amount) > 0 && <RolloverPrompt budget={budget} onResolved={setBudget} />}

      <div style={styles.headerRow}>
        <div style={{ minWidth: 0 }}>
          <span style={styles.greeting}>{greetingForNow()}</span>
          <h1 style={styles.title}>{firstName}</h1>
        </div>
        {carePhone && (
          <a href={`tel:${carePhone.replace(/\s+/g, "")}`} className="mv-iconbtn" aria-label="Call customer care" title="Call customer care">
            <Phone size={18} aria-hidden />
          </a>
        )}
      </div>

      {loading && (
        <div className="mv-grid-home" aria-busy="true" aria-label="Loading your plan">
          <div className="mv-skel" style={{ height: 300 }} />
          <div className="mv-skel" style={{ height: 220 }} />
        </div>
      )}

      {!loading && error && (
        <Card variant="dark" style={{ textAlign: "center" }}>
          <p role="alert" style={styles.errorText}>
            {error}
          </p>
          <PrimaryButton variant="secondary" showArrow={false} icon={<RefreshCw size={16} aria-hidden />} onPress={() => { setLoading(true); loadBudget(); }} type="button">
            Try again
          </PrimaryButton>
        </Card>
      )}

      {!loading && !error && budget && (
        <div className="mv-grid-home">
          {/* LEFT: what can I spend today? */}
          <div className="mv-stack">
            <Card style={styles.hero}>
              <div style={styles.heroTop}>
                <div style={{ flex: "1 1 110px", minWidth: 0 }}>
                  <span style={styles.heroLabel}>Available today</span>
                  <div style={styles.heroValueRow}>
                    <span style={styles.heroCurrency}>KSh</span>
                    <span style={styles.heroValue}>{spendableToday.toLocaleString()}</span>
                  </div>
                  <span style={{ ...styles.statusPill, color: dailyCreditStatus === "low" ? COLORS.primaryDark : COLORS.successDark }}>
                    <span style={{ ...styles.statusDot, backgroundColor: dailyCreditColor }} aria-hidden />
                    {statusLabel}
                  </span>
                </div>
                <div style={{ flex: "0 0 auto" }} role="img" aria-label={`${Math.round(pct * 100)} percent of today's credit spent`}>
                  <PlateRing pct={pct} size={ringSize} stroke={ringSize < 90 ? 10 : 11} color={dailyCreditColor} trackColor="#E8D9C5">
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <span style={styles.ringPct}>{Math.round(pct * 100)}%</span>
                      <span style={styles.ringSub}>spent</span>
                    </div>
                  </PlateRing>
                </div>
              </div>

              <Card variant="well" style={styles.wellRow}>
                <div style={styles.wellCell}>
                  <span style={styles.cellLabel}>Daily credit</span>
                  <span style={styles.cellValue}>KSh {dailyCredit.toLocaleString()}</span>
                </div>
                <span style={styles.wellDivider} aria-hidden />
                <div style={styles.wellCell}>
                  <span style={styles.cellLabel}>Spent today</span>
                  <span style={styles.cellValue}>KSh {spentToday.toLocaleString()}</span>
                </div>
              </Card>

              {bankedAmount > 0 && (
                <button type="button" onClick={() => setDialog("rollover")} style={styles.rollover}>
                  <PiggyBank size={16} color={COLORS.primary} aria-hidden />
                  <span style={{ flex: 1, textAlign: "left" }}>KSh {bankedAmount.toLocaleString()} carried over from earlier days</span>
                  <Info size={14} color={COLORS.textMuted} aria-hidden />
                </button>
              )}

              <div style={styles.heroActions}>
                <PrimaryButton type="button" onPress={() => navigate("/student/menu")} showArrow={false} icon={<UtensilsCrossed size={18} color="#fff" aria-hidden />}>
                  Order today's meal
                </PrimaryButton>
                <button
                  type="button"
                  style={{ ...styles.softBtn, ...(spendableToday <= 0 || transferring ? styles.softBtnOff : null) }}
                  disabled={spendableToday <= 0 || transferring}
                  onClick={() => setDialog("transfer-confirm")}
                >
                  <ArrowRightLeft size={16} aria-hidden />
                  {transferring ? "Moving…" : "Move today's balance to tomorrow"}
                </button>
              </div>
            </Card>
          </div>

          {/* RIGHT: plan + secondary actions */}
          <div className="mv-stack">
            <Card variant="peach">
              <div style={styles.planHead}>
                <CalendarDays size={18} color={COLORS.primary} aria-hidden />
                <span style={styles.planTitle}>Your plan</span>
              </div>
              <div style={styles.planStats}>
                <div>
                  <span style={styles.cellLabel}>Total budget</span>
                  <span style={styles.planValue}>KSh {Number(budget.total_amount).toLocaleString()}</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={styles.cellLabel}>Days left</span>
                  <span style={styles.planValue}>
                    {daysLeft} <span style={styles.planValueSub}>of {daysTotal}</span>
                  </span>
                </div>
              </div>
              <div
                role="progressbar"
                aria-label="Plan days used"
                aria-valuemin={0}
                aria-valuemax={daysTotal}
                aria-valuenow={Math.max(0, daysTotal - daysLeft)}
                style={styles.track}
              >
                <div style={{ ...styles.trackFill, width: `${Math.max(planProgress * 100, planProgress > 0 ? 4 : 0)}%` }} />
              </div>
              {hotelName && (
                <>
                  <div style={styles.hotelRow}>
                    <Store size={15} color={COLORS.textMuted} aria-hidden />
                    <span style={styles.hotelName}>{hotelName}</span>
                  </div>
                  <button type="button" style={styles.transferRow} onClick={() => setDialog("hotel-switch")}>
                    <span style={styles.transferLeft}>
                      <Lock size={13} aria-hidden /> Switch hotel · KSh 50
                    </span>
                    <span style={styles.mvp2Badge}>Coming soon</span>
                  </button>
                </>
              )}
            </Card>

            <button type="button" className="mv-action" style={styles.tile} onClick={() => navigate("/student/withdraw")}>
              <span style={{ ...styles.tileIcon, background: `linear-gradient(160deg, ${COLORS.accent}, ${COLORS.primaryLight})` }}>
                {savingsOpen ? <PiggyBank size={18} color="#fff" aria-hidden /> : <Lock size={18} color="#fff" aria-hidden />}
              </span>
              <span style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
                <span style={styles.tileTitle}>Savings · KSh {savingsAmount.toLocaleString()}</span>
                <span style={styles.tileSub}>
                  {savingsOpen
                    ? `Your plan has ended — withdraw to M-Pesa (MEALVEST fee ${withdrawal!.feePercent}%).`
                    : withdrawal?.reason === "ALREADY_WITHDRAWN"
                      ? "This plan's savings have been requested."
                      : `Unspent balance incl. rollover. Withdrawable when your plan ends${
                          withdrawal?.contractEndDate
                            ? ` on ${new Date(withdrawal.contractEndDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
                            : ""
                        }.`}
                </span>
              </span>
              <ChevronRight size={18} color={COLORS.textOnDarkMuted} aria-hidden />
            </button>

            <button type="button" className="mv-action" style={styles.tile} onClick={() => navigate("/student/meal-boost")}>
              <span style={{ ...styles.tileIcon, background: `linear-gradient(160deg, ${COLORS.primaryLight}, ${COLORS.primary})` }}>
                <Zap size={18} color="#fff" aria-hidden />
              </span>
              <span style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
                <span style={styles.tileTitle}>Meal Boost</span>
                <span style={styles.tileSub}>Feeling short? Add a bit more to raise your daily amount.</span>
              </span>
              <ChevronRight size={18} color={COLORS.textOnDarkMuted} aria-hidden />
            </button>
          </div>
        </div>
      )}

      {!loading && !error && !budget && (
        <Card style={{ textAlign: "center", padding: 24 }}>
          <span style={styles.emptyIcon}>
            <UtensilsCrossed size={26} color={COLORS.primary} aria-hidden />
          </span>
          <h2 style={styles.emptyTitle}>No meal plan yet</h2>
          <p style={styles.note}>Pick a hotel to set up your plan. Ordering will bring you back through hotel selection.</p>
          {withdrawal?.latestWithdrawal && (
            <p style={{ ...styles.note, marginTop: 10 }}>
              Your last savings withdrawal of KSh {Number(withdrawal.latestWithdrawal.student_amount).toLocaleString()} is{" "}
              <strong>{withdrawal.latestWithdrawal.status}</strong>.
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 18 }}>
            <PrimaryButton type="button" onPress={() => navigate("/student")}>
              Choose a hotel
            </PrimaryButton>
            <button type="button" onClick={() => navigate("/student/payments")} style={styles.textLink}>
              Payments &amp; savings history
            </button>
          </div>
        </Card>
      )}

      {/* ---- Dialogs (replace the browser's native alert/confirm) ---- */}
      <Modal
        open={dialog === "rollover"}
        title="Carried over from previous days"
        icon={<PiggyBank size={22} color={COLORS.primary} aria-hidden />}
        onClose={() => setDialog(null)}
        actions={
          <PrimaryButton type="button" showArrow={false} onPress={() => setDialog(null)}>
            Got it
          </PrimaryButton>
        }
      >
        KSh {bankedAmount.toLocaleString()} of unused daily allowance has automatically been added to today's balance. You now have KSh{" "}
        {spendableToday.toLocaleString()} available today.
      </Modal>

      <Modal
        open={dialog === "transfer-confirm"}
        title="Move to tomorrow?"
        icon={<ArrowRightLeft size={22} color={COLORS.primary} aria-hidden />}
        onClose={() => setDialog(null)}
        actions={
          <>
            <PrimaryButton type="button" showArrow={false} onPress={doTransferToNextDay}>
              Yes, move it
            </PrimaryButton>
            <button type="button" style={styles.cancelBtn} onClick={() => setDialog(null)}>
              Keep it for today
            </button>
          </>
        }
      >
        KSh {spendableToday.toLocaleString()} is available today. Are you sure you want to transfer it to tomorrow instead of using it today? It won't be spendable again until tomorrow.
      </Modal>

      <Modal
        open={dialog === "hotel-switch"}
        title="Hotel transfer is coming soon"
        icon={<Lock size={22} color={COLORS.primary} aria-hidden />}
        onClose={() => setDialog(null)}
        actions={
          <PrimaryButton type="button" showArrow={false} onPress={() => setDialog(null)}>
            OK
          </PrimaryButton>
        }
      >
        Soon you'll be able to switch your active plan to another MealVest hotel for a KSh 50 fee. This isn't available yet.
      </Modal>

      <Modal
        open={typeof dialog === "object" && dialog !== null}
        title="Couldn't move your balance"
        onClose={() => setDialog(null)}
        actions={
          <PrimaryButton type="button" showArrow={false} onPress={() => setDialog(null)}>
            Close
          </PrimaryButton>
        }
      >
        {typeof dialog === "object" && dialog !== null ? dialog.error : ""}
      </Modal>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { paddingTop: 8, display: "flex", flexDirection: "column", gap: 18 },
  headerRow: { display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  greeting: { display: "block", fontSize: 13, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted },
  title: { fontSize: 28, lineHeight: "34px", fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.textOnDark, margin: 0, overflowWrap: "anywhere" },
  errorText: { fontSize: 14, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: "#FF9A82", margin: "0 0 14px" },
  note: { fontSize: 14, lineHeight: "21px", fontFamily: FONTS.body, color: COLORS.textMuted, margin: 0 },

  hero: { borderRadius: RADIUS.xl, padding: 22, display: "flex", flexDirection: "column", gap: 16 },
  heroTop: { display: "flex", flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 },
  heroLabel: { display: "block", fontSize: 13, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.textMuted },
  heroValueRow: { display: "flex", alignItems: "baseline", gap: 6, marginTop: 4, flexWrap: "wrap" },
  heroCurrency: { fontSize: 15, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.textMuted },
  heroValue: { fontSize: "clamp(32px, 10vw, 42px)", lineHeight: 1.1, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.text, fontVariantNumeric: "tabular-nums", letterSpacing: -0.5 },
  statusPill: { display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12, fontFamily: FONTS.bodySemibold, fontWeight: 600 },
  statusDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  ringPct: { display: "block", fontSize: 20, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.text, textAlign: "center", lineHeight: 1 },
  ringSub: { display: "block", fontSize: 10, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.textMuted, textAlign: "center", marginTop: 2 },
  wellRow: { display: "flex", flexDirection: "row", alignItems: "stretch" },
  wellCell: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 },
  wellDivider: { width: 1, margin: "0 14px", backgroundColor: "rgba(150,105,65,0.25)" },
  cellLabel: { display: "block", fontSize: 12, fontFamily: FONTS.body, color: COLORS.textMuted },
  cellValue: { display: "block", fontSize: 16, fontFamily: FONTS.displayBold, fontWeight: 700, color: COLORS.text, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" },
  rollover: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    padding: "8px 14px",
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.accentSoft,
    boxShadow: NEU.creamRaisedSm,
    fontSize: 12,
    fontFamily: FONTS.bodySemibold,
    fontWeight: 600,
    color: COLORS.primaryDark,
    width: "100%",
  },
  heroActions: { display: "flex", flexDirection: "column", gap: 12, marginTop: 2 },
  softBtn: {
    minHeight: 48,
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "10px 16px",
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.card,
    boxShadow: NEU.creamRaisedSm,
    color: COLORS.primaryDark,
    fontFamily: FONTS.bodySemibold,
    fontWeight: 600,
    fontSize: 13,
    textAlign: "center",
  },
  softBtnOff: { opacity: 0.5, boxShadow: "none", cursor: "not-allowed" },

  planHead: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14 },
  planTitle: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 16, color: COLORS.text },
  planStats: { display: "flex", justifyContent: "space-between", gap: 12 },
  planValue: { display: "block", marginTop: 2, fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 20, color: COLORS.text, fontVariantNumeric: "tabular-nums" },
  planValueSub: { fontSize: 13, fontWeight: 600, color: COLORS.textMuted },
  track: { height: 10, borderRadius: 5, marginTop: 14, backgroundColor: "#F2D2B3", boxShadow: NEU.creamInset, overflow: "hidden" },
  trackFill: { height: "100%", borderRadius: 5, background: `linear-gradient(90deg, ${COLORS.primaryLight}, ${COLORS.primary})`, transition: "width 600ms var(--mv-ease)" },
  hotelRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(150,105,65,0.2)" },
  hotelName: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 14, color: COLORS.text, overflowWrap: "anywhere" },
  transferRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 44, marginTop: 4, width: "100%", opacity: 0.75 },
  transferLeft: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontFamily: FONTS.bodyMedium, fontWeight: 500, color: COLORS.textMuted },
  mvp2Badge: { fontSize: 10, fontFamily: FONTS.bodySemibold, fontWeight: 700, color: COLORS.textMuted, backgroundColor: "rgba(150,105,65,0.14)", borderRadius: RADIUS.pill, padding: "4px 10px" },

  tile: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    width: "100%",
    padding: 16,
    borderRadius: RADIUS.lg,
    backgroundColor: NEU.surfaceDark,
    boxShadow: NEU.darkRaised,
    border: "1px solid var(--mv-hairline)",
    color: COLORS.textOnDark,
  },
  tileIcon: { width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.3), inset -2px -2px 4px rgba(0,0,0,0.2)" },
  tileTitle: { display: "block", fontSize: 15, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.textOnDark },
  tileSub: { display: "block", fontSize: 12, lineHeight: "17px", fontFamily: FONTS.body, color: COLORS.textOnDarkMuted, marginTop: 3 },

  emptyIcon: { width: 56, height: 56, margin: "0 auto 14px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: COLORS.accentSoft, boxShadow: NEU.creamInset },
  emptyTitle: { margin: "0 0 6px", fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 20, color: COLORS.text },
  textLink: { minHeight: 44, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.primaryDark },
  cancelBtn: { minHeight: 48, borderRadius: RADIUS.md, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 14, color: COLORS.textMuted },
};
