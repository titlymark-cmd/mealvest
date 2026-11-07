import React from "react";
import { NavLink, Link } from "react-router-dom";
import { Home, ShoppingBag, QrCode, Settings, LogOut } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useWindowSize } from "../../hooks/useWindowSize";
import { SIDEBAR_WIDTH, SIDEBAR_MOBILE_BREAKPOINT } from "../layout/sidebarConfig";
import logo from "../../assets/mealvest-logo.png";
import "../../styles/hotel.css";

export const STAFF_MOBILE_BREAKPOINT = SIDEBAR_MOBILE_BREAKPOINT;
export const STAFF_SIDEBAR_WIDTH = SIDEBAR_WIDTH;

const SCANNER = "/hotel-staff/scanner";

/**
 * Navigation for the hotel STAFF app — the minimal counter experience (home, orders, scan) plus
 * settings. Same visual language as the owner's sidebar/tab bar, but only the destinations a
 * staff account may use; nothing owner-only appears here (the backend refuses those anyway).
 */
export function StaffNav() {
  const { logout } = useAuth();
  const { width } = useWindowSize();

  if (width < STAFF_MOBILE_BREAKPOINT) {
    return (
      <nav className="hd-tabbar" aria-label="Staff navigation">
        <NavLink to="/hotel-staff/home" className="hd-tab">
          <Home size={18} aria-hidden="true" />
          Home
        </NavLink>
        <NavLink to="/hotel-staff/orders" className="hd-tab">
          <ShoppingBag size={18} aria-hidden="true" />
          Orders
        </NavLink>
        <Link to={SCANNER} className="hd-tab hd-tab-scan" aria-label="Scan QR code">
          <QrCode size={24} aria-hidden="true" />
        </Link>
        <NavLink to="/hotel-staff/settings" className="hd-tab">
          <Settings size={18} aria-hidden="true" />
          Settings
        </NavLink>
      </nav>
    );
  }

  return (
    <aside className="hd-side" style={{ width: STAFF_SIDEBAR_WIDTH }}>
      <div className="hd-side-brand">
        <img src={logo} alt="" />
        <b>MEALVEST</b>
      </div>
      <span className="hd-side-tag">Staff</span>
      <Link to={SCANNER} className="hd-btn hd-btn-primary hd-side-scan">
        <QrCode size={18} aria-hidden="true" /> Scan QR
      </Link>
      <nav className="hd-nav" aria-label="Staff navigation">
        <NavLink to="/hotel-staff/home">
          <Home size={17} aria-hidden="true" />
          Home
        </NavLink>
        <NavLink to="/hotel-staff/orders">
          <ShoppingBag size={17} aria-hidden="true" />
          Orders
        </NavLink>
        <NavLink to="/hotel-staff/settings">
          <Settings size={17} aria-hidden="true" />
          Settings
        </NavLink>
      </nav>
      <nav className="hd-nav" style={{ flex: "none" }} aria-label="Account">
        <button type="button" className="hd-side-out" onClick={() => logout()}>
          <LogOut size={16} aria-hidden="true" /> Log out
        </button>
      </nav>
    </aside>
  );
}
