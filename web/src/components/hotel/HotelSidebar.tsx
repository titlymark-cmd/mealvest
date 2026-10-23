import React, { useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { TrendingUp, ShoppingBag, UtensilsCrossed, Users, User, LogOut, QrCode, Landmark, Ellipsis } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useWindowSize } from "../../hooks/useWindowSize";
import { Modal } from "../ui/Modal";
import { SIDEBAR_WIDTH, SIDEBAR_MOBILE_BREAKPOINT } from "../layout/sidebarConfig";
import logo from "../../assets/mealvest-logo.png";
import "../../styles/hotel.css";

export const HOTEL_MOBILE_BREAKPOINT = SIDEBAR_MOBILE_BREAKPOINT;
export const HOTEL_SIDEBAR_WIDTH = SIDEBAR_WIDTH;

const SCANNER = "/hotel-owner/scanner";

// Desktop shows everything. On a phone the bar keeps the four daily destinations plus Scan;
// the rest live in "More" so every target stays a comfortable size.
const DESKTOP_ITEMS = [
  { to: "/hotel-owner/home", label: "Overview", icon: TrendingUp },
  { to: "/hotel-owner/orders", label: "Orders", icon: ShoppingBag },
  { to: "/hotel-owner/menu", label: "Menu", icon: UtensilsCrossed },
  { to: "/hotel-owner/earnings", label: "Earnings", icon: Landmark },
  { to: "/hotel-owner/students", label: "Students", icon: Users },
  { to: "/hotel-owner/profile", label: "Profile", icon: User },
];

const MORE_ITEMS = DESKTOP_ITEMS.filter((i) => ["Earnings", "Students", "Profile"].includes(i.label));

export function HotelSidebar() {
  const { logout } = useAuth();
  const { width } = useWindowSize();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const isMobile = width < HOTEL_MOBILE_BREAKPOINT;

  if (isMobile) {
    const moreActive = MORE_ITEMS.some((i) => pathname.startsWith(i.to));
    return (
      <>
        <nav className="hd-tabbar" aria-label="Hotel navigation">
          <NavLink to="/hotel-owner/home" className="hd-tab">
            <TrendingUp size={18} aria-hidden="true" />
            Home
          </NavLink>
          <NavLink to="/hotel-owner/orders" className="hd-tab">
            <ShoppingBag size={18} aria-hidden="true" />
            Orders
          </NavLink>
          <Link to={SCANNER} className="hd-tab hd-tab-scan" aria-label="Scan QR code">
            <QrCode size={24} aria-hidden="true" />
          </Link>
          <NavLink to="/hotel-owner/menu" className="hd-tab">
            <UtensilsCrossed size={18} aria-hidden="true" />
            Menu
          </NavLink>
          <button type="button" className="hd-tab" data-active={moreActive} aria-haspopup="dialog" onClick={() => setMoreOpen(true)}>
            <Ellipsis size={18} aria-hidden="true" />
            More
          </button>
        </nav>

        <Modal open={moreOpen} title="More" onClose={() => setMoreOpen(false)}>
          <ul className="hd-more-list">
            {MORE_ITEMS.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink to={to} onClick={() => setMoreOpen(false)}>
                  <Icon size={20} aria-hidden="true" /> {label}
                </NavLink>
              </li>
            ))}
            <li>
              <button type="button" className="hd-more-out" onClick={() => logout()}>
                <LogOut size={20} aria-hidden="true" /> Log out
              </button>
            </li>
          </ul>
        </Modal>
      </>
    );
  }

  return (
    <aside className="hd-side" style={{ width: HOTEL_SIDEBAR_WIDTH }}>
      <div className="hd-side-brand">
        <img src={logo} alt="" />
        <b>MEALVEST</b>
      </div>
      <span className="hd-side-tag">Hotel dashboard</span>
      <Link to={SCANNER} className="hd-btn hd-btn-primary hd-side-scan">
        <QrCode size={18} aria-hidden="true" /> Scan QR
      </Link>

      <nav className="hd-nav" aria-label="Hotel navigation">
        {DESKTOP_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to}>
            <Icon size={17} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

      <nav className="hd-nav" style={{ flex: "none" }} aria-label="Account">
        <button type="button" className="hd-side-out" onClick={() => logout()}>
          <LogOut size={16} aria-hidden="true" /> Log out
        </button>
      </nav>
    </aside>
  );
}
