import React, { useState } from "react";
import { PiggyBank } from "lucide-react";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { Budget, confirmRollover, declineRollover } from "../../services/budgetApi";

/**
 * Shown on the student dashboard whenever budget.pending_rollover_amount
 * is > 0 — i.e. there's unused daily balance from a past day waiting
 * on an explicit decision (see budgetService.applyDailyRollover,
 * which no longer auto-credits it). Confirming moves it into
 * banked_amount (spendable today); declining forfeits it for good —
 * both are one-way, so this blocks the dashboard underneath until
 * answered, same as the announcement popup.
 */
export function RolloverPrompt({ budget, onResolved }: { budget: Budget; onResolved: (updated: Budget) => void }) {
  const { authFetch } = useAuth();
  const [busy, setBusy] = useState<"confirm" | "decline" | null>(null);
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

  const decline = async () => {
    const sure = window.confirm(
      `Are you sure? KSh ${amount.toLocaleString()} will be permanently lost — this can't be undone.`
    );
    if (!sure) return;
    setBusy("decline");
    try {
      onResolved(await declineRollover(authFetch));
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
          today, or let it go.
        </p>
        <div style={styles.btnRow}>
          <button onClick={decline} disabled={busy !== null} style={styles.declineBtn}>
            <span style={styles.declineText}>{busy === "decline" ? "…" : "Let it go"}</span>
          </button>
          <button onClick={confirm} disabled={busy !== null} style={styles.confirmBtn}>
            <span style={styles.confirmText}>{busy === "confirm" ? "…" : "Carry it over"}</span>
          </button>
        </div>
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
  btnRow: { display: "flex", flexDirection: "row", gap: 10, marginTop: 18, width: "100%" },
  declineBtn: { flex: 1, backgroundColor: "rgba(0,0,0,0.05)", borderRadius: RADIUS.sm, padding: "11px 12px" },
  declineText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.textMuted },
  confirmBtn: { flex: 1, backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, padding: "11px 12px" },
  confirmText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: "#fff" },
};
