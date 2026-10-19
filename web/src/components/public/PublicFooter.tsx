import React from "react";
import { Link } from "react-router-dom";
import { FONTS } from "../../styles/theme";
import logo from "../../assets/mealvest-logo.png";

/**
 * Every link here is an existing route (see routes/RootGate.tsx and
 * UnauthenticatedRoutes.tsx). No contact details, social accounts or policy
 * URLs are invented: the app has no public contact info, so none is shown;
 * Terms and Privacy are the real in-app pages.
 */
export function PublicFooter() {
  return (
    <footer className="mvp-footer">
      <div className="mv-container">
        <div className="mvp-footer-grid">
          <div className="mvp-footer-brand">
            <Link to="/" className="mv-brand" aria-label="MEALVEST home">
              <img src={logo} alt="" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover" }} />
              <span style={{ fontFamily: FONTS.displayBold, fontSize: 16 }}>MEALVEST</span>
            </Link>
            <p>Fund a meal plan with a participating hotel, spend it as a daily amount, and redeem meals with a QR meal pass.</p>
          </div>

          <nav aria-labelledby="mvp-f-explore">
            <h2 id="mvp-f-explore">Explore</h2>
            <ul>
              <li><Link to="/">Home</Link></li>
              <li><Link to="/hotels">Hotels</Link></li>
              <li><Link to="/demo">Watch the demo</Link></li>
              <li><Link to="/install">Install the app</Link></li>
            </ul>
          </nav>

          <nav aria-labelledby="mvp-f-join">
            <h2 id="mvp-f-join">Join</h2>
            <ul>
              <li><Link to="/register/student">Student sign up</Link></li>
              <li><Link to="/register/hotel">Register a hotel</Link></li>
              <li><Link to="/login">Login</Link></li>
            </ul>
          </nav>

          <nav aria-labelledby="mvp-f-legal">
            <h2 id="mvp-f-legal">Legal</h2>
            <ul>
              <li><Link to="/terms?section=terms">Terms</Link></li>
              <li><Link to="/terms?section=privacy">Privacy</Link></li>
            </ul>
          </nav>
        </div>
        <div className="mvp-footer-legal">&copy; {new Date().getFullYear()} MEALVEST. All rights reserved.</div>
      </div>
    </footer>
  );
}
