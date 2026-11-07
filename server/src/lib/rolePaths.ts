import { Role } from "../types/roles";

/** Same-origin landing path for each role (mirrors the web app's RootGate). Used for notification deep links. */
export function homePathForRole(role: Role | string): string {
  switch (role) {
    case "hotel_owner":
      return "/hotel-owner/home";
    case "hotel_staff":
      return "/hotel-staff/home";
    case "mealvest_admin":
      return "/admin/home";
    default:
      return "/student/home";
  }
}
