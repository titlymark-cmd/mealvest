import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Zap, Smartphone, Check, ShieldCheck, TriangleAlert } from "lucide-react";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Spinner } from "../../components/Spinner";
import { formatAmount } from "../../components/student/ui";
import { useAuth } from "../../context/AuthContext";
import { initializeBoostPayment } from "../../services/paymentsApi";
import { usePaymentStatusPoll } from "../../hooks/usePaymentStatusPoll";

const PRESETS = [200, 500, 1000, 2000];

type Stage = "form" | "awaiting_stk" | "success" | "error";

/**
 * Same verified-payment shape as BudgetOnboardingScreen (initialize ->
 * M-Pesa STK push straight to the phone -> this screen polls verify in
 * place -> only THEN is anything credited) — see that screen's own
 * comment for the full rationale. The only real difference is what's
 * being paid for: this tops up the plan the student already has, it
 * doesn't start a new one.
 *
 * The redesign changes presentation only: validation, the initialize call,
 * the polling hook and every outcome message are unchanged.
 */
export default function MealBoostScreen() {
  const { authFetch, user } = useAuth();
  const navigate = useNavigate();
  const poll = usePaymentStatusPoll(authFetch);

  const [amount, setAmount] = useState("500");
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);
  const [displayText, setDisplayText] = useState<string | null>(null);
  const [paying, setPaying] = useState<{ amount: number; phone: string } | null>(null);

  useEffect(() => {
    if (poll.status === "success") {
      setStage("success");
      const timer = setTimeout(() => {
        navigate("/student/home", { replace: true });
      }, 1200);
      return () => clearTimeout(timer);
    }
    if (poll.status === "failed") {
      setError("Payment failed or was cancelled. You have not been charged.");
      setStage("error");
    } else if (poll.status === "timeout") {
      setError(
        "We haven't received confirmation yet. If you completed the payment, check back on your dashboard shortly — it will update automatically once Paystack confirms."
      );
      setStage("error");
    } else if (poll.status === "error") {
      setError(poll.error || "Could not check payment status.");
      setStage("error");
    }
  }, [poll.status, poll.error, navigate]);

  const startPayment = async () => {
    setError(null);
    const boostAmount = Number(amount);

    if (!boostAmount || boostAmount <= 0) return setError("Enter an amount greater than zero.");
    if (phone.replace(/\D/g, "").length < 9) return setError("Enter a valid phone number for M-Pesa.");
    if (!user?.email) return setError("Your account has no email on file — please contact support.");

    setPaying({ amount: boostAmount, phone: phone.trim() });
    setStage("awaiting_stk");
    try {
      const { reference, displayText: dt } = await initializeBoostPayment(authFetch, {
        amount: boostAmount,
        phone: phone.trim(),
        email: user.email,
      });
      setDisplayText(dt || "Enter your M-Pesa PIN on your phone to complete payment.");
      poll.start(reference);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start payment. Please try again.");
      setStage("error");
    }
  };

  if (stage === "success") {
    return (
      <div className="sv-flow-bg">
        <main className="sv-flow sv-flow--center" role="status">
          <span className="sv-medal" data-tone="ok" aria-hidden="true">
            <Check size={46} strokeWidth={3} />
          </span>
          <h1 className="sv-title" style={{ fontSize: 24 }}>Payment confirmed!</h1>
          <p className="sv-lede" style={{ margin: 0 }}>
            {paying ? `KSh ${formatAmount(paying.amount)} is now part of your plan. ` : ""}Taking you to your dashboard…
          </p>
        </main>
      </div>
    );
  }

  if (stage === "awaiting_stk") {
    return (
      <div className="sv-flow-bg">
        <main className="sv-flow sv-flow--center" role="status" aria-live="polite">
          <span className="sv-medal" data-pulse="true" aria-hidden="true">
            <Smartphone size={42} />
          </span>
          <h1 className="sv-title" style={{ fontSize: 24 }}>Check your phone</h1>
          <p className="sv-lede" style={{ margin: 0 }}>{displayText ?? "Sending the M-Pesa prompt…"}</p>
          {paying && (
            <div className="sv-receipt-rows" style={{ width: "100%", maxWidth: 360, marginTop: 8 }}>
              <div className="sv-receipt-row">
                <span>Amount</span>
                <span>KSh {formatAmount(paying.amount)}</span>
              </div>
              <div className="sv-receipt-row">
                <span>M-Pesa number</span>
                <span>{paying.phone}</span>
              </div>
            </div>
          )}
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, color: "var(--sv-muted)", fontSize: 13 }}>
            <Spinner color="#F5A623" />
            Waiting for M-Pesa to confirm…
          </div>
        </main>
      </div>
    );
  }

  const amountNumber = Number(amount);

  return (
    <div className="sv-flow-bg">
      <main className="sv-flow">
        <button type="button" onClick={() => navigate(-1)} className="sv-backlink">
          <ArrowLeft size={16} aria-hidden />
          Back
        </button>

        <header className="sv-flow-head">
          <span className="sv-flow-icon" aria-hidden="true">
            <Zap size={24} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h1 className="sv-title" style={{ fontSize: 28 }}>Meal Boost</h1>
            <p className="sv-lede" style={{ marginTop: 4 }}>
              Add a bit more money to your current plan. It goes straight into what's left, so your daily amount goes up for the rest of the plan.
            </p>
          </div>
        </header>

        <section aria-label="Amount">
          <div className="sv-amountplate">
            <label htmlFor="boost-amount">How much would you like to add?</label>
            <div className="sv-amountrow">
              <span>KSh</span>
              <input
                id="boost-amount"
                inputMode="numeric"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, "").slice(0, 7))}
                aria-describedby={error ? "boost-error" : undefined}
              />
            </div>
          </div>
          <div className="sv-presets" role="group" aria-label="Quick amounts" style={{ marginTop: 12 }}>
            {PRESETS.map((v) => (
              <button key={v} type="button" className="sv-preset" aria-pressed={amountNumber === v} onClick={() => setAmount(String(v))}>
                KSh {v.toLocaleString()}
              </button>
            ))}
          </div>
        </section>

        <section>
          <label className="sv-fieldlabel" htmlFor="boost-phone">M-Pesa phone number to pay with</label>
          <div className="sv-input">
            <Smartphone size={18} aria-hidden />
            <input id="boost-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </section>

        <div className="sv-note">
          <ShieldCheck size={18} aria-hidden />
          <span>
            You'll get an M-Pesa prompt on your phone. <b>Nothing is added to your plan until the payment is confirmed.</b>
          </span>
        </div>

        {error && (
          <div className="sv-toast" data-tone="bad" role="alert" id="boost-error" style={{ alignItems: "flex-start" }}>
            <TriangleAlert size={18} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}
        {stage === "error" && (
          <button type="button" onClick={() => navigate("/student/home")} className="sv-link">
            Check my dashboard instead — a payment may still confirm
          </button>
        )}

        <PrimaryButton onPress={startPayment} showArrow={false} icon={<Zap size={18} aria-hidden />}>
          {amountNumber > 0 ? `Boost my plan with KSh ${formatAmount(amountNumber)}` : "Boost my plan"}
        </PrimaryButton>

        <button type="button" onClick={() => navigate(-1)} className="sv-link">
          Not now
        </button>
      </main>
    </div>
  );
}
