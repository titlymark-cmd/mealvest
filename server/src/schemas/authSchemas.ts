import { z } from "zod";
import { settlementMethodSchema } from "./settlementMethodSchema";

// Simple, non-aggressive password rule per the spec: length only.
const passwordSchema = z.string().min(8, "Password must be at least 8 characters.");

const emailSchema = z.string().trim().email("Enter a valid email address.");
const phoneSchema = z.string().trim().min(9, "Enter a valid phone number.");

export const registerStudentSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required.").max(120),
  email: emailSchema,
  phoneNumber: phoneSchema,
  password: passwordSchema,
  institution: z.string().trim().max(160).optional(),
  admissionNumber: z.string().trim().max(60).optional(),
});

/**
 * Full hotel partner registration schema exists (business details,
 * contact person, settlement, commercial plan) — but per MVP1 scope,
 * only the KEY fields are actually REQUIRED here. Everything else
 * stays optional/defaulted, so the frontend form only has to collect
 * what genuinely matters to get a hotel operating: identity, who to
 * contact, and how to pay them. The richer optional fields (KRA PIN,
 * opening hours, branch count, etc.) are still accepted if sent —
 * nothing was removed from the data model — they're just not
 * required to complete registration. Filling those in becomes an
 * MVP2 "complete your hotel profile" flow, same pattern as the
 * student profile-completeness screen.
 */
export const registerHotelSchema = z.object({
  // Login credentials — required
  email: emailSchema,
  phoneNumber: phoneSchema,
  password: passwordSchema,

  // Key business identity — required
  hotelName: z.string().trim().min(1, "Hotel name is required.").max(120),
  businessType: z.enum(["hotel", "restaurant", "cafeteria", "canteen", "food_kiosk", "cafe", "catering", "other"]),
  location: z.string().trim().max(160).optional(),

  // Everything below this line: MVP2 profile-completion fields.
  businessRegistrationNumber: z.string().trim().max(60).optional(),
  kraPin: z.string().trim().max(20).optional(),
  county: z.string().trim().max(80).optional(),
  town: z.string().trim().max(80).optional(),
  landmark: z.string().trim().max(160).optional(),
  whatsappNumber: z.string().trim().max(20).optional(),
  description: z.string().trim().max(500).optional(),
  openingTime: z.string().trim().max(10).optional(),
  closingTime: z.string().trim().max(10).optional(),
  daysOpen: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).optional().default([]),
  branchesCount: z.number().int().min(1).optional(),
  employeesCount: z.number().int().min(0).optional(),

  // Owner/contact details — the person's NAME is a key detail
  // (needed for the account to mean anything); position/ID/preferred
  // contact channel are MVP2 refinements with sensible defaults.
  contactFullName: z.string().trim().min(1, "Owner's full name is required.").max(120),
  contactPosition: z.enum(["owner", "manager", "director", "authorized_representative"]).optional().default("owner"),
  contactPhone: phoneSchema.optional(), // falls back to the login phoneNumber if omitted — see authService.registerHotel
  contactEmail: emailSchema.optional(),
  contactIdNumber: z.string().trim().max(30).optional(),
  preferredContactMethod: z.enum(["sms", "whatsapp", "email"]).optional().default("sms"),

  // Settlement/payment details — a key detail (how the hotel actually
  // gets paid), kept required. The frontend form only exposes one
  // method (M-Pesa Till) for MVP1, but the schema still accepts any
  // of the 5 — nothing here was trimmed from the backend's side.
  settlement: settlementMethodSchema,

  // Commercial plan — optional. Omitting it assigns the lowest-fee
  // active plan automatically (see authService.registerHotel), so a
  // hotel isn't blocked on picking a plan during MVP1 sign-up; an
  // admin or the hotel itself can change it later.
  commercialPlanId: z.string().uuid("Choose a valid commercial plan.").optional(),
});

// `identifier` accepts either email or phone number — see migration
// 009 for why phone_number is the primary identifier while email
// stays supported as a secondary login path.
export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Email or phone number is required."),
  password: z.string().min(1, "Password is required."),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required."),
});

export type RegisterStudentInput = z.infer<typeof registerStudentSchema>;
export type RegisterHotelInput = z.infer<typeof registerHotelSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
