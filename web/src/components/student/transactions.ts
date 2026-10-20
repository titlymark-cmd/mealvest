import { StudentPayment } from "../../services/paymentsApi";
import { WithdrawalRecord } from "../../services/budgetApi";
import type { BadgeTone } from "./ui";

/**
 * One display model for the two real ledgers the backend exposes:
 *   - /api/student/payments    (provider payments: plan payments, Meal Boost,
 *                               order payments, refunds)
 *   - /api/student/withdrawals (savings paid out to M-Pesa)
 * Nothing is invented or summed into a balance here; this only labels,
 * classifies and sorts rows the server already recorded.
 */
export type TxKind = "added" | "spent" | "refund" | "withdrawal";
/** pending = not settled yet; void = never completed (failed/cancelled/expired). */
export type TxOutcome = "done" | "pending" | "void";

export interface Transaction {
  id: string;
  kind: TxKind;
  title: string;
  amount: number;
  statusLabel: string;
  tone: BadgeTone;
  outcome: TxOutcome;
  /** +1 money in, -1 money out, 0 = not settled so no sign is shown */
  sign: 1 | -1 | 0;
  date: string;
  detail: string;
  reference: string | null;
  note: string | null;
  refunded: boolean;
}

const PROVIDER_LABEL: Record<string, string> = { cyzora: "M-Pesa via Cyzora", paystack: "M-Pesa via Paystack", daraja: "M-Pesa" };

const TYPE_TITLE: Record<StudentPayment["type"], string> = {
  budget_topup: "Meal plan payment",
  plan_boost: "Meal Boost top-up",
  order_payment: "Order payment",
  refund: "Refund",
};

const TYPE_KIND: Record<StudentPayment["type"], TxKind> = {
  budget_topup: "added",
  plan_boost: "added",
  order_payment: "spent",
  refund: "refund",
};

function paymentStatus(status: StudentPayment["status"]): { label: string; tone: BadgeTone; outcome: TxOutcome } {
  switch (status) {
    case "success":
      return { label: "Successful", tone: "ok", outcome: "done" };
    case "pending":
    case "processing":
      return { label: "Awaiting confirmation", tone: "warn", outcome: "pending" };
    case "failed":
      return { label: "Failed — not charged", tone: "bad", outcome: "void" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral", outcome: "void" };
    case "expired":
      return { label: "Expired", tone: "neutral", outcome: "void" };
    case "refunded":
      return { label: "Refunded", tone: "neutral", outcome: "done" };
    default:
      return { label: String(status), tone: "neutral", outcome: "pending" };
  }
}

function withdrawalStatus(status: WithdrawalRecord["status"]): { label: string; tone: BadgeTone; outcome: TxOutcome } {
  switch (status) {
    case "completed":
      return { label: "Sent to M-Pesa", tone: "ok", outcome: "done" };
    case "pending":
      return { label: "Requested", tone: "warn", outcome: "pending" };
    case "processing":
      return { label: "Being sent", tone: "warn", outcome: "pending" };
    case "failed":
      return { label: "Failed — we'll follow up", tone: "bad", outcome: "void" };
    case "rejected":
      return { label: "Declined", tone: "bad", outcome: "void" };
    default:
      return { label: String(status), tone: "neutral", outcome: "pending" };
  }
}

export function toTransactions(payments: StudentPayment[], withdrawals: WithdrawalRecord[]): Transaction[] {
  const fromPayments: Transaction[] = payments.map((p) => {
    const kind = TYPE_KIND[p.type] ?? "added";
    const st = paymentStatus(p.status);
    const detailParts = [PROVIDER_LABEL[p.provider] || p.provider];
    if (p.number_of_days) detailParts.push(`${p.number_of_days}-day plan`);
    if (p.hotel_name) detailParts.push(p.hotel_name);
    const direction = kind === "spent" ? -1 : 1;
    return {
      id: `p-${p.id}`,
      kind,
      title: TYPE_TITLE[p.type] || p.type,
      amount: Number(p.amount),
      statusLabel: st.label,
      tone: st.tone,
      outcome: st.outcome,
      sign: st.outcome === "done" && p.status === "success" ? (direction as 1 | -1) : 0,
      date: p.created_at,
      detail: detailParts.join(" · "),
      reference: p.provider_reference,
      note: p.status === "failed" ? p.result_description : null,
      refunded: p.status === "refunded" || p.type === "refund",
    };
  });

  const fromWithdrawals: Transaction[] = withdrawals.map((w) => {
    const st = withdrawalStatus(w.status);
    const dest = [w.payout_method === "mpesa" ? "M-Pesa" : w.payout_method || "", w.payout_destination || ""].filter(Boolean).join(" ");
    return {
      id: `w-${w.id}`,
      kind: "withdrawal",
      title: `Savings withdrawal${w.hotel_name ? ` · ${w.hotel_name}` : ""}`,
      amount: Number(w.student_amount),
      statusLabel: st.label,
      tone: st.tone,
      outcome: st.outcome,
      sign: w.status === "completed" ? -1 : 0,
      date: w.created_at,
      detail: `${dest ? `To ${dest} · ` : ""}fee ${Number(w.platform_fee_percent)}%`,
      reference: w.payout_reference,
      note: null,
      refunded: false,
    };
  });

  return [...fromPayments, ...fromWithdrawals].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
