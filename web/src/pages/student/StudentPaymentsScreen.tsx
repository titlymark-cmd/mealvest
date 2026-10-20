import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Zap, FileText, PiggyBank, Lock, ChevronRight, RefreshCw, Wallet as WalletIcon, Utensils } from "lucide-react";
import { PrimaryButton } from "../../components/PrimaryButton";
import { EmptyState, Money } from "../../components/student/ui";
import { TransactionRow } from "../../components/student/TransactionRow";
import { toTransactions, Transaction } from "../../components/student/transactions";
import { useAuth } from "../../context/AuthContext";
import { listMyPayments, StudentPayment } from "../../services/paymentsApi";
import { getActiveBudget, getWithdrawalStatus, listMyWithdrawals, Budget, WithdrawalRecord, WithdrawalStatus } from "../../services/budgetApi";
import logo from "../../assets/mealvest-logo.png";

const RECENT_COUNT = 4;

/**
 * Wallet (route unchanged: /student/payments).
 *
 * MEALVEST has no stored-value wallet endpoint: a student's money lives in
 * their meal plan (budget). So the wallet shows the plan's own authoritative
 * figures straight from /api/student/budget (remaining_amount, today's
 * spendable amount, carried-over amount, days left) — nothing is summed or
 * derived from the transaction list. Adding money is the existing Meal Boost
 * flow; the statements are the existing payment + withdrawal ledgers.
 *
 * Privacy: the balance is hidden every time this page opens. `revealed` is
 * plain component state (never persisted, never logged, no PIN involved) and
 * is purely presentational: it changes what is rendered, not any data.
 */
