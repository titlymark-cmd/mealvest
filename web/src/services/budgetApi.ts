export interface Budget {
  id: string;
  total_amount: string;
  remaining_amount: string;
  amount_spent: string;
  daily_allowance: string;
  number_of_days: number;
  start_date: string;
  end_date: string;
  status: string;
  remainingDays?: number;
  spent_today: string;
  banked_amount: string;
  pending_tomorrow_amount: string;
  last_spend_date: string | null;
}

/**
 * Takes `authFetch` from useAuth() as a parameter rather than
 * importing AuthContext here, so this stays a plain function module
 * (easy to test) instead of needing to be a hook itself.
 */
export async function createBudget(
  authFetch: (path: string, init?: RequestInit) => Promise<Response>,
  input: { totalAmount: number; numberOfDays: number; hotelId?: string | null; termsAccepted: true }
): Promise<Budget> {
  const res = await authFetch("/api/student/budget", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Could not create your meal plan.");
  return data.budget;
}

export async function getActiveBudget(
  authFetch: (path: string, init?: RequestInit) => Promise<Response>
): Promise<Budget | null> {
  const res = await authFetch("/api/student/budget");
  if (res.status === 404) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Could not load your meal plan.");
  return data.budget;
}

/**
 * The real backend call behind "transfer to next day" — moves
 * whatever's left of today's available amount into a holding pool
 * that only becomes spendable when a real day actually passes (see
 * budgetService.transferRemainingToNextDay). Throws with a clear
 * message if there's nothing left to transfer, which the screen
 * shows instead of the confirm-dialog succeeding silently.
 */
export async function transferToNextDay(
  authFetch: (path: string, init?: RequestInit) => Promise<Response>
): Promise<Budget> {
  const res = await authFetch("/api/student/budget/transfer-to-next-day", { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Could not transfer your balance.");
  return data.budget;
}
