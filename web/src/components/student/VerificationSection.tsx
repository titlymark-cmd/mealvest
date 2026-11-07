import React from "react";
import { VerificationPanel } from "../account/VerificationPanel";

/**
 * Student-profile entry point for contact verification. Kept as a thin wrapper so the profile
 * screen's usage is unchanged; the real work (status loading, resend cooldowns, honest delivery
 * errors, every role) lives in the shared VerificationPanel. The legacy emailVerified /
 * phoneVerified props are accepted but the panel reads live status from the server.
 */
export function VerificationSection({
  onVerified,
}: {
  emailVerified?: boolean;
  phoneVerified?: boolean;
  onVerified: () => void;
}) {
  return <VerificationPanel skin="student" onVerified={onVerified} />;
}
