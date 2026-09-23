import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as authService from "../services/authService";
import {
  registerStudentSchema,
  registerHotelSchema,
  loginSchema,
  refreshSchema,
  setPinSchema,
  verifyPinSchema,
} from "../schemas/authSchemas";
import { verifyGoogleIdToken } from "../lib/googleAuth";
import { ApiError } from "../middleware/errorHandler";
import { AuthedRequest } from "../middleware/auth";

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
