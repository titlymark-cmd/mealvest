import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as authService from "../services/authService";
import * as verification from "../services/verificationService";
import {
  registerStudentSchema,
  registerHotelSchema,
  loginSchema,
  refreshSchema,
  setPinSchema,
  verifyPinSchema,
  loginPinSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../schemas/authSchemas";
import { verifyGoogleIdToken } from "../lib/googleAuth";
import { ApiError } from "../middleware/errorHandler";
import { AuthedRequest } from "../middleware/auth";
import { env } from "../config/env";

function badRequestFromZod(err: unknown): ApiError {
  const issues = (err as { errors?: { message: string }[] })?.errors;
  const message = issues?.[0]?.message || "Invalid request.";
  return new ApiError(400, "VALIDATION_ERROR", message);
}

export async function registerStudent(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = registerStudentSchema.safeParse(req.body);
    if (!parsed.success) throw badRequestFromZod(parsed.error);

    const result = await authService.registerStudent(parsed.data);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function registerHotel(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = registerHotelSchema.safeParse(req.body);
    if (!parsed.success) throw badRequestFromZod(parsed.error);

    const result = await authService.registerHotel(parsed.data);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Step 1 of 2 — verifies email/phone + password only. Never returns
 * real tokens; the response is { status: "pending_pin", pendingToken,
 * pinSet }, redeemable only via /login/verify-pin or /login/set-pin
 * below (see authService.login's own doc comment for why).
 */
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw badRequestFromZod(parsed.error);

    const result = await authService.login(parsed.data);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Step 2 — for an account that already has a PIN (pinSet: true from
 * step 1). No requireAuth: by definition the client doesn't hold a
 * real token yet, the pendingToken IS the credential here, same
 * reasoning as verifyPin below.
 */
export async function verifyLoginPin(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = loginPinSchema.safeParse(req.body);
    if (!parsed.success) throw badRequestFromZod(parsed.error);

    const result = await authService.completeLoginWithPin(parsed.data.pendingToken, parsed.data.pin);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/** Step 2 — for an account with no PIN yet (pinSet: false from step 1); this call's pin becomes it. */
export async function setLoginPin(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = loginPinSchema.safeParse(req.body);
    if (!parsed.success) throw badRequestFromZod(parsed.error);

    const result = await authService.completeLoginWithNewPin(parsed.data.pendingToken, parsed.data.pin);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) throw badRequestFromZod(parsed.error);

    const result = await authService.refresh(parsed.data.refreshToken);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) throw badRequestFromZod(parsed.error);

    await authService.logout(parsed.data.refreshToken);
    res.status(200).json({ loggedOut: true });
  } catch (err) {
    next(err);
  }
}

const googleAuthSchema = z.object({
  idToken: z.string().min(1, "Google ID token is required."),
});

/**
 * Single endpoint for BOTH "sign up with Google" and "sign in with
 * Google" — there's no separate register-vs-login distinction here
 * on purpose. authService.loginWithGoogle finds-or-creates: a first
 * tap creates the account (this IS the sign-up, so details are saved
 * from that moment on), every tap after that just logs the same
 * account back in via the same Google identity — same behavior on a
 * brand new device, since nothing about this depends on local state.
 */
export async function googleLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = googleAuthSchema.safeParse(req.body);
    if (!parsed.success) throw badRequestFromZod(parsed.error);

    const profile = await verifyGoogleIdToken(parsed.data.idToken);
    const result = await authService.loginWithGoogle(profile);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Same fallback payments.controller.ts's resolveCallbackUrl uses:
 * this app serves frontend and API from the same origin, so deriving
 * the reset link's base from the incoming request is reliable without
 * needing a dedicated env var for it.
 */
function resolveAppBaseUrl(): string | null {
  // M5: the reset link's origin comes ONLY from server configuration —
  // never from the request's Host/Origin headers, which an attacker
  // controls ("password-reset poisoning").
  return env.appBaseUrl || null;
}

/**
 * Always responds 200 with the same generic message whether or not
 * the identifier matched a real account — see authService.
 * requestPasswordReset's own doc comment for why.
 */
export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) throw badRequestFromZod(parsed.error);

    await authService.requestPasswordReset(parsed.data.identifier, resolveAppBaseUrl());
    res.status(200).json({
      message: "If an account exists for that email or phone number, we've sent a password reset link to its email address.",
    });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) throw badRequestFromZod(parsed.error);

    await authService.resetPassword(parsed.data.token, parsed.data.newPassword);
    res.status(200).json({ passwordReset: true });
  } catch (err) {
    next(err);
  }
}

/** Requires a valid access token — see routes/auth.routes.ts (requireAuth applied). */
export async function setPin(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = setPinSchema.safeParse(req.body);
    if (!parsed.success) throw badRequestFromZod(parsed.error);

    await authService.setPin(req.user!.id, parsed.data.pin, parsed.data.currentPassword);
    res.status(200).json({ pinSet: true });
  } catch (err) {
    next(err);
  }
}

/**
 * No requireAuth here on purpose — by definition, the client is
 * calling this because it does NOT currently hold a valid access
 * token (app was just reopened). Authenticity comes from the
 * refresh token + PIN pair instead, same as /refresh needing no
 * bearer token either.
 */
export async function verifyPin(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = verifyPinSchema.safeParse(req.body);
    if (!parsed.success) throw badRequestFromZod(parsed.error);

    const result = await authService.verifyPinAndRefresh(parsed.data.refreshToken, parsed.data.pin);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

const linkGoogleSchema = z.object({
  idToken: z.string().min(1, "Google ID token is required.").max(4096),
  currentPassword: z.string().min(1, "Enter your current password to confirm.").max(128),
});

/** POST /api/auth/google/link — requireAuth; links Google to the signed-in student after a password check. */
export async function linkGoogle(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = linkGoogleSchema.safeParse(req.body);
    if (!parsed.success) throw badRequestFromZod(parsed.error);
    const profile = await verifyGoogleIdToken(parsed.data.idToken);
    const result = await authService.linkGoogleAccount(req.user!.id, profile, parsed.data.currentPassword);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Email / phone verification (H7 full, M3)
// ---------------------------------------------------------------------------

/** POST /api/auth/verify-email/request — requireAuth. Sends a one-time link to the account's own email. */
export async function requestEmailVerification(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    res.json(await verification.requestEmailVerification(req.user!.id));
  } catch (err) {
    next(err);
  }
}

const confirmEmailSchema = z.object({ token: z.string().min(1).max(128) });

/** POST /api/auth/verify-email/confirm — public (the link may be opened on another device). */
export async function confirmEmailVerification(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = confirmEmailSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "INVALID_VERIFICATION_TOKEN", "This verification link is invalid or has expired.");
    res.json(await verification.confirmEmailVerification(parsed.data.token));
  } catch (err) {
    next(err);
  }
}

/** POST /api/auth/verify-phone/request — requireAuth. Sends a 6-digit code to the account's own phone. */
export async function requestPhoneVerification(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    res.json(await verification.requestPhoneVerification(req.user!.id));
  } catch (err) {
    next(err);
  }
}

const confirmPhoneSchema = z.object({ code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code.") });

/** POST /api/auth/verify-phone/confirm — requireAuth. */
export async function confirmPhoneVerification(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = confirmPhoneSchema.safeParse(req.body);
    if (!parsed.success) throw badRequestFromZod(parsed.error);
    res.json(await verification.confirmPhoneVerification(req.user!.id, parsed.data.code));
  } catch (err) {
    next(err);
  }
}
