import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, PiggyBank, Lock, Check, Smartphone, KeyRound, TriangleAlert, RefreshCw, CalendarClock, Send, Info } from "lucide-react";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Modal } from "../../components/ui/Modal";
import { EmptyState } from "../../components/student/ui";
import { useAuth } from "../../context/AuthContext";
import { getWithdrawalStatus, requestWithdrawal, WithdrawalStatus, WithdrawalResult } from "../../services/budgetApi";
import { fetchStudentProfile } from "../../services/studentProfileApi";
import { GoogleSignInButton } from "../../components/GoogleSignInButton";
import { SkeletonRegion, SkeletonHero, SkeletonForm, Skeleton } from "../../components/ui/Skeleton";

const ksh = (v: number | string) => `KSh ${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function daysUntil(iso: string | undefined): number | null {
  if (!iso) return null;
  const end = new Date(iso.length === 10 ? iso + "T00:00:00" : iso).getTime();
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000));
}

/** One line of a receipt. */
function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="sv-receipt-row" data-strong={strong || undefined}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/**
 * Withdraw the unspent balance of an ENDED plan — everything the
 * student didn't eat, including every day's rollover they carried
 * forward. The server decides whether it's unlocked (plan end date
 * reached, not already withdrawn) and applies MEALVEST's fee; this
 * screen only shows that breakdown and collects the M-Pesa number.
 * Nothing here can withdraw early: POST /student/withdraw re-checks
 * the lock inside a row lock regardless of what the UI showed.
 *
 * The redesign changes presentation only. The one interaction change: the
 * browser's native confirm() is now an in-app confirmation sheet with the
 * same wording and the same fee / net / destination breakdown.
 */
export default function WithdrawSavingsScreen() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState<WithdrawalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [acceptFee, setAcceptFee] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<WithdrawalResult | null>(null);
  // Step-up proof (security fix M1): the server re-verifies this.
  const [pin, setPin] = useState("");
  const [needsGoogle, setNeedsGoogle] = useState(false);
  // Held only between "Withdraw" and "Confirm" in the sheet below.
  const [pendingProof, setPendingProof] = useState<{ pin?: string; googleIdToken?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [st, profile] = await Promise.all([getWithdrawalStatus(authFetch), fetchStudentProfile(authFetch).catch(() => null)]);
      setStatus(st);
      if (profile?.phone_number) setPhone((p) => p || profile.phone_number);
      // Accounts without a PIN (Google sign-in only) confirm with Google instead.
      if (profile && profile.has_pin === false && profile.has_google) setNeedsGoogle(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your savings.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const validateInputs = (): boolean => {
    setError(null);
    if (phone.replace(/\D/g, "").length < 9) {
      setError("Enter the M-Pesa number to send your savings to.");
      return false;
    }
    if (!acceptFee) {
      setError("Please confirm you understand the MEALVEST fee.");
      return false;
    }
    return true;
  };

  const send = async (proof: { pin?: string; googleIdToken?: string }) => {
    setSubmitting(true);
    try {
      const r = await requestWithdrawal(authFetch, {
        payoutMethod: "mpesa",
        payoutDestination: phone.trim(),
        acceptFee: true,
        ...proof,
      });
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request your withdrawal.");
      setPin("");
    } finally {
      setSubmitting(false);
      setPendingProof(null);
    }
  };

  const submit = () => {
    if (!/^\d{4}$/.test(pin)) {
      setError("Enter your 4-digit PIN to confirm this withdrawal.");
      return;
    }
    if (!validateInputs()) return;
    setPendingProof({ pin });
  };

  const submitWithGoogle = (googleIdToken: string) => {
    if (!validateInputs()) return;
    setPendingProof({ googleIdToken });
  };

  const back = (
    <button type="button" onClick={() => navigate(-1)} className="sv-backlink">
      <ArrowLeft size={16} aria-hidden />
      Back
    </button>
  );

  // ----- Loading ------------------------------------------------------------

  if (loading) {
    return (
      <div className="sv-flow-bg">
        <main className="sv-flow">
          {back}
          <SkeletonRegion label="your savings">
            <div className="sk-row" aria-hidden="true">
              <Skeleton w={52} h={52} r={999} />
              <div className="sk-col">
                <Skeleton h={26} w="60%" r={8} />
                <Skeleton h={12} w="85%" />
              </div>
            </div>
            <SkeletonHero h={230} />
            <SkeletonForm fields={2} />
          </SkeletonRegion>
        </main>
      </div>
    );
  }

  // ----- Result -------------------------------------------------------------

  if (result) {
    return (
      <div className="sv-flow-bg">
        <main className="sv-flow sv-flow--center">
          <span className="sv-medal" data-tone="ok" aria-hidden="true">
            <Check size={46} strokeWidth={3} />
          </span>
          <h1 className="sv-title" style={{ fontSize: 24 }}>Withdrawal requested</h1>
          <div className="sv-receipt-rows" style={{ width: "100%", maxWidth: 380 }}>
            <Line label="Savings withdrawn" value={ksh(result.gross_savings)} />
            <Line label={`MEALVEST fee (${result.platform_fee_percent}%)`} value={`− ${ksh(result.platform_fee_amount)}`} />
            <Line label="You receive" value={ksh(result.student_amount)} strong />
          </div>
          <p className="sv-lede" style={{ margin: 0 }}>
            MEALVEST sends this to {phone.trim()} by M-Pesa. You'll get a notification once it has gone out, and you can track it under Payments &amp; savings.
          </p>
          <button type="button" onClick={() => navigate("/student/home", { replace: true })} className="sv-link">
            Back to my dashboard
          </button>
        </main>
      </div>
    );
  }

  // ----- Couldn't load -------------------------------------------------------

  if (!status) {
    return (
      <div className="sv-flow-bg">
        <main className="sv-flow">
          {back}
          <EmptyState role="alert" icon={<RefreshCw size={28} />} title="We couldn't load your savings" body={error ?? "Something went wrong."}>
            <PrimaryButton type="button" variant="secondary" showArrow={false} icon={<RefreshCw size={16} aria-hidden />} onPress={load}>
              Try again
            </PrimaryButton>
          </EmptyState>
        </main>
      </div>
    );
  }

  const locked = status.locked;
  const gross = Number(status.availableSavings ?? 0);
  const net = status.netAmount ?? 0;
  const daysLeft = status.reason === "CONTRACT_ACTIVE" ? daysUntil(status.contractEndDate) : null;

  return (
    <div className="sv-flow-bg">
      <main className="sv-flow">
        {back}

        <header className="sv-flow-head">
          <span className="sv-flow-icon" aria-hidden="true">
            <PiggyBank size={24} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h1 className="sv-title" style={{ fontSize: 28 }}>Withdraw savings</h1>
            <p className="sv-lede" style={{ marginTop: 4 }}>Your unspent plan balance, including every day you carried over.</p>
          </div>
        </header>

        {error && (
          <div className="sv-toast" data-tone="bad" role="alert" style={{ alignItems: "flex-start" }}>
            <TriangleAlert size={18} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        {status.reason === "NO_ACTIVE_BUDGET" && (
          <EmptyState icon={<PiggyBank size={30} />} title="Nothing to withdraw">
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "var(--sv-muted)" }}>
              You don't have an active plan right now, so there's nothing to withdraw.
              {status.latestWithdrawal && (
                <>
                  {" "}
                  Your last withdrawal of <strong style={{ color: "var(--mv-cream)" }}>{ksh(status.latestWithdrawal.student_amount)}</strong> is{" "}
                  <strong style={{ color: "var(--mv-cream)" }}>{status.latestWithdrawal.status}</strong>.
                </>
              )}
            </p>
            <PrimaryButton type="button" variant="secondary" showArrow={false} onPress={() => navigate("/student/payments/statements")}>
              See payments &amp; savings history
            </PrimaryButton>
          </EmptyState>
        )}

        {status.reason !== "NO_ACTIVE_BUDGET" && (
          <>
            <section className="sv-receipt" aria-label="Savings breakdown">
              <div className="sv-amountplate" style={{ gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "#6b625c" }}>Available savings</span>
                <span style={{ fontSize: "clamp(34px, 10vw, 44px)", fontWeight: 800, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{ksh(gross)}</span>
              </div>
              <div className="sv-receipt-rows">
                <Line label={`MEALVEST fee (${status.feePercent}%)`} value={`− ${ksh(status.feeAmount ?? 0)}`} />
                <Line label="You receive" value={ksh(net)} strong />
              </div>
            </section>

            {locked ? (
              <div className="sv-note" role="status" style={{ padding: 16, gap: 14 }}>
                <span className="sv-row-icon" aria-hidden="true" style={{ flexShrink: 0, marginTop: 0 }}>
                  <Lock size={18} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: "block", fontSize: 14, marginBottom: 4 }}>
                    {status.reason === "ALREADY_WITHDRAWN" ? "Already withdrawn" : "Unlocks at the end of your plan"}
                  </b>
                  <span>
                    {status.reason === "ALREADY_WITHDRAWN"
                      ? "This plan's savings have already been requested."
                      : `Savings can be withdrawn from ${formatDate(status.contractEndDate)}, once your plan period ends. Until then, carry unused credit forward and it stays yours.`}
                  </span>
                  {daysLeft !== null && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, color: "var(--mv-amber)", fontWeight: 700 }}>
                      <CalendarClock size={15} aria-hidden />
                      {daysLeft === 0 ? "Unlocks today" : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} to go`}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <>
                <section>
                  <label className="sv-fieldlabel" htmlFor="wd-phone">M-Pesa number to receive the money</label>
                  <div className="sv-input">
                    <Smartphone size={18} aria-hidden />
                    <input id="wd-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                </section>

                <button type="button" role="checkbox" aria-checked={acceptFee} className="sv-check" onClick={() => setAcceptFee((v) => !v)}>
                  <span className="sv-check-box" aria-hidden="true">
                    <Check size={15} strokeWidth={3} />
                  </span>
                  <span>
                    I understand MEALVEST keeps a {status.feePercent}% fee on this withdrawal, that I receive {ksh(net)}, and that this closes my current plan.
                  </span>
                </button>

                {needsGoogle ? (
                  <section>
                    <span className="sv-fieldlabel">Confirm it's you</span>
                    <p className="sv-lede" style={{ margin: "0 0 12px 6px" }}>
                      Your account signs in with Google, so confirm this withdrawal with Google to send {ksh(net)}.
                    </p>
                    {acceptFee && gross > 0 && <GoogleSignInButton onIdToken={submitWithGoogle} loading={submitting} />}
                  </section>
                ) : (
                  <>
                    <section>
                      <label className="sv-fieldlabel" htmlFor="wd-pin">Your 4-digit PIN</label>
                      <div className="sv-input">
                        <KeyRound size={18} aria-hidden />
                        <input
                          id="wd-pin"
                          type="password"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={4}
                          placeholder="••••"
                          value={pin}
                          onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                        />
                      </div>
                    </section>

                    <PrimaryButton onPress={submit} loading={submitting} disabled={!acceptFee || gross <= 0} showArrow={false} icon={<Send size={18} aria-hidden />}>
                      {`Withdraw ${ksh(net)}`}
                    </PrimaryButton>
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>

      <Modal
        open={pendingProof !== null}
        title={`Withdraw ${ksh(gross)}?`}
        icon={<Info size={22} color="#E5482E" aria-hidden />}
        onClose={() => !submitting && setPendingProof(null)}
        actions={
          <>
            <PrimaryButton type="button" showArrow={false} loading={submitting} onPress={() => pendingProof && send(pendingProof)}>
              {`Confirm — receive ${ksh(net)}`}
            </PrimaryButton>
            <PrimaryButton type="button" variant="secondary" showArrow={false} disabled={submitting} onPress={() => setPendingProof(null)}>
              Cancel
            </PrimaryButton>
          </>
        }
      >
        {`MEALVEST fee (${status.feePercent}%): ${ksh(status.feeAmount ?? 0)}. You receive ${ksh(net)} to ${phone.trim()}. This closes your current plan.`}
      </Modal>
    </div>
  );
}
