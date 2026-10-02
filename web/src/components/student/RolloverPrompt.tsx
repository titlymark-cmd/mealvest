import React, { useState } from "react";
import { PiggyBank, Lock } from "lucide-react";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { Budget, confirmRollover } from "../../services/budgetApi";

/**
 * Shown on the student dashboard whenever budget.pending_rollover_amount
 * is > 0 — i.e. there's unused daily balance from a past day waiting
 * on an explicit decision (see budgetService.applyDailyRollover,
 * which no longer auto-credits it). Confirming moves it into
 * banked_amount (spendable today).
 *
 * The "let it go" (forfeit to savings) option is deliberately NOT
 * offered here — permanently destroying a student's unused balance
 * with no real Savings feature to move it into instead was the wrong
 * default. Shown as a locked "Savings" row instead (same inert-lock
 * pattern as the Hotel Transfer MVP2 notice on StudentHomeScreen) —
 * the backend's declineRollover endpoint is untouched and still there
 * to wire up once Savings is real, just not reachable from this UI.
 */
export function RolloverPrompt({ budget, onResolved }: { budget: Budget; onResolved: (updated: Budget) => void }) {
  const { authFetch } = useAuth();
  const [busy, setBusy] = useState<"confirm" | null>(null);
  const amount = Number(budget.pending_rollover_amount);

  const confirm = async () => {
    setBusy("confirm");
    try {
      onResolved(await confirmRollover(authFetch));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(null);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.iconCircle}>
          <PiggyBank size={20} color="#fff" />
        </div>
        <span style={styles.title}>Carry over yesterday's balance?</span>
        <p style={styles.message}>
          You didn't use <strong>KSh {amount.toLocaleString()}</strong> of your daily credit. Carry it over to spend
          today.
        </p>

        <div style={styles.lockedRow}>
          <Lock size={12} color={COLORS.textFaint} />
          <span style={styles.lockedText}>Savings — not operating yet</span>
        </div>

        <button onClick={confirm} disabled={busy !== null} style={styles.confirmBtn}>
          <span style={styles.confirmText}>{busy === "confirm" ? "…" : "Carry it over"}</span>
        </button>
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
    zIndex: 300,
  },
  panel: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    width: "100%",
    maxWidth: 380,
    padding: 24,
    boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 16, color: COLORS.text },
  message: { fontFamily: FONTS.body, fontSize: 14, lineHeight: "20px", color: COLORS.textMuted, marginTop: 8, marginBottom: 4 },
  lockedRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    opacity: 0.65,
  },
  lockedText: { fontFamily: FONTS.bodyMedium, fontWeight: 500, fontSize: 12, color: COLORS.textFaint },
  confirmBtn: { width: "100%", marginTop: 18, backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, padding: "11px 12px" },
  confirmText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: "#fff" },
};
