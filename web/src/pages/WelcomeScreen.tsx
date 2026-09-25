import React from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../components/Logo";
import { PrimaryButton } from "../components/PrimaryButton";
import { Spinner } from "../components/Spinner";
import { COLORS, FONTS, RADIUS } from "../styles/theme";
import { useHealthCheck } from "../hooks/useHealthCheck";

export default function WelcomeScreen() {
  const { loading, data, error } = useHealthCheck();
  const navigate = useNavigate();

  return (
    <div style={styles.container}>
      <Logo size="lg" />
      <span style={styles.subtitle}>Your food money, already planned.</span>

      <div style={styles.statusCard}>
        <span style={styles.statusLabel}>Backend connection</span>
        {loading && (
          <div style={styles.row}>
            <Spinner color={COLORS.primary} />
            <span style={styles.statusText}>Checking…</span>
          </div>
        )}
        {!loading && data && (
          <span style={{ ...styles.statusText, ...(data.status === "ok" ? styles.ok : styles.degraded) }}>
            {data.status === "ok" ? "✓ Connected" : "⚠ Degraded"} — DB: {data.db}
          </span>
        )}
        {!loading && error && <span style={{ ...styles.statusText, ...styles.errorText }}>✗ {error}</span>}
      </div>

      <PrimaryButton onPress={() => navigate("/login")} showArrow={false} style={{ width: "100%", marginTop: 28 }}>
        Sign in
      </PrimaryButton>
      <button style={styles.secondaryButton} onClick={() => navigate("/register/student")}>
        <span style={styles.secondaryButtonText}>I'm a student — create account</span>
      </button>
      <button style={styles.linkButton} onClick={() => navigate("/register/hotel")}>
        <span style={styles.link}>Registering a hotel? Sign up here</span>
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    width: "100%",
    backgroundColor: COLORS.bg,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    minHeight: "100%",
  },
  subtitle: { fontSize: 14, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted, marginTop: 6, marginBottom: 28 },
  statusCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.sm,
    padding: 20,
    width: "100%",
    maxWidth: 420,
    border: `1px solid ${COLORS.borderSoft}`,
  },
  statusLabel: { display: "block", fontSize: 12, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.textMuted, marginBottom: 8 },
  row: { display: "flex", flexDirection: "row", alignItems: "center", gap: 8 },
  statusText: { fontSize: 14, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.text },
  ok: { color: COLORS.success },
  degraded: { color: COLORS.warning },
  errorText: { color: COLORS.danger },
  secondaryButton: {
    border: `2px solid ${COLORS.border}`,
    borderRadius: RADIUS.lg,
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 40,
    paddingRight: 40,
    marginTop: 12,
    width: "100%",
    maxWidth: 420,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { color: COLORS.textOnDark, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 14 },
  linkButton: { marginTop: 18 },
  link: { color: COLORS.primary, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13 },
};
