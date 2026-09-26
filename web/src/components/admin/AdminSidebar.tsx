import React from "react";
import { NavLink } from "react-router-dom";
import { TrendingUp, Building2, ShoppingBag, CreditCard, LogOut } from "lucide-react";
import { COLORS, FONTS, RADIUS, GRADIENT } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { useWindowSize } from "../../hooks/useWindowSize";
import logo from "../../assets/mealvest-logo.png";

const NAV_ITEMS = [
  { to: "/admin/home", label: "Overview", icon: TrendingUp, end: true },
  { to: "/admin/hotels", label: "Hotels", icon: Building2 },
  { to: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { to: "/admin/payments", label: "Payments", icon: CreditCard },
];

// Below this, the vertical sidebar becomes a floating bottom tab bar —
// same breakpoint spirit as AuthScreen's own desktop/mobile split.
export const ADMIN_MOBILE_BREAKPOINT = 768;

export function AdminSidebar() {
  const { logout } = useAuth();
  const { width } = useWindowSize();
  const isMobile = width < ADMIN_MOBILE_BREAKPOINT;

  if (isMobile) {
    return (
      <nav style={mobileStyles.bar}>
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            style={({ isActive }) => ({
              ...mobileStyles.item,
              ...(isActive ? mobileStyles.itemActive : null),
            })}
          >
            <Icon size={18} color={COLORS.textOnDark} />
            <span style={mobileStyles.label}>{label}</span>
          </NavLink>
        ))}
        <button onClick={() => logout()} style={mobileStyles.item}>
          <LogOut size={18} color={COLORS.danger} />
          <span style={{ ...mobileStyles.label, color: COLORS.danger }}>Log out</span>
        </button>
      </nav>
    );
  }

  return (
    <div style={styles.sidebar}>
      <div style={styles.brandRow}>
        <img src={logo} alt="" style={styles.logo} />
        <span style={styles.brandText}>MEALVEST</span>
      </div>
      <span style={styles.tagline}>Platform overview</span>

      <nav style={styles.nav}>
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            style={({ isActive }) => ({
              ...styles.navItem,
              ...(isActive ? styles.navItemActive : null),
            })}
          >
            <Icon size={17} color={COLORS.textOnDark} />
            <span style={styles.navLabel}>{label}</span>
          </NavLink>
        ))}
      </nav>

      <button onClick={() => logout()} style={styles.logoutRow}>
        <LogOut size={16} color={COLORS.danger} />
        <span style={styles.logoutText}>Log out</span>
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 232,
    flexShrink: 0,
    minHeight: "100vh",
    backgroundColor: COLORS.bgDeep,
    borderRight: `1px solid ${COLORS.border}`,
    display: "flex",
    flexDirection: "column",
    padding: 20,
  },
  brandRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 36, height: 36, borderRadius: RADIUS.sm, objectFit: "cover" },
  brandText: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 16, color: COLORS.textOnDark, letterSpacing: 0.5 },
  tagline: { display: "block", fontFamily: FONTS.body, fontSize: 12, color: COLORS.textOnDarkMuted, marginTop: 8, marginBottom: 20 },
  nav: { display: "flex", flexDirection: "column", gap: 4, flex: 1 },
  navItem: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: RADIUS.sm,
    textDecoration: "none",
  },
  navItemActive: {
    background: `linear-gradient(90deg, ${GRADIENT[0]}, ${GRADIENT[1]})`,
  },
  navLabel: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.textOnDark },
  logoutRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 10, padding: "10px 12px", marginTop: "auto" },
  logoutText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger },
};

// Floating pill bar pinned to the bottom of the viewport — sized to
// its content (icon + label per item), not stretched edge to edge.
const mobileStyles: Record<string, React.CSSProperties> = {
  bar: {
    position: "fixed",
    left: 14,
    right: 14,
    bottom: 14,
    zIndex: 50,
    backgroundColor: COLORS.bgDeep,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 16,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    padding: "8px 6px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
    overflowX: "auto",
  },
  item: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    padding: "6px 10px",
    borderRadius: 12,
    textDecoration: "none",
    flexShrink: 0,
  },
  itemActive: {
    background: `linear-gradient(90deg, ${GRADIENT[0]}, ${GRADIENT[1]})`,
  },
  label: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 10, color: COLORS.textOnDark },
};
