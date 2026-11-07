import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/** Where each role's "back out of a shared screen" lands when there is no in-app history to return to. */
export function fallbackPathForRole(role: string | undefined): string {
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

/**
 * Back button for screens shared between roles (hotel scanner/orders).
 *
 * `navigate(-1)` leaves the app when the screen was opened directly — from a notification, a
 * bookmark, or after a PWA refresh/relaunch — because there is nothing earlier in OUR history.
 * react-router marks the first entry of a session with location.key === "default", so:
 *   - in-app history exists → go back one step (keeps the natural feel);
 *   - otherwise            → go to the signed-in role's own home.
 */
export function useRoleBack(): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const role = user?.role;
  return useCallback(() => {
    if (location.key !== "default") navigate(-1);
    else navigate(fallbackPathForRole(role), { replace: true });
  }, [location.key, navigate, role]);
}
