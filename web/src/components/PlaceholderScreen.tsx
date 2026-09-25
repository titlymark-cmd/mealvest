import React from "react";
import { LogOut } from "lucide-react";
import { Logo } from "./Logo";
import { COLORS, FONTS, RADIUS } from "../styles/theme";
import { useAuth } from "../context/AuthContext";

export function PlaceholderScreen({ label, note }: { label: string; note?: string }) {
  const { user, logout } = useAuth();

  return (
    <div style={styles.container}>
      <Logo size="sm" />
      <div style={styles.center}>
        <span style={styles.label}>{label}</span>
        {user && (
          <span style={styles.welcome}>
            Signed in as {user.fullName || user.email} ({user.role})
          </span>
        )}
        {note && <span style={styles.note}>{note}</span>}

        <button style={styles.logoutButton} onClick={() => logout()}>
          <LogOut size={15} color={COLORS.danger} />
          <span style={styles.logoutText}>Log out</span>
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 24, paddingTop: 60, display: "flex", flexDirection: "column", minHeight: "100%" },
  center: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  label: { fontSize: 22, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.textOnDark },
  welcome: { fontSize: 13, fontFamily: FONTS.bodyMedium, fontWeight: 500, color: COLORS.accent, marginTop: 10 },
  note: { fontSize: 13, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted, marginTop: 8, textAlign: "center", maxWidth: 260 },
  logoutButton: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 32,
    border: `2px solid ${COLORS.border}`,
    borderRadius: RADIUS.sm,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 28,
    paddingRight: 28,
  },
  logoutText: { color: COLORS.danger, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 14 },
};
