import React, { useEffect, useState } from "react";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { fetchHotelDashboard } from "../../services/hotelStaffApi";
import { AccountSecurity } from "../../components/account/AccountSecurity";
import { PageHeader, Panel, PanelHead } from "../../components/hotel/hd";

/**
 * Staff settings: who they are, contact verification, notifications + push, PIN/password and a
 * plain statement of what a staff account can and can't do. Deliberately has NO access to anything
 * owner-only (menu, payouts, settlement, staff) — those endpoints are refused by the backend too.
 */
export default function HotelStaffSettingsScreen() {
  const { user, logout, authFetch } = useAuth();
  const [hotelName, setHotelName] = useState<string | null>(null);

  useEffect(() => {
    fetchHotelDashboard(authFetch)
      .then((d) => setHotelName(d.hotel.name))
      .catch(() => {});
  }, [authFetch]);

  return (
    <div className="hd-page mv-page">
      <PageHeader eyebrow="Account" title="Settings" subtitle={hotelName ? `Staff at ${hotelName}` : "Hotel staff account"} />

      <Panel>
        <PanelHead icon={<UserRound size={18} />} title="Your account" />
        <dl className="hd-kv" style={{ margin: 0 }}>
          <div>
            <dt>Name</dt>
            <dd>{user?.fullName ?? "—"}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user?.email ?? "—"}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>Hotel staff</dd>
          </div>
          {hotelName && (
            <div>
              <dt>Hotel</dt>
              <dd>{hotelName}</dd>
            </div>
          )}
        </dl>
      </Panel>

      <AccountSecurity />

      <Panel>
        <PanelHead icon={<ShieldCheck size={18} />} title="Security information" />
        <p className="hd-hint" style={{ margin: 0 }}>
          Your account can scan and redeem student QR codes, view orders and mark them ready. It cannot change the menu, payouts,
          settlement details or other staff — only the hotel owner can. If you lose your phone, ask the owner to deactivate your account
          straight away; that signs you out everywhere immediately.
        </p>
        <div style={{ marginTop: 14 }}>
          <button type="button" className="hd-btn hd-btn-danger" onClick={() => logout()}>
            <LogOut size={16} aria-hidden="true" /> Log out
          </button>
        </div>
      </Panel>
    </div>
  );
}
