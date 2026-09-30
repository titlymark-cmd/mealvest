import { z } from "zod";

export const registerDeviceSchema = z.object({
  pushToken: z.string().trim().min(1, "pushToken is required.").max(4096),
  platform: z.string().trim().max(40).optional().default("web"),
  browser: z.string().trim().max(120).optional(),
  deviceLabel: z.string().trim().max(120).optional(),
});

export const disableDeviceSchema = z.object({
  pushToken: z.string().trim().min(1, "pushToken is required."),
});

export const updatePreferencesSchema = z
  .object({
    pushEnabled: z.boolean().optional(),
    smsEnabled: z.boolean().optional(),
    mealReminders: z.boolean().optional(),
    paymentUpdates: z.boolean().optional(),
    walletAlerts: z.boolean().optional(),
    announcements: z.boolean().optional(),
    securityAlerts: z.boolean().optional(),
    reminderTime: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/, "reminderTime must be HH:MM.")
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No changes to save." });

export const markReadParamsSchema = z.object({ id: z.string().uuid() });

const audienceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("all_students") }),
  z.object({ type: z.literal("hotel_owners") }),
  z.object({ type: z.literal("university"), institution: z.string().trim().min(1).max(160) }),
  z.object({ type: z.literal("hotel"), hotelId: z.string().uuid() }),
  z.object({ type: z.literal("selected_users"), userIds: z.array(z.string().uuid()).min(1).max(500) }),
]);

export const adminBroadcastSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(120),
  body: z.string().trim().min(1, "Message is required.").max(500),
  audience: audienceSchema,
  channels: z.object({
    push: z.boolean().default(true),
    sms: z.boolean().default(false),
    inApp: z.boolean().default(true),
  }),
});

export const adminTestSendSchema = z.object({
  userId: z.string().uuid(),
  channel: z.enum(["push", "sms", "both"]),
  message: z.string().trim().min(1, "Message is required.").max(500),
});
