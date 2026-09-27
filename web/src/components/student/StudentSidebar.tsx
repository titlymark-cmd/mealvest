import React from "react";
import { NavLink } from "react-router-dom";
import { House, UtensilsCrossed, User, LogOut } from "lucide-react";
import { COLORS, FONTS, RADIUS, GRADIENT } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { useWindowSize } from "../../hooks/useWindowSize";
import { SIDEBAR_WIDTH, SIDEBAR_MOBILE_BREAKPOINT } from "../layout/sidebarConfig";
import logo from "../../assets/mealvest-logo.png";

/**
 * Same persistent-sidebar shell as Admin/HotelOwner (see
 * AdminSidebar.tsx / hotel/HotelSidebar.tsx) — three toggles only
 * (Home, Menu, Profile), matching what a student with an active plan
 * actually needs day to day. Focused single-purpose flows (browsing
 * NEW hotels, budget onboarding, the meal-pass QR screen, order
 * history, meal boost) deliberately stay OUTSIDE this shell, same as
 * hotel-owner's own scanner screen does — see StudentRoutes.tsx.
 */
const NAV_ITEMS = [
  { to: "/student/home", label: "Home", icon: House, end: true },
  { to: "/student/menu", label: "Menu", icon: UtensilsCrossed },
  { to: "/student/profile", label: "Profile", icon: User },
];

export const STUDENT_MOBILE_BREAKPOINT = SIDEBAR_MOBILE_BREAKPOINT;
export const STUDENT_SIDEBAR_WIDTH = SIDEBAR_WIDTH;

export function StudentSidebar() {
  const { logout } = useAuth();
  const { width } = useWindowSize();
  const isMobile = width < STUDENT_MOBILE_BREAKPOINT;

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
      </nav>
    );
  }

  return (
    <div style={styles.sidebar}>
      <div style={styles.brandRow}>
        <img src={logo} alt="" style={styles.logo} />
        <span style={styles.brandText}>MEALVEST</span>
      </div>

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
    position: "fixed",
    top: 0,
    left: 0,
    width: STUDENT_SIDEBAR_WIDTH,
    height: "100vh",
    zIndex: 40,
    backgroundColor: COLORS.bgDeep,
    borderRight: `1px solid ${COLORS.border}`,
    display: "flex",
    flexDirection: "column",
    padding: 20,
  },
  brandRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 24 },
  logo: { width: 36, height: 36, borderRadius: RADIUS.sm, objectFit: "cover" },
  brandText: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 16, color: COLORS.textOnDark, letterSpacing: 0.5 },
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
  },
  item: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    padding: "6px 16px",
    borderRadius: 12,
    textDecoration: "none",
    flexShrink: 0,
  },
  itemActive: {
    background: `linear-gradient(90deg, ${GRADIENT[0]}, ${GRADIENT[1]})`,
  },
  label: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 10, color: COLORS.textOnDark },
};
