import React from "react";
import { VerificationPanel } from "./VerificationPanel";
import { HotelNotificationSettings } from "./HotelNotificationSettings";
import { ChangePinPanel } from "./ChangePinPanel";
import { PasswordResetPanel } from "./PasswordResetPanel";

/**
 * The account & security stack shared by every dashboard role that isn't a student (hotel owner,
 * hotel staff, admin): contact verification, notification preferences + push, PIN and password.
 * One composition, so a fix or improvement lands for all of them at once.
 */
export function AccountSecurity() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <VerificationPanel skin="hotel" />
      <HotelNotificationSettings />
      <ChangePinPanel />
      <PasswordResetPanel />
    </div>
  );
}
