export interface Budget {
  id: string;
  hotel_id: string | null;
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
  pending_rollover_amount: string;
  last_spend_date: string | null;
}

/**
 * Takes `authFetch` from useAuth() as a parameter rather than
 * importing AuthContext here, so this stays a plain function module
 * (easy to test) instead of needing to be a hook itself.
 *
 * Note: there is deliberately no `createBudget` here — a plan is only
 * ever created server-side after a verified payment (paymentsApi).
 */
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

/**
 * The student's "yes, carry it over" answer to budget.pending_rollover_amount
 * (see RolloverPrompt) — moves it into banked_amount, where it becomes
 * spendable today.
 */
export async function confirmRollover(
  authFetch: (path: string, init?: RequestInit) => Promise<Response>
): Promise<Budget> {
  const res = await authFetch("/api/student/budget/rollover/confirm", { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Could not confirm the carry-over.");
  return data.budget;
}

/** The student's "no, don't carry it over" answer — forfeits it permanently. */
export async function declineRollover(
  authFetch: (path: string, init?: RequestInit) => Promise<Response>
): Promise<Budget> {
  const res = await authFetch("/api/student/budget/rollover/decline", { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Could not decline the carry-over.");
  return data.budget;
}

// ---------------------------------------------------------------------------
// Savings withdrawal (unspent plan balance, incl. rollover, after plan end)
// ---------------------------------------------------------------------------

export interface WithdrawalRecord {
  id: string;
  gross_savings: string;
  student_amount: string;
  platform_fee_percent: string;
  platform_fee_amount: string;
  hotel_incentive_amount?: string;
  payout_method: "mpesa" | "bank" | null;
  payout_destination: string | null;
  status: "pending" | "processing" | "completed" | "failed" | "rejected";
  created_at: string;
  processed_at: string | null;
  payout_reference: string | null;
  hotel_name?: string | null;
}

export interface WithdrawalStatus {
  locked: boolean;
  reason: "NO_ACTIVE_BUDGET" | "CONTRACT_ACTIVE" | "ALREADY_WITHDRAWN" | null;
  contractEndDate?: string;
  availableSavings?: string;
  feePercent: number;
  feeAmount?: number;
  netAmount?: number;
  latestWithdrawal: WithdrawalRecord | null;
}

/** Read-only mirror of the server's withdrawal lock — the real check happens again inside POST /student/withdraw. */
export async function getWithdrawalStatus(
  authFetch: (path: string, init?: RequestInit) => Promise<Response>
): Promise<WithdrawalStatus> {
  const res = await authFetch("/api/student/withdrawal-status");
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Could not load your savings status.");
  return data;
}

export interface WithdrawalResult {
  withdrawalId: string;
  gross_savings: number;
  platform_fee_percent: number;
  platform_fee_amount: number;
  student_amount: number;
  status: string;
}

/**
 * Requests the payout of an ENDED plan's unspent balance to the given
 * M-Pesa number. MEALVEST's fee (10% by default) is deducted
 * server-side and shown back in the result; the plan is closed. The
 * actual M-Pesa send is completed by MEALVEST and the status moves to
 * "completed" once it has gone out.
 */
export async function requestWithdrawal(
  authFetch: (path: string, init?: RequestInit) => Promise<Response>,
  input: { payoutMethod: "mpesa"; payoutDestination: string; acceptFee: true; pin?: string; googleIdToken?: string }
): Promise<WithdrawalResult> {
  const res = await authFetch("/api/student/withdraw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Could not request your withdrawal.");
  return data;
}

export async function listMyWithdrawals(
  authFetch: (path: string, init?: RequestInit) => Promise<Response>
): Promise<WithdrawalRecord[]> {
  const res = await authFetch("/api/student/withdrawals");
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Could not load your withdrawals.");
  return data.withdrawals;
}
