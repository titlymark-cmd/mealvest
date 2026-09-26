/** Shared formatting helpers used across every dashboard (admin, hotel owner, …). */
import { COLORS } from "../../styles/theme";

// Deterministic (not random) per-entity badge color — same hash approach
// used on the student HotelListScreen, so a given hotel/student gets the
// same color everywhere in the app.
const BADGE_COLORS = [COLORS.primary, COLORS.accent, COLORS.success, COLORS.primaryLight, COLORS.primaryDark];
export function badgeColorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return BADGE_COLORS[Math.abs(hash) % BADGE_COLORS.length];
}

export function timeAgo(isoDate: string): string {
  const then = new Date(isoDate).getTime();
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export function formatKsh(amount: string | number): string {
  return `KSh ${Number(amount).toLocaleString()}`;
}
