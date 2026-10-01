import { notify } from "./notificationService";
import { pool } from "../config/db";

/**
 * Named, business-event-specific helpers wrapping notificationService.
 * notify() — this is the ONE place notification title/body/category
 * text lives, so a payment/order/budget code path calls e.g.
 * `notificationEvents.paymentSuccess(...)` rather than constructing
 * notification text inline. Every call here is fire-and-forget by
 * convention (`void notificationEvents.x(...)`) at the call site —
 * notify() itself never throws, but callers still never `await` these
 * inline in a hot path, per the spec's requirement that a notification
 * can never block or reverse a real transaction.
 *
 * Only events with a real, unambiguous trigger point in this app's
 * actual business logic are implemented here — see the final report
 * for the handful of spec-listed events (e.g. an automatic "daily
 * budget recharged" push) deliberately left out because their only
 * available hook is a lazy, read-triggered code path
 * (budgetService.applyDailyRollover runs on nearly every budget read),
 * where firing a notification would mean spamming on page loads
 * rather than once per real event.
 */

const formatKsh = (amount: number) => `KSh ${Math.round(amount).toLocaleString()}`;

// ---------------------------------------------------------------------------
// ACCOUNT
// ---------------------------------------------------------------------------

export function welcomeStudent(userId: string, fullName: string): void {
  void notify({
    userId,
    type: "welcome_student",
    title: "Welcome to MEALVEST 👋",
    body: `Hi ${fullName}, your account is ready. Fund a meal plan to start eating well every day.`,
    deepLink: "/student/home",
    category: "announcements",
  });
}

export function welcomeHotel(userId: string, hotelName: string): void {
  void notify({
    userId,
    type: "welcome_hotel",
    title: "Welcome to MEALVEST 👋",
    body: `${hotelName}'s partner application has been received. We'll notify you once it's approved.`,
    deepLink: "/hotel-owner/home",
    category: "announcements",
  });
}

export function securityPasswordChanged(userId: string): void {
  void notify({
    userId,
    type: "security_password_changed",
    title: "Your password was changed",
    body: "Your MEALVEST password was just reset. If this wasn't you, contact support immediately.",
    category: "security_alerts",
  });
}

// ---------------------------------------------------------------------------
// PAYMENTS / WALLET — a successful plan/boost payment IS the "wallet
// funded" event in this app (there's no separate funding step), so
// one notification covers both rather than firing twice for the same
// underlying transaction.
// ---------------------------------------------------------------------------

export function paymentSuccess(userId: string, amount: number, reference: string, isBoost: boolean): void {
  void notify({
    userId,
    type: isBoost ? "boost_success" : "payment_success",
    title: "Payment successful ✅",
    body: isBoost
      ? `${formatKsh(amount)} was added to your meal plan.`
      : `${formatKsh(amount)} was credited to your MEALVEST meal plan.`,
    deepLink: "/student/home",
    category: "payment_updates",
    dedupeKey: `payment_success:${reference}`,
  });
}

export function paymentFailed(userId: string, amount: number, reference: string): void {
  void notify({
    userId,
    type: "payment_failed",
    title: "Payment failed",
    body: `Your ${formatKsh(amount)} payment could not be completed. You have not been charged.`,
    deepLink: "/student/home",
    category: "payment_updates",
    dedupeKey: `payment_failed:${reference}`,
  });
}

export function lowBudgetWarning(userId: string, budgetId: string, spendableToday: number): void {
  const today = new Date().toISOString().slice(0, 10);
  void notify({
    userId,
    type: "low_budget_warning",
    title: "Low meal balance ⚠️",
    body: `You have ${formatKsh(spendableToday)} left for today — under a quarter of your daily amount.`,
    deepLink: "/student/home",
    category: "wallet_alerts",
    // Once per budget per day — a student placing several orders in
    // one day while already low shouldn't get repeated warnings.
    dedupeKey: `low_budget:${budgetId}:${today}`,
  });
}

// ---------------------------------------------------------------------------
// MEALS
// ---------------------------------------------------------------------------

/** Fired by the meal-reminders cron (see routes/cron.routes.ts) — once per user per day, regardless of how many times that day's bucket is checked. */
export function mealReminder(userId: string, nairobiDateStr: string): void {
  void notify({
    userId,
    type: "meal_reminder",
    title: "Don't forget your meal today 🍽️",
    body: "Your MEALVEST plan is ready whenever you're hungry — tap to order.",
    deepLink: "/student/home",
    category: "meal_reminders",
    dedupeKey: `meal_reminder:${nairobiDateStr}`,
  });
}

export function mealPassGenerated(userId: string, hotelName: string, amount: number): void {
  void notify({
    userId,
    type: "meal_pass_generated",
    title: "Your meal pass is ready 📱",
    body: `${formatKsh(amount)} at ${hotelName} — show your QR code to redeem.`,
    deepLink: "/student/home",
    category: "wallet_alerts",
  });
}

export function mealRedeemed(userId: string, hotelName: string, amount: number): void {
  void notify({
    userId,
    type: "meal_redeemed",
    title: "Meal redeemed 🍛",
    body: `Your ${formatKsh(amount)} meal at ${hotelName} was redeemed. Enjoy!`,
    deepLink: "/student/home",
    category: "wallet_alerts",
  });
}

// ---------------------------------------------------------------------------
// HOTEL — notifies every hotel_staff row for the hotel (owner and any
// staff accounts alike), never the student's own name/identity, per
// the "do not expose student private information unnecessarily" rule.
// ---------------------------------------------------------------------------

async function notifyHotelStaff(
  hotelId: string,
  build: (userId: string) => Parameters<typeof notify>[0]
): Promise<void> {
  try {
    const result = await pool.query("SELECT user_id FROM hotel_staff WHERE hotel_id = $1", [hotelId]);
    for (const row of result.rows) {
      void notify(build(row.user_id));
    }
  } catch (err) {
    console.error("[notificationEvents.notifyHotelStaff] failed:", err);
  }
}

export function hotelOrderReceived(hotelId: string, amount: number, orderId: string): void {
  void notifyHotelStaff(hotelId, (userId) => ({
    userId,
    type: "hotel_order_received",
    title: "New order received",
    body: `A student paid for a ${formatKsh(amount)} meal — waiting for prep.`,
    deepLink: "/hotel-owner/orders",
    category: "payment_updates",
    dedupeKey: `hotel_order_received:${orderId}`,
  }));
}

export function hotelMealRedeemed(hotelId: string, hotelAmount: number, orderId: string): void {
  void notifyHotelStaff(hotelId, (userId) => ({
    userId,
    type: "hotel_meal_redeemed",
    title: "Meal redeemed",
    body: `A meal was redeemed — ${formatKsh(hotelAmount)} added to your revenue.`,
    deepLink: "/hotel-owner/orders",
    category: "payment_updates",
    dedupeKey: `hotel_meal_redeemed:${orderId}`,
  }));
}

export function hotelPayoutStatusChanged(hotelId: string, status: "successful" | "failed", amount: number): void {
  void notifyHotelStaff(hotelId, (userId) => ({
    userId,
    type: "hotel_payout_status",
    title: status === "successful" ? "Payout sent ✅" : "Payout failed",
    body:
      status === "successful"
        ? `${formatKsh(amount)} has been sent to your registered M-Pesa number.`
        : `A ${formatKsh(amount)} payout to your account failed — MEALVEST will retry or follow up.`,
    deepLink: "/hotel-owner/home",
    category: "payment_updates",
  }));
}
