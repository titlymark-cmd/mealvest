import { Router } from "express";
import { login, logout, refresh, registerHotel, registerStudent, googleLogin } from "../controllers/auth.controller";
import { authRateLimiter } from "../middleware/rateLimit";

export const authRouter = Router();

// mealvest_admin is deliberately absent from this router — there is no
// self-registration path for admins anywhere in the API. Admin
// accounts are created only via scripts/seedAdmin.js against the DB
// directly (see README "Creating an admin account").
authRouter.post("/register/student", authRateLimiter, registerStudent);
authRouter.post("/register/hotel", authRateLimiter, registerHotel);
authRouter.post("/login", authRateLimiter, login);
authRouter.post("/google", authRateLimiter, googleLogin);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);
