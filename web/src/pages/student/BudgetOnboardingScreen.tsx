import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarDays, Check, CircleAlert, ExternalLink, Info, ShieldCheck, Smartphone, Store, TriangleAlert } from "lucide-react";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Spinner } from "../../components/Spinner";
import { TermsCheckbox } from "../../components/student/TermsCheckbox";
import { useAuth } from "../../context/AuthContext";
import { initializePayment, initializeCheckoutPayment, getPaymentConfig, PaymentConfig } from "../../services/paymentsApi";
import { usePaymentStatusPoll } from "../../hooks/usePaymentStatusPoll";
import { computeDailyAllowance, PLAN_FIELD_ORDER, PlanField, validatePlan } from "../../utils/planSetup";
import "../../styles/onboarding.css";

const PRESETS = [2000, 3000, 5000, 12000, 15000];
const DAY_PRESETS = [7, 14, 30, 60];
// Used only until GET /api/payments/config reports the live figure (or when an older server omits it).
const FALLBACK_FEE_NOTE = "less the MEALVEST withdrawal fee";

/**
 * Same four statements as before (wording unchanged); only the fee figure is
 * now read from the server instead of being typed in, so it can't drift when
 * the admin changes the withdrawal fee.
 */
function termsPoints(feePercent: number | undefined): string[] {
  const fee = feePercent === undefined ? FALLBACK_FEE_NOTE : `less a ${feePercent}% MEALVEST fee`;
  return [
    "Money committed to your Mealvest plan is intended for meals during the selected plan period.",
    "Committed funds are not immediately withdrawable or refundable before the plan period ends, except where a supported cancellation policy applies.",
    `Unused daily meal balance isn't spent automatically — each day, you'll be asked to carry it over to the next day. Whatever is still unspent when your plan ends becomes savings you can withdraw to M-Pesa, ${fee}.`,
    "Please review your amount, days, and hotel before confirming.",
  ];
}

type Stage = "form" | "awaiting_stk" | "success" | "error";

const fmt = (n: number) => n.toLocaleString("en-KE", { maximumFractionDigits: 2 });

/**
 * Onboarding stage 3: set up the plan and pay.
 *
 * Business flow unchanged:
 *   1. initializePayment() — requires termsAccepted:true or the backend
 *      rejects the request before the provider is contacted. Triggers an
 *      M-Pesa STK push straight to the student's phone.
 *   2. This screen polls verifyPayment() in place (usePaymentStatusPoll)
 *      until the provider confirms — nothing here can mark a payment
 *      successful on its own; the poll only watches for the backend's own
 *      activatePaymentIfNeeded to have run.
 * What changed: presentation, field-level validation aligned with the
 * server's real limits, an accessible terms checkbox, and a submit guard.
 */
