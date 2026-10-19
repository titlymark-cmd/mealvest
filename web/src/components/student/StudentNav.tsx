import React, { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { House, UtensilsCrossed, Receipt, Wallet, User, LogOut, ChevronDown } from "lucide-react";
import { COLORS, FONTS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { NotificationBell } from "../notifications/NotificationBell";
import logo from "../../assets/mealvest-logo.png";

/**
 * Student navigation. The old desktop sidebar is gone: desktop gets a
 * sticky top bar (brand · segmented nav · bell · account menu) and phones
 * get a floating pill. One item list drives both so they can never drift.
 *
 * Hierarchy: the five destinations a student with a plan uses every day.
 * One-off flows (QR meal pass, meal boost, savings withdrawal, hotel
 * browsing, plan setup) are reached from the screens that start them and
 * deliberately show no nav, so nothing can cover a QR code or form.
 */
export const STUDENT_NAV_ITEMS = [
  { to: "/student/home", label: "Home", icon: House },
  { to: "/student/menu", label: "Menu", icon: UtensilsCrossed },
  { to: "/student/orders", label: "Orders", icon: Receipt },
  { to: "/student/payments", label: "Wallet", icon: Wallet },
  { to: "/student/profile", label: "Profile", icon: User },
] as const;

/** Active index comes from the URL itself (not click history), so it is
 *  right on deep links, refreshes and back/forward. -1 = none (hide thumb). */
export function useActiveNavIndex(): number {
  const { pathname } = useLocation();
  return STUDENT_NAV_ITEMS.findIndex((i) => pathname === i.to || pathname.startsWith(i.to + "/"));
}

export function StudentTopBar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = user?.fullName || user?.email || "Account";
  const initial = name.trim().charAt(0).toUpperCase();

  return (
    <header className="mv-topbar">
      <div className="mv-topbar-inner">
        <NavLink to="/student/home" className="mv-brand" aria-label="MEALVEST home">
          <img src={logo} alt="" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover" }} />
          <span className="mv-brand-text" style={{ fontFamily: FONTS.displayBold, fontSize: 16 }}>
            MEALVEST
          </span>
        </NavLink>

        <nav className="mv-topnav" aria-label="Main">
          {STUDENT_NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} aria-label={label} title={label}>
              <Icon size={17} aria-hidden />
              <span className="mv-nav-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <span className="mv-topbar-spacer" />
        <NotificationBell />

        <div ref={ref} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Account menu"
            className="mv-iconbtn"
            style={{ width: "auto", borderRadius: 999, padding: "0 10px 0 6px", gap: 6 }}
          >
            <span style={avatar}>{initial}</span>
            <ChevronDown size={14} aria-hidden style={{ transition: "transform 220ms", transform: open ? "rotate(180deg)" : "none" }} />
          </button>
          {open && (
            <div className="mv-menu" role="menu">
              <div style={{ padding: "8px 12px 10px" }}>
                <div style={{ fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 14, color: COLORS.textOnDark, overflowWrap: "anywhere" }}>{user?.fullName}</div>
                <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.textOnDarkMuted, overflowWrap: "anywhere" }}>{user?.email}</div>
              </div>
              <NavLink to="/student/profile" role="menuitem">
                <User size={16} aria-hidden /> Profile &amp; settings
              </NavLink>
              <button type="button" role="menuitem" onClick={() => logout()} style={{ color: "#FF8A6C" }}>
                <LogOut size={16} aria-hidden /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

const avatar: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: `linear-gradient(160deg, ${COLORS.primaryLight}, ${COLORS.primary})`,
  color: "#fff",
  fontFamily: FONTS.displayBold,
  fontWeight: 800,
  fontSize: 14,
};

export function StudentBottomNav() {
  const index = useActiveNavIndex();
  return (
    <nav
      className="mv-bottomnav"
      aria-label="Main"
      style={{ ["--mv-nav-count" as string]: STUDENT_NAV_ITEMS.length, ["--mv-nav-index" as string]: Math.max(index, 0) } as React.CSSProperties}
    >
      <span className="mv-bottomnav-thumb" data-hidden={index < 0} aria-hidden />
      {STUDENT_NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} aria-label={label}>
          <Icon size={20} aria-hidden />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
