import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Building2, House, LogIn, Store, User, UserPlus, FileText } from "lucide-react";
import logo from "../../assets/mealvest-logo.png";
import { FONTS } from "../../styles/theme";
import { PublicFooter } from "./PublicFooter";
import "../../styles/public.css";

/**
 * Chrome for the logged-out site: skip link, desktop top bar, phone brand
 * row, footer and the phone floating pill. It is only mounted by
 * UnauthenticatedRoutes, i.e. never for a signed-in or locked session, and it
 * links only to routes that already exist.
 *
 * Navigation reuses the app's existing neumorphic nav CSS (.mv-topbar,
 * .mv-topnav, .mv-bottomnav + its sliding thumb) so there is one nav system.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const scroller = useRef<HTMLDivElement>(null);

  // Each public page starts at the top (the document itself never scrolls).
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="mvp-root" ref={scroller}>
      <a
        className="mvp-skip"
        href="#mvp-main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("mvp-main")?.focus();
        }}
      >
        Skip to content
      </a>
      <PublicTopBar />
      <div className="mvp-mobilebrand">
        <Link to="/" className="mv-brand" aria-label="MEALVEST home">
          <img src={logo} alt="" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover" }} />
          <span style={{ fontFamily: FONTS.displayBold, fontSize: 16 }}>MEALVEST</span>
        </Link>
      </div>
      <main id="mvp-main" tabIndex={-1} style={{ outline: "none" }}>
        {children}
      </main>
      <PublicFooter />
      <div className="mvp-bottom-clear" aria-hidden />
      <PublicBottomNav />
    </div>
  );
}

function PublicTopBar() {
  return (
    <header className="mv-topbar mvp-topbar">
      <div className="mv-topbar-inner">
        <Link to="/" className="mv-brand" aria-label="MEALVEST home">
          <img src={logo} alt="" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover" }} />
          <span className="mv-brand-text" style={{ fontFamily: FONTS.displayBold, fontSize: 16 }}>
            MEALVEST
          </span>
        </Link>

        <nav className="mv-topnav" aria-label="Main">
          <NavLink to="/" end title="Home">
            <House size={17} aria-hidden />
            <span className="mv-nav-label">Home</span>
          </NavLink>
          <NavLink to="/hotels" title="Hotels">
            <Store size={17} aria-hidden />
            <span className="mv-nav-label">Hotels</span>
          </NavLink>
        </nav>

        <div className="mvp-actions">
          <Link to="/register/hotel" className="mvp-cta mvp-cta--ghost mvp-cta--sm">
            <Building2 size={16} aria-hidden /> Register a Hotel
          </Link>
          <Link to="/login" className="mvp-cta mvp-cta--secondary mvp-cta--sm">
            Login
          </Link>
          <Link to="/register/student" className="mvp-cta mvp-cta--primary mvp-cta--sm">
            Sign Up
          </Link>
        </div>
      </div>
    </header>
  );
}

/**
 * Phone navigation: the same floating pill as the student app. Two route
 * slots (Home, Hotels) plus an "Account" slot that opens a compact sheet with
 * Login / Sign Up / Register a Hotel, so the pill stays uncrowded. The thumb
 * position is derived from the URL (right after refresh, deep links and
 * back/forward) and moves to the Account slot while its sheet is open.
 */
let lastThumbIndex: number | null = null;

function PublicBottomNav() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  const routeIndex = pathname.startsWith("/hotels") ? 1 : 0;
  const index = open ? 2 : routeIndex;

  // Every public page mounts its own copy of this pill, so on Home <-> Hotels the thumb
  // element is brand new and would just appear in place. Start it where the previous
  // copy left it, then move it on the next frames so the slide transition plays.
  const [thumbIndex, setThumbIndex] = useState<number>(lastThumbIndex ?? index);
  useEffect(() => {
    lastThumbIndex = index;
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setThumbIndex(index));
    });
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
  }, [index]);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    sheet.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open && (
        <>
          <div className="mvp-sheet-backdrop" onClick={() => setOpen(false)} aria-hidden />
          <div className="mvp-sheet" id="mvp-account-sheet" ref={sheet} role="dialog" aria-label="Account and hotel registration">
            <Link to="/register/student" className="is-primary">
              <UserPlus size={20} aria-hidden />
              <span>
                Sign Up
                <small>Create a student account</small>
              </span>
            </Link>
            <Link to="/login">
              <LogIn size={20} aria-hidden />
              <span>
                Login
                <small>Already have an account</small>
              </span>
            </Link>
            <Link to="/register/hotel">
              <Building2 size={20} aria-hidden />
              <span>
                Register a Hotel
                <small>Join the MEALVEST network</small>
              </span>
            </Link>
            <Link to="/terms">
              <FileText size={20} aria-hidden />
              <span>Terms &amp; privacy</span>
            </Link>
          </div>
        </>
      )}
      <nav
        className="mv-bottomnav"
        aria-label="Main"
        data-sheet-open={open}
        style={{ ["--mv-nav-count" as string]: 3, ["--mv-nav-index" as string]: thumbIndex } as React.CSSProperties}
      >
        <span className="mv-bottomnav-thumb" aria-hidden />
        <NavLink to="/" end aria-label="Home" onClick={() => setOpen(false)}>
          <House size={20} aria-hidden />
          <span>Home</span>
        </NavLink>
        <NavLink to="/hotels" aria-label="Hotels" onClick={() => setOpen(false)}>
          <Store size={20} aria-hidden />
          <span>Hotels</span>
        </NavLink>
        <button
          ref={trigger}
          type="button"
          className="mvp-navbtn"
          aria-expanded={open}
          aria-controls="mvp-account-sheet"
          aria-haspopup="dialog"
          aria-label="Account and hotel registration"
          onClick={() => setOpen((v) => !v)}
        >
          <User size={20} aria-hidden />
          <span>Account</span>
        </button>
      </nav>
    </>
  );
}