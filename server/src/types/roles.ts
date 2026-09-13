export const ROLES = ["student", "hotel_staff", "hotel_owner", "mealvest_admin"] as const;
export type Role = (typeof ROLES)[number];
