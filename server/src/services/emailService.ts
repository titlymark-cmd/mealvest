import axios from "axios";
import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";
import { renderEmail } from "./emailTemplates";

/**
 * Hand-rolled client against Resend's REST API — matching how every other
 * third-party integration here (Paystack, Google, Supabase Storage) is a thin
 * axios call rather than an SDK.
 *
 * Delivery contract: sendXxx() resolves ONLY when Resend accepted the message
 * (HTTP 2xx with an id) and throws an ApiError otherwise, so callers that await
 * it can report success truthfully. Errors are classified and logged with
 * enough detail to diagnose (HTTP status, Resend error name, a sanitised
 * message) but never with API keys, recipient addresses, or link tokens.
 */

const RESEND_TIMEOUT_MS = 10_000;

/** True when `from` is Resend's shared sandbox sender (<anything>@resend.dev). */
export function isResendSandboxSender(from: string = env.emailFrom): boolean {
  return /@resend\.dev>?\s*$/i.test(from.trim());
}

/**
 * Why email can't be sent right now, or null if it can. Used by isEmailConfigured(),
 * the startup diagnostics and the error returned to callers.
 */
export function emailConfigProblem(): string | null {
  if (!env.resendApiKey) return "RESEND_API_KEY is not set.";
  if (!env.appBaseUrl) return "APP_BASE_URL is not set (links in emails would have no safe origin).";
  if (env.isProduction && isResendSandboxSender() && !env.allowResendSandboxSender) {
    return (
      "EMAIL_FROM is Resend's sandbox sender (onboarding@resend.dev), which only delivers to the Resend " +
      "account owner. Verify mealvest.co.ke in Resend and set EMAIL_FROM to an address on that domain."
    );
  }
  return null;
}

export function isEmailConfigured(): boolean {
  return emailConfigProblem() === null;
}

let warnedAboutConfig = false;
/** Logs the config problem once per instance (called lazily on first send attempt / at boot). */
export function logEmailConfigOnce(): void {
  if (warnedAboutConfig) return;
  warnedAboutConfig = true;
  const problem = emailConfigProblem();
  if (problem) console.error(`[email] NOT READY: ${problem}`);
}

function scrub(message: unknown): string {
  return String(message ?? "")
    .replace(/[^\s@<>"']+@[^\s@<>"']+/g, "[email]")
    .replace(/re_[A-Za-z0-9_]{8,}/g, "[key]")
    .slice(0, 200);
}

interface DeliverParams {
  label: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function deliver(p: DeliverParams): Promise<void> {
  const problem = emailConfigProblem();
  if (problem) {
    logEmailConfigOnce();
    throw new ApiError(503, "EMAIL_NOT_CONFIGURED", "Email is not available right now.");
  }
  try {
    const res = await axios.post(
      `${env.resendBaseUrl.replace(/\/$/, "")}/emails`,
      { from: env.emailFrom, to: [p.to], subject: p.subject, html: p.html, text: p.text },
      {
        headers: { Authorization: `Bearer ${env.resendApiKey}` },
        timeout: RESEND_TIMEOUT_MS,
      }
    );
    if (!res.data?.id) {
      console.error(`[email:${p.label}] Resend returned ${res.status} without a message id — treating as failed.`);
      throw new ApiError(502, "EMAIL_SEND_FAILED", "Could not send the email.");
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const name = (err.response?.data as { name?: string } | undefined)?.name;
      const msg = scrub((err.response?.data as { message?: string } | undefined)?.message ?? err.message);
      let hint = "";
      if (status === 401) hint = " (invalid or restricted RESEND_API_KEY)";
      else if (status === 403) hint = " (sending domain not verified, or sandbox sender used for a non-owner recipient)";
      else if (status === 422) hint = " (rejected recipient or sender address)";
      else if (status === 429) hint = " (Resend rate limit)";
      else if (!err.response) hint = err.code === "ECONNABORTED" ? " (timeout)" : " (network error)";
      console.error(`[email:${p.label}] Resend request failed: status=${status ?? "none"} name=${name ?? "n/a"}${hint} message="${msg}"`);
    } else {
      console.error(`[email:${p.label}] unexpected failure:`, (err as Error)?.message);
    }
    throw new ApiError(502, "EMAIL_SEND_FAILED", "Could not send the email.");
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const { html, text } = renderEmail({
    preheader: "Use this link to choose a new MEALVEST password. It expires in 30 minutes.",
    heading: "Reset your password",
    paragraphs: ["We got a request to reset the password on your MEALVEST account. Tap the button to choose a new one."],
    buttonLabel: "Reset password",
    buttonUrl: resetUrl,
    footnote: "This link expires in 30 minutes and works once. If you didn't request this, ignore this email — your password won't change.",
  });
  await deliver({ label: "password-reset", to, subject: "Reset your MEALVEST password", html, text });
}

/** Email-verification link. The URL is built server-side from APP_BASE_URL only. */
export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  const { html, text } = renderEmail({
    preheader: "Confirm this email address for your MEALVEST account.",
    heading: "Confirm your email",
    paragraphs: ["Tap the button below to confirm this email address for your MEALVEST account."],
    buttonLabel: "Confirm email",
    buttonUrl: verifyUrl,
    footnote: "This link expires in 24 hours and works once. If you didn't create a MEALVEST account, ignore this email.",
  });
  await deliver({ label: "verify-email", to, subject: "Confirm your MEALVEST email", html, text });
}

/** Invitation for a hotel staff member created by an owner. */
export async function sendStaffInviteEmail(
  to: string,
  params: { hotelName: string; inviterName: string; staffName: string; inviteUrl: string; ttlHours: number }
): Promise<void> {
  const { html, text } = renderEmail({
    preheader: `${params.inviterName} added you to ${params.hotelName} on MEALVEST. Set your password to get started.`,
    heading: `Join ${params.hotelName} on MEALVEST`,
    paragraphs: [
      `Hi ${params.staffName},`,
      `${params.inviterName} added you as a staff member at ${params.hotelName}. You'll be able to scan student QR codes, redeem meals and mark orders ready.`,
      "Tap the button to set your password. You'll then create a 4-digit PIN the first time you sign in.",
    ],
    buttonLabel: "Set my password",
    buttonUrl: params.inviteUrl,
    footnote: `This invitation expires in ${params.ttlHours} hours and works once. If you weren't expecting it, ignore this email and no account access will be granted.`,
  });
  await deliver({ label: "staff-invite", to, subject: `You've been added to ${params.hotelName} on MEALVEST`, html, text });
}