export default function StudentPaymentsScreen() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();

  const [revealed, setRevealed] = useState(false);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [withdrawal, setWithdrawal] = useState<WithdrawalStatus | null>(null);
  const [payments, setPayments] = useState<StudentPayment[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [b, p, w] = await Promise.all([getActiveBudget(authFetch), listMyPayments(authFetch), listMyWithdrawals(authFetch)]);
      setBudget(b);
      setPayments(p);
      setWithdrawals(w);
      // Savings lock state is secondary; the wallet still works without it.
      getWithdrawalStatus(authFetch)
        .then(setWithdrawal)
        .catch(() => setWithdrawal(null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your wallet.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const recent: Transaction[] = useMemo(() => toTransactions(payments, withdrawals).slice(0, RECENT_COUNT), [payments, withdrawals]);

  if (loading) {
    return (
      <div className="mv-container sv-page" aria-busy="true" aria-label="Loading your wallet">
        <h1 className="sv-title">Wallet</h1>
        <div className="sv-wallet-layout">
          <div className="mv-skel" style={{ height: 360 }} />
          <div className="mv-skel" style={{ height: 300 }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mv-container sv-page">
        <h1 className="sv-title">Wallet</h1>
        <EmptyState role="alert" icon={<RefreshCw size={28} />} title="We couldn't open your wallet" body={error}>
          <PrimaryButton type="button" variant="secondary" showArrow={false} icon={<RefreshCw size={16} aria-hidden />} onPress={load}>
            Try again
          </PrimaryButton>
        </EmptyState>
      </div>
    );
  }

  const dailyCredit = budget ? Number(budget.daily_allowance) : 0;
  const banked = budget ? Number(budget.banked_amount) : 0;
  const spentToday = budget ? Number(budget.spent_today) : 0;
  const availableToday = Math.max(0, dailyCredit + banked - spentToday);
  const daysTotal = budget?.number_of_days ?? 0;
  const daysLeft = budget ? budget.remainingDays ?? budget.number_of_days : 0;

  const savingsOpen = Boolean(withdrawal && !withdrawal.locked);

  return (
    <div className="mv-container sv-page">
      <header>
        <h1 className="sv-title">Wallet</h1>
        <p className="sv-lede">Your meal-plan money, kept private until you choose to show it.</p>
      </header>

      <div className="sv-wallet-layout">
        {/* ---- The wallet ---- */}
        <section className="sv-wallet" aria-label="Your MEALVEST wallet">
          <div className="sv-wallet-body">
            <div className="sv-wallet-head">
              <div className="sv-wallet-brand">
                <img src={logo} alt="" />
                <div>
                  <strong>MEALVEST</strong>
                  <span>Meal wallet</span>
                </div>
              </div>
              {budget && (
                <button
                  type="button"
                  className="sv-eye"
                  aria-pressed={revealed}
                  aria-label={revealed ? "Hide wallet amounts" : "Show wallet amounts"}
                  onClick={() => setRevealed((v) => !v)}
                >
                  {revealed ? <Eye size={20} aria-hidden /> : <EyeOff size={20} aria-hidden />}
                </button>
              )}
            </div>

            {budget ? (
              <>
                <div className="sv-plate">
                  <div className="sv-plate-label">
                    <WalletIcon size={15} aria-hidden />
                    Plan balance
                  </div>
                  <div className="sv-figure" aria-live="polite">
                    <span className="sv-figure-cur">KSh</span>
                    <span className="sv-figure-val" data-hidden={!revealed}>
                      <Money value={budget.remaining_amount} hidden={!revealed} withCurrency={false} />
                    </span>
                  </div>
                  <div className="sv-plate-sub">What's left of your plan, including anything carried over.</div>
                </div>

                <div className="sv-wallet-cells">
                  <div className="sv-cell">
                    <span>Available today</span>
                    <span>
                      <Money value={availableToday} hidden={!revealed} />
                    </span>
                  </div>
                  <div className="sv-cell">
                    <span>Carried over</span>
                    <span>
                      <Money value={banked} hidden={!revealed} />
                    </span>
                  </div>
                  <div className="sv-cell">
                    <span>Plan days left</span>
                    <span>
                      {daysLeft} of {daysTotal}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="sv-plate">
                <div className="sv-plate-label">
                  <WalletIcon size={15} aria-hidden />
                  No active plan
                </div>
                <div className="sv-plate-sub" style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.5 }}>
                  Your wallet fills when you start a meal plan. Pick a hotel to set one up.
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ---- Actions + activity ---- */}
        <div className="sv-stack" style={{ gap: 18 }}>
          <div className="sv-actions">
            {budget ? (
              <button type="button" className="sv-action" data-primary="true" onClick={() => navigate("/student/meal-boost")}>
                <span className="sv-action-icon" aria-hidden="true">
                  <Zap size={20} />
                </span>
                <span>
                  <b>Add money</b>
                  <small>Top up your plan with M-Pesa</small>
                </span>
              </button>
            ) : (
              <button type="button" className="sv-action" data-primary="true" onClick={() => navigate("/student")}>
                <span className="sv-action-icon" aria-hidden="true">
                  <Utensils size={20} />
                </span>
                <span>
                  <b>Start a meal plan</b>
                  <small>Choose a hotel and pay with M-Pesa</small>
                </span>
              </button>
            )}

            <button type="button" className="sv-action" onClick={() => navigate("/student/withdraw")}>
              <span className="sv-action-icon" aria-hidden="true">
                {savingsOpen ? <PiggyBank size={20} /> : <Lock size={18} />}
              </span>
              <span>
                <b>Savings</b>
                <small>{savingsOpen ? "Withdraw to M-Pesa" : "Opens when your plan ends"}</small>
              </span>
            </button>


            <button type="button" className="sv-action" onClick={() => navigate("/student/menu")} disabled={!budget}>
              <span className="sv-action-icon" aria-hidden="true">
                <Utensils size={20} />
              </span>
              <span>
                <b>Order a meal</b>
                <small>Spend from your plan</small>
              </span>
            </button>
          </div>

          <button type="button" className="sv-statement-cta" onClick={() => navigate("/student/payments/statements")}>
            <span className="sv-action-icon" aria-hidden="true">
              <FileText size={20} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b>View payment statements</b>
              <small>Every payment, refund and withdrawal, with its reference</small>
            </span>
            <ChevronRight size={20} aria-hidden />
          </button>

          <section aria-labelledby="recent-activity" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 className="sv-h2" id="recent-activity">
              Recent activity
            </h2>
            {recent.length === 0 ? (
              <div className="sv-group">
                <div className="sv-row" style={{ minHeight: 72 }}>
                  <span className="sv-row-main">
                    <span className="sv-row-label">No activity yet</span>
                    <span className="sv-row-sub">Payments you make into MEALVEST will appear here.</span>
                  </span>
                </div>
              </div>
            ) : (
              <div className="sv-group">
                {recent.map((t) => (
                  <TransactionRow key={t.id} tx={t} hidden={!revealed} compact />
                ))}
              </div>
            )}
            {!revealed && recent.length > 0 && <p className="sv-meta" style={{ margin: "0 0 0 6px" }}>Amounts are hidden. Use the eye button on your wallet to show them.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
