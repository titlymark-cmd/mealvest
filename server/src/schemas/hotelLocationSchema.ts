import { z } from "zod";

// Admin-facing update — every field optional so a hotel owner can
// set coordinates first and fill in the rest later. Coordinates are
// validated numerically here AND re-checked by the DB CHECK
// constraints from migration 012 as a second line of defense.
export const updateHotelLocationSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  address: z.string().trim().max(300).optional(),
  helpline: z.string().trim().max(20).optional(),
  openingHours: z.string().trim().max(200).optional(),
  services: z.array(z.string().trim().max(60)).max(20).optional(),
  description: z.string().trim().max(500).optional(),
  imageUrl: z.string().trim().url("Enter a valid image URL.").max(2000).optional(),
});

export type UpdateHotelLocationInput = z.infer<typeof updateHotelLocationSchema>;