export default function BudgetOnboardingScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const { hotelId, hotelName, selectedItemName, selectedItemPrice } = (location.state as any) || {};
  const { authFetch, user } = useAuth();
  const poll = usePaymentStatusPoll(authFetch);

  const [amount, setAmount] = useState("5000");
  const [days, setDays] = useState("30");
  const [phone, setPhone] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const [attempted, setAttempted] = useState(false); // show field errors only after a submit attempt
  const [error, setError] = useState<string | null>(null); // server / payment-level problem
  const [displayText, setDisplayText] = useState<string | null>(null);
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [openingCheckout, setOpeningCheckout] = useState(false);
  const [paying, setPaying] = useState<{ amount: number; phone: string } | null>(null);
  const submitLock = useRef(false); // synchronous guard: state updates are async, a fast double-tap is not

  // Hosted checkout is a Cyzora-only alternative to the STK push; the
  // server says whether it exists for the active provider so this
  // screen never shows a dead button on a Paystack deployment.
  const hostedCheckoutAvailable = Boolean(config?.hostedCheckoutAvailable);
  const providerLabel = config?.provider === "cyzora" ? "Cyzora" : "Paystack";

  useEffect(() => {
    let cancelled = false;
    getPaymentConfig(authFetch)
      .then((cfg) => {
        if (!cancelled) setConfig(cfg);
      })
      .catch(() => {
        /* optional capability — stay on the STK-only form with basic validation */
      });
    return () => {
      cancelled = true;
    };
  }, [authFetch]);

  // The app scrolls inside one shared container, so arriving from a long page
  // would otherwise land mid-way down this one. Start at the top.
  useEffect(() => {
    document.getElementById("root")?.scrollTo?.({ top: 0 });
    window.scrollTo?.(0, 0);
  }, []);

  // Don't keep polling for a payment after the student leaves this screen.
  const { stop: stopPolling } = poll;
  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    if (poll.status === "success") {
      setStage("success");
      const timer = setTimeout(() => {
        navigate("/student/home", { replace: true, state: hotelName ? { hotelName } : undefined });
      }, 1200);
      return () => clearTimeout(timer);
    }
    if (poll.status === "failed") {
      setError("Payment failed or was cancelled. You have not been charged.");
      setStage("error");
      submitLock.current = false;
    } else if (poll.status === "timeout") {
      setError(
        `We haven't received confirmation yet. If you completed the payment, check back on your dashboard shortly — it will update automatically once ${providerLabel} confirms.`
      );
      setStage("error");
      submitLock.current = false;
    } else if (poll.status === "error") {
      setError(poll.error || "Could not check payment status.");
      setStage("error");
      submitLock.current = false;
    }
  }, [poll.status, poll.error, navigate, hotelName, providerLabel]);

  const limits = config?.limits ?? null;
  const validation = useMemo(
    () => validatePlan({ amount, days, phone, termsAccepted, email: user?.email, limits }),
    [amount, days, phone, termsAccepted, user?.email, limits]
  );
  // Never present a figure for a plan that can't actually be bought (e.g. below the minimum).
  const planNumbersOk = !validation.errors.amount && !validation.errors.days;
  const dailyAllowance = planNumbersOk ? computeDailyAllowance(Number(amount), Number(days)) : null;
  const fieldError = (f: PlanField) => (attempted ? validation.errors[f] : undefined);
  const busy = stage === "awaiting_stk" || openingCheckout;
  const dayPresets = DAY_PRESETS.filter((d) => !limits || (d >= limits.minDays && d <= limits.maxDays));

  /** Returns validated values, or reveals the problems and moves focus to the first one. */
  const validateForm = () => {
    setError(null);
    setAttempted(true);
    if (validation.values) return validation.values;
    const first = PLAN_FIELD_ORDER.find((f) => validation.errors[f]);
    const ids: Partial<Record<PlanField, string>> = { amount: "plan-amount", days: "plan-days", phone: "plan-phone", terms: "plan-terms" };
    if (first && ids[first]) document.getElementById(ids[first]!)?.focus();
    if (first === "email") setError(validation.errors.email || null);
    return null;
  };

  /**
   * Cyzora hosted checkout: the server creates the session, the
   * browser navigates to Cyzora's page, and Cyzora sends the student
   * back to /payment/callback?reference=…, which polls the server's
   * verify endpoint exactly like the STK flow does. Nothing about the
   * redirect itself is treated as proof of payment.
   */
  const startHostedCheckout = async () => {
    if (submitLock.current) return;
    const form = validateForm();
    if (!form) return;
    submitLock.current = true;
    setOpeningCheckout(true);
    try {
      const { checkoutUrl } = await initializeCheckoutPayment(authFetch, {
        amount: form.totalAmount,
        numberOfDays: form.numberOfDays,
        phone: form.phone,
        email: form.email,
        hotelId: hotelId ?? null,
        termsAccepted: true,
      });
      window.location.assign(checkoutUrl);
    } catch (err) {
      submitLock.current = false;
      setOpeningCheckout(false);
      setError(err instanceof Error ? err.message : "Could not open the checkout page. Please try again.");
    }
  };

  const startPayment = async () => {
    if (submitLock.current) return; // ignore a second tap while a request is in flight
    const form = validateForm();
    if (!form) return;
    submitLock.current = true;
    const { totalAmount, numberOfDays } = form;

    setPaying({ amount: totalAmount, phone: form.phone });
    setStage("awaiting_stk");
    try {
      const { reference, displayText: dt } = await initializePayment(authFetch, {
        amount: totalAmount,
        numberOfDays,
        phone: form.phone,
        email: form.email,
        hotelId: hotelId ?? null,
        termsAccepted: true,
      });
      setDisplayText(dt || "Enter your M-Pesa PIN on your phone to complete payment.");
      poll.start(reference);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start payment. Please try again.");
      setStage("error");
      submitLock.current = false;
    }
  };

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      startPayment();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [amount, days, phone, termsAccepted, user?.email, limits, hotelId, authFetch]
  );

  if (stage === "success") {
    return (
      <div className="sv-flow-bg">
        <main className="sv-flow sv-flow--center" role="status">
          <span className="sv-medal" data-tone="ok" aria-hidden="true">
            <Check size={46} strokeWidth={3} />
          </span>
          <h1 className="sv-title" style={{ fontSize: 24 }}>
            Payment confirmed!
          </h1>
          <p className="sv-lede" style={{ margin: 0 }}>
            Taking you to your dashboard…
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
          <h1 className="sv-title" style={{ fontSize: 24 }}>
            Check your phone
          </h1>
          <p className="sv-lede" style={{ margin: 0 }}>
            {displayText ?? "Sending the M-Pesa prompt…"}
          </p>
          {paying && (
            <div className="sv-receipt-rows" style={{ width: "100%", maxWidth: 360, marginTop: 8 }}>
              <div className="sv-receipt-row">
                <span>Amount</span>
                <span>KSh {fmt(paying.amount)}</span>
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

  const feePercent = config?.withdrawalFeePercent;
  const amountErr = fieldError("amount");
  const daysErr = fieldError("days");
  const phoneErr = fieldError("phone");
  const termsErr = fieldError("terms");
  const totalNumber = Number(amount);
  const daysNumber = Number(days);
  const rangeHint = limits ? `KSh ${fmt(limits.minAmount)} – ${fmt(limits.maxAmount)}` : null;

  return (
    <div className="ob-bg">
      <div className="ob-wrap">
        <button type="button" onClick={() => navigate(-1)} className="ob-back ob-rise">
          <ArrowLeft size={18} aria-hidden="true" /> Back
        </button>

        <header className="ob-rise">
          <h1 className="sv-title">Set up your plan</h1>
          <p className="sv-lede">
            {hotelName ? `For ${hotelName}. ` : ""}
            Tell us how much you have and how many days it should cover.
          </p>
        </header>

        <form className="ob-plan" onSubmit={onSubmit} noValidate>
          {/* ------------------------- inputs ------------------------- */}
          <div className="ob-col ob-plan-inputs">
            {selectedItemName && (
              <div className="sv-note">
                <Info size={18} aria-hidden="true" />
                <span>
                  You requested <b>{selectedItemName}</b> — KSh {Number(selectedItemPrice).toLocaleString()}
                </span>
              </div>
            )}
            {!hotelId && (
              <div className="sv-note">
                <Store size={18} aria-hidden="true" />
                <span>
                  No hotel is selected for this plan.{" "}
                  <button type="button" className="sv-link" onClick={() => navigate("/student")} style={{ display: "inline", minHeight: 0, padding: 0 }}>
                    Choose a hotel
                  </button>
                </span>
              </div>
            )}

            <section className="ob-section" aria-label="Amount">
              <div className="sv-amountplate" data-invalid={amountErr ? "true" : undefined}>
                <label htmlFor="plan-amount">How much do you have for food?</label>
                <div className="sv-amountrow">
                  <span>KSh</span>
                  <input
                    id="plan-amount"
                    inputMode="numeric"
                    autoComplete="off"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, "").slice(0, 7))}
                    aria-invalid={amountErr ? true : undefined}
                    aria-describedby={amountErr ? "plan-amount-error" : rangeHint ? "plan-amount-hint" : undefined}
                  />
                </div>
              </div>
              <div className="sv-presets" role="group" aria-label="Quick amounts" style={{ marginTop: 12 }}>
                {PRESETS.map((v) => (
                  <button key={v} type="button" className="sv-preset" aria-pressed={totalNumber === v} onClick={() => setAmount(String(v))}>
                    KSh {v.toLocaleString()}
                  </button>
                ))}
              </div>
              {amountErr ? (
                <p className="ob-field-error" id="plan-amount-error" role="alert">
                  <CircleAlert size={16} aria-hidden="true" />
                  {amountErr}
                </p>
              ) : (
                rangeHint && (
                  <p className="ob-hint" id="plan-amount-hint">
                    You can start a plan with {rangeHint}.
                  </p>
                )
              )}
            </section>

            <section className="ob-section" aria-label="Plan length">
              <label className="sv-fieldlabel" htmlFor="plan-days">
                How many days should this cover?
              </label>
              <div className="sv-input" data-invalid={daysErr ? "true" : undefined}>
                <CalendarDays size={18} aria-hidden="true" />
                <input
                  id="plan-days"
                  inputMode="numeric"
                  autoComplete="off"
                  value={days}
                  onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                  aria-invalid={daysErr ? true : undefined}
                  aria-describedby={daysErr ? "plan-days-error" : undefined}
                />
                <span className="ob-suffix" aria-hidden="true" style={{ paddingRight: 14 }}>
                  days
                </span>
              </div>
              <div className="sv-presets" role="group" aria-label="Quick plan lengths" style={{ marginTop: 12 }}>
                {dayPresets.map((d) => (
                  <button key={d} type="button" className="sv-preset" aria-pressed={daysNumber === d} onClick={() => setDays(String(d))}>
                    {d} days
                  </button>
                ))}
              </div>
              {daysErr && (
                <p className="ob-field-error" id="plan-days-error" role="alert">
                  <CircleAlert size={16} aria-hidden="true" />
                  {daysErr}
                </p>
              )}
            </section>

            <section className="ob-section" aria-label="Payment number">
              <label className="sv-fieldlabel" htmlFor="plan-phone">
                M-Pesa phone number to pay with
              </label>
              <div className="sv-input" data-invalid={phoneErr ? "true" : undefined}>
                <Smartphone size={18} aria-hidden="true" />
                <input
                  id="plan-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="07XX XXX XXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  aria-invalid={phoneErr ? true : undefined}
                  aria-describedby={phoneErr ? "plan-phone-error" : undefined}
                />
              </div>
              {phoneErr && (
                <p className="ob-field-error" id="plan-phone-error" role="alert">
                  <CircleAlert size={16} aria-hidden="true" />
                  {phoneErr}
                </p>
              )}
            </section>
          </div>

          {/* ---------------- summary, terms, confirm ---------------- */}
          <aside className="ob-col ob-plan-aside" aria-label="Plan summary and confirmation">
            <div className="ob-summary">
              <h2>Your plan</h2>
              <div className="ob-credit" aria-live="polite">
                <span>Daily meal credit</span>
                <strong>{dailyAllowance !== null ? `KSh ${fmt(dailyAllowance)}/day` : "—"}</strong>
                <em>{dailyAllowance !== null ? "Your meal budget for each day of the plan" : "Enter a valid amount and number of days"}</em>
              </div>
              <div className="sv-receipt-rows">
                <div className="sv-receipt-row">
                  <span>Hotel</span>
                  <span>{hotelName || "Not selected"}</span>
                </div>
                <div className="sv-receipt-row">
                  <span>Plan length</span>
                  <span>{planNumbersOk && daysNumber > 0 ? `${daysNumber} ${daysNumber === 1 ? "day" : "days"}` : "—"}</span>
                </div>
                <div className="sv-receipt-row" data-strong="true">
                  <span>You pay today</span>
                  <span>{planNumbersOk && totalNumber > 0 ? `KSh ${fmt(totalNumber)}` : "—"}</span>
                </div>
              </div>
              <p className="ob-hint" style={{ margin: 0 }}>
                Your plan starts when M-Pesa confirms your payment and runs for the number of days above.
              </p>
            </div>

            <section className="ob-terms-card" aria-labelledby="plan-terms-title">
              <h3 id="plan-terms-title">Important MEALVEST terms</h3>
              <ul>
                {termsPoints(feePercent).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <a href="/terms?section=payments" target="_blank" rel="noopener noreferrer">
                Read the full terms, payments &amp; savings policy <ExternalLink size={14} aria-hidden="true" />
              </a>
            </section>

            <div>
              <TermsCheckbox
                id="plan-terms"
                checked={termsAccepted}
                onChange={setTermsAccepted}
                disabled={busy}
                invalid={Boolean(termsErr)}
                describedBy={termsErr ? "plan-terms-error" : undefined}
              >
                I have read and understand the Mealvest payment and contract terms.
              </TermsCheckbox>
              {termsErr && (
                <p className="ob-field-error" id="plan-terms-error" role="alert">
                  <CircleAlert size={16} aria-hidden="true" />
                  {termsErr}
                </p>
              )}
            </div>

            {error && (
              <div className="sv-toast" data-tone="bad" role="alert" style={{ alignItems: "flex-start" }}>
                <TriangleAlert size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}
            {stage === "error" && (
              <button type="button" onClick={() => navigate("/student/home")} className="sv-link">
                Check my dashboard instead — a payment may still confirm
              </button>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <PrimaryButton type="submit" disabled={busy} loading={openingCheckout}>
                Pay with M-Pesa
              </PrimaryButton>
              {hostedCheckoutAvailable && (
                <PrimaryButton variant="secondary" type="button" onPress={startHostedCheckout} disabled={busy} showArrow={false}>
                  {openingCheckout ? "Opening secure checkout…" : `Pay on ${providerLabel}'s secure checkout page instead`}
                </PrimaryButton>
              )}
            </div>
            <p className="ob-hint" style={{ margin: "0 0 0 6px", display: "flex", gap: 8, alignItems: "flex-start" }}>
              <ShieldCheck size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>You'll get an M-Pesa prompt on your phone. Nothing is added to your plan until the payment is confirmed.</span>
            </p>
          </aside>
        </form>
      </div>
    </div>
  );
}
