import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Search, Mail, Wallet, Store, GraduationCap } from "lucide-react";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { useWindowSize } from "../../hooks/useWindowSize";
import { ADMIN_MOBILE_BREAKPOINT } from "../../components/admin/AdminSidebar";
import { badgeColorFor, formatKsh } from "../../components/admin/adminFormat";
import { fetchAdminStudents, AdminStudent } from "../../services/adminApi";

export default function AdminStudentsScreen() {
  const { authFetch } = useAuth();
  const { width } = useWindowSize();
  const isMobile = width < ADMIN_MOBILE_BREAKPOINT;

  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  const DISPLAY_LIMIT = 30;

  const load = useCallback(async () => {
    try {
      const data = await fetchAdminStudents(authFetch);
      setStudents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load students.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const matched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.full_name.toLowerCase().includes(q));
  }, [students, query]);

  const filtered = matched.slice(0, DISPLAY_LIMIT);
  const hiddenCount = matched.length - filtered.length;

  if (loading) {
    return (
      <div style={styles.center}>
        <Spinner size="large" color={COLORS.primary} />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Students</h1>
      <p style={styles.subtitle}>
        {students.length} student{students.length === 1 ? "" : "s"} registered with MEALVEST.
      </p>

      {error && <p style={styles.errorText}>{error}</p>}

      <div style={{ ...styles.searchBar, borderColor: searchFocused ? "#ff8a3d" : COLORS.borderSoft }}>
        <Search size={16} color={searchFocused ? "#ff8a3d" : COLORS.textMuted} />
        <input
          className="mv-input-plain"
          style={styles.searchInput}
          placeholder="Search students by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          autoCapitalize="none"
        />
      </div>

      {hiddenCount > 0 && (
        <p style={styles.cropNote}>
          Showing {filtered.length} of {matched.length}{query ? " matching" : ""} students — search to find someone specific.
        </p>
      )}

      {filtered.length === 0 ? (
        <Card style={styles.emptyCard}>
          <GraduationCap size={22} color={COLORS.textFaint} />
          <p style={styles.emptyText}>
            {students.length === 0 ? "No students registered yet." : `No students match "${query}".`}
          </p>
        </Card>
      ) : (
        <div style={{ ...styles.grid, gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)" }}>
          {filtered.map((s) => {
            const hasPlan = s.budget_status === "active" && !!s.total_amount;
            return (
              <Card key={s.id} style={styles.studentCard}>
                <div style={styles.avatarRow}>
                  <div style={{ ...styles.avatar, backgroundColor: badgeColorFor(s.id) }}>
                    <span style={styles.avatarText}>{s.full_name.trim().charAt(0).toUpperCase()}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={styles.studentName}>{s.full_name}</span>
                    <div style={styles.emailRow}>
                      <Mail size={11} color={COLORS.textMuted} />
                      <span style={styles.studentEmail}>{s.email}</span>
                    </div>
                  </div>
                </div>

                {hasPlan ? (
                  <div style={styles.planBox}>
                    <div style={styles.planIcon}>
                      <Wallet size={14} color={COLORS.primary} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={styles.planAmount}>{formatKsh(s.total_amount as string)}</span>
                      <span style={styles.planDays}>{s.number_of_days}-day plan</span>
                    </div>
                  </div>
                ) : (
                  <div style={styles.noPlanBox}>
                    <span style={styles.noPlanText}>No active plan</span>
                  </div>
                )}

                <div style={styles.hotelRow}>
                  <Store size={13} color={COLORS.textMuted} />
                  <span style={styles.hotelText}>{s.hotel_name || "No hotel contract"}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, minHeight: "100vh", backgroundColor: COLORS.bg, padding: 24, display: "flex", flexDirection: "column" },
  center: { flex: 1, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 22, color: COLORS.textOnDark, margin: 0 },
  subtitle: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textOnDarkMuted, marginTop: 4, marginBottom: 16 },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger, marginBottom: 12 },
  searchBar: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.cardWhite,
    border: "1px solid",
    borderRadius: RADIUS.pill,
    padding: "10px 16px",
    marginBottom: 12,
    maxWidth: 360,
    transition: "border-color 160ms ease",
  },
  searchInput: {
    flex: 1,
    fontFamily: FONTS.bodyMedium,
    fontWeight: 500,
    fontSize: 13,
    color: COLORS.text,
    border: "none",
    outline: "none",
    backgroundColor: "transparent",
  },
  cropNote: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textOnDarkMuted, marginTop: -4, marginBottom: 16 },
  emptyCard: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 40 },
  emptyText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textFaint, margin: 0, textAlign: "center" },
  grid: { display: "grid", gap: 16, paddingBottom: 24 },
  studentCard: { display: "flex", flexDirection: "column", padding: 16, gap: 12 },
  avatarRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.pill,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 16, color: "#fff" },
  studentName: {
    display: "block",
    fontFamily: FONTS.bodySemibold,
    fontWeight: 600,
    fontSize: 14,
    color: COLORS.text,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  emailRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2, minWidth: 0 },
  studentEmail: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.textMuted,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  planBox: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.accentSoft,
    borderRadius: RADIUS.sm,
    padding: "10px 12px",
  },
  planIcon: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(255,255,255,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  planAmount: { display: "block", fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 14, color: COLORS.text },
  planDays: { display: "block", fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  noPlanBox: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: RADIUS.sm,
    padding: "10px 12px",
    border: `1px dashed ${COLORS.borderSoft}`,
  },
  noPlanText: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textFaint, fontStyle: "italic" },
  hotelRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 4, borderTop: `1px solid ${COLORS.borderSoft}` },
  hotelText: {
    fontFamily: FONTS.bodyMedium,
    fontWeight: 500,
    fontSize: 12,
    color: COLORS.textMuted,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
};
