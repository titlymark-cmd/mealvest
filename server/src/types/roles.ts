export const ROLES = ["student", "hotel_staff", "hotel_owner", "mealvest_admin", "university_ambassador", "team_member"] as const;
export type Role = (typeof ROLES)[number];
