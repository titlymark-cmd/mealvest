import React from "react";
import { NavLink } from "react-router-dom";
import { TrendingUp, ShoppingBag, UtensilsCrossed, Users, User, LogOut } from "lucide-react";
import { COLORS, FONTS, RADIUS, GRADIENT } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { useWindowSize } from "../../hooks/useWindowSize";
import { SIDEBAR_WIDTH, SIDEBAR_MOBILE_BREAKPOINT } from "../layout/sidebarConfig";
import logo from "../../assets/mealvest-logo.png";

const NAV_ITEMS = [
  { to: "/hotel-owner/home", label: "Overview", icon: TrendingUp, end: true },
  { to: "/hotel-owner/orders", label: "Orders", icon: ShoppingBag },
  { to: "/hotel-owner/menu", label: "MenuBoard", icon: UtensilsCrossed },
  { to: "/hotel-owner/students", label: "Students", icon: Users },
  { to: "/hotel-owner/profile", label: "Profile", icon: User },
];

export const HOTEL_MOBILE_BREAKPOINT = SIDEBAR_MOBILE_BREAKPOINT;
export const HOTEL_SIDEBAR_WIDTH = SIDEBAR_WIDTH;

export function HotelSidebar() {
  const { logout } = useAuth();
  const { width } = useWindowSize();
  const isMobile = width < HOTEL_MOBILE_BREAKPOINT;

  if (isMobile) {
    // No "Log out" tab here — 5 nav items is already the practical
    // limit for a phone-width bar (same call made for the admin
    // dashboard). Logout instead lives on the Overview banner.
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
      <span style={styles.tagline}>Hotel dashboard</span>

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
    width: HOTEL_SIDEBAR_WIDTH,
    height: "100vh",
    zIndex: 40,
    backgroundColor: COLORS.bgDeep,
    borderRight: `1px solid ${COLORS.border}`,
    display: "flex",
    flexDirection: "column",
    padding: 20,
  },
  brandRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 36, height: 36, borderRadius: RADIUS.sm, objectFit: "cover" },
  brandText: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 16, color: COLORS.textOnDark, letterSpacing: 0.5 },
  tagline: {
    display: "block",
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.textOnDarkMuted,
    marginTop: 8,
    marginBottom: 20,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
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
