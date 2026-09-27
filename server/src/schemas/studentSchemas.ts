import { z } from "zod";
import { phoneSchema } from "./authSchemas";

// All fields optional — a student can update just one field (e.g. only
// their alternate phone) without resending everything else. At least
// one field must be present or there's nothing to update.
export const updateStudentProfileSchema = z
  .object({
    fullName: z.string().trim().min(1, "Full name is required.").max(120).optional(),
    phoneNumber: phoneSchema.optional(),
    alternatePhoneNumber: z.union([phoneSchema, z.literal("")]).optional(),
    institution: z.string().trim().max(160).optional(),
    admissionNumber: z.string().trim().max(60).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No changes to save." });
