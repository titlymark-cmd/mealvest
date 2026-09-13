import { z } from "zod";

export const createBudgetSchema = z.object({
  // Exactly one of these two shapes is expected: planId (catalog
  // plan) OR totalAmount+numberOfDays (custom, pre-existing flow).
  // Both remain optional at the schema level because budgetService
  // does the real branching/validation — this just accepts either
  // shape without rejecting a valid custom request for lacking a
  // planId, or vice versa.
  planId: z.string().uuid().optional(),
  totalAmount: z.number().positive("Amount must be greater than zero.").optional(),
  numberOfDays: z.number().int().positive("Plan length must be at least 1 day.").max(90, "Plans can't exceed 90 days.").optional(),
  hotelId: z.string().uuid().optional().nullable(),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: "You must accept the Mealvest payment terms to continue." }),
  }),
});

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
