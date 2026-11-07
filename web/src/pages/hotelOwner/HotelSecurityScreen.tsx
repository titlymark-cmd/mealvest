import React from "react";
import { AccountSecurity } from "../../components/account/AccountSecurity";
import { PageHeader } from "../../components/hotel/hd";

/**
 * Owner "Account & security" — a separate screen so the approved Profile page stays untouched.
 * Same stack as staff settings: verification, notifications + push, PIN, password.
 */
export default function HotelSecurityScreen() {
  return (
    <div className="hd-page mv-page">
      <PageHeader eyebrow="Account" title="Account & security" subtitle="Verify your contact details, manage alerts, and keep your account safe." />
      <AccountSecurity />
    </div>
  );
}
