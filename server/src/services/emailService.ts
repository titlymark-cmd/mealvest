import axios from "axios";
import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";

/**
 * Hand-rolled client against Resend's REST API — matching how every
 * other third-party integration in this codebase (Paystack, Google,
 * Supabase Storage) is a thin axios call rather than an SDK, not a
 * new pattern introduced just for this.
 */
function client() {
  if (!env.resendApiKey) {
    throw new ApiError(
      500,
      "EMAIL_NOT_CONFIGURED",
      "Email is not configured on this server yet. Set RESEND_API_KEY."
    );
  }
  return axios.create({
    baseURL: "https://api.resend.com",
    headers: { Authorization: `Bearer ${env.resendApiKey}` },
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #E5482E;">Reset your MEALVEST password</h2>
      <p>We got a request to reset the password on your MEALVEST account.</p>
      <p>
        <a href="${resetUrl}" style="display: inline-block; background: #E5482E; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">
          Reset password
        </a>
      </p>
      <p style="color: #6B625C; font-size: 13px;">This link expires in 30 minutes. If you didn't request this, you can safely ignore this email — your password won't change.</p>
    </div>
  `;

  try {
    await client().post("/emails", {
      from: env.emailFrom,
      to,
      subject: "Reset your MEALVEST password",
      html,
    });
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error("[sendPasswordResetEmail] Resend request failed:", err.response?.data || err.message);
    }
    throw new ApiError(502, "EMAIL_SEND_FAILED", "Could not send the password reset email.");
  }
}
