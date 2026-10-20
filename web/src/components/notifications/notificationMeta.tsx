import React from "react";
import { Bell, CreditCard, Wallet, Receipt, UtensilsCrossed, ShieldAlert, Megaphone, PiggyBank } from "lucide-react";

type IconType = React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;

/**
 * The server stores a free-form `type` string on each notification. Its exact
 * values aren't enumerated anywhere in the web app, so the icon is chosen by
 * what the type is *about* (matching the app's own preference categories:
 * payments, wallet, meal reminders, announcements, security). Anything
 * unrecognised gets the neutral bell rather than a misleading icon.
 */
export function notificationIcon(type: string): IconType {
  const t = (type || "").toLowerCase();
  if (/(secur|password|login|pin|verify|account)/.test(t)) return ShieldAlert;
  if (/(withdraw|payout|saving)/.test(t)) return PiggyBank;
  if (/(payment|boost|topup|top_up|paid|charge|refund)/.test(t)) return CreditCard;
  if (/(wallet|balance|low|credit|rollover)/.test(t)) return Wallet;
  if (/(order|pass|redeem|receipt)/.test(t)) return Receipt;
  if (/(remind|meal)/.test(t)) return UtensilsCrossed;
  if (/(announce|broadcast|news)/.test(t)) return Megaphone;
  return Bell;
}

export function timeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

/** Today / Yesterday / Earlier — based on the device's calendar day. */
export function dayGroup(isoDate: string): string {
  const d = new Date(isoDate);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 86400000;
  if (d.getTime() >= startOfToday.getTime()) return "Today";
  if (d.getTime() >= startOfToday.getTime() - dayMs) return "Yesterday";
  if (d.getTime() >= startOfToday.getTime() - 6 * dayMs) return "This week";
  return "Earlier";
}

/**
 * Lets the page and the bell badge stay in step without a new state library:
 * whoever changes read state announces it, and the bell re-reads the
 * authoritative unread count from the server.
 */
export const NOTIFICATIONS_CHANGED_EVENT = "mealvest:notifications-changed";
export function announceNotificationsChanged() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}
