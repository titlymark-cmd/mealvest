import React from "react";
import { AccountSecurity } from "../../components/account/AccountSecurity";
import { PageHeader } from "../../components/hotel/hd";

/** Admin "Account & security": the same verified-contact / alerts / PIN / password stack as the hotel roles. */
export default function AdminSecurityScreen() {
  return (
    <div className="hd-page mv-page">
      <PageHeader eyebrow="Account" title="Account & security" subtitle="Verify your contact details, manage alerts, and keep your account safe." />
      <AccountSecurity />
    </div>
  );
}
