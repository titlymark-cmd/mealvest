import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowDownToLine, ArrowUpFromLine, Undo2, ShoppingBag, ListChecks, RefreshCw, FileText, Eye, EyeOff } from "lucide-react";
import { PrimaryButton } from "../../components/PrimaryButton";
import { EmptyState, Money, groupBy, monthLabel } from "../../components/student/ui";
import { TransactionRow } from "../../components/student/TransactionRow";
import { toTransactions, Transaction, TxKind } from "../../components/student/transactions";
import { useAuth } from "../../context/AuthContext";
import { listMyPayments } from "../../services/paymentsApi";
import { listMyWithdrawals } from "../../services/budgetApi";

type KindFilter = "all" | TxKind;
type Range = "all" | "30" | "90";

const KIND_META: Record<TxKind, { label: string; Icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>; empty: string }> = {
  added: { label: "Money added", Icon: ArrowDownToLine, empty: "Plan payments and Meal Boost top-ups you make will be listed here." },
  spent: { label: "Money spent", Icon: ShoppingBag, empty: "Order payments will be listed here." },
  refund: { label: "Refunds", Icon: Undo2, empty: "Refunds and reversals will be listed here." },
  withdrawal: { label: "Withdrawals", Icon: ArrowUpFromLine, empty: "Savings you withdraw to M-Pesa will be listed here." },
};
const KIND_ORDER: TxKind[] = ["added", "spent", "refund", "withdrawal"];

/**
 * Payment statements: the student's own records, read from the same two
 * ledgers the server already keeps (payments + savings withdrawals).
 * "Money added" only ever contains plan payments and Meal Boost top-ups; money
 * going out is kept in separate categories, never mixed into deposits.
 *
 * Authorization is the server's job (both endpoints are scoped to the signed-in
 * student); the filters below only change what is displayed. Amounts are shown
 * by default here because the student came to read their records, with the
 * same eye control as the wallet to hide them.
 */
export default function StudentStatementsScreen() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();

  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<KindFilter>("all");
  const [range, setRange] = useState<Range>("all");
  const [revealed, setRevealed] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, w] = await Promise.all([listMyPayments(authFetch), listMyWithdrawals(authFetch)]);
      setTxs(toTransactions(p, w));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your statements.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  // Only offer categories the data actually contains ("Money added" always stays,
  // because it is the purpose of this page).
  const presentKinds = useMemo(() => KIND_ORDER.filter((k) => k === "added" || txs.some((t) => (k === "refund" ? t.kind === "refund" || t.refunded : t.kind === k))), [txs]);

  const visible = useMemo(() => {
    const cutoff = range === "all" ? 0 : Date.now() - Number(range) * 86400000;
    return txs.filter((t) => {
      if (new Date(t.date).getTime() < cutoff) return false;
      if (kind === "all") return true;
      if (kind === "refund") return t.kind === "refund" || t.refunded;
      return t.kind === kind;
    });
  }, [txs, kind, range]);

  // Display-only: successful deposits among the rows in view. This is a
  // statement total, not the wallet balance (which comes from the plan itself).
  const addedTotal = useMemo(
    () => visible.filter((t) => t.kind === "added" && t.sign === 1).reduce((sum, t) => sum + t.amount, 0),
    [visible]
  );
  const addedCount = useMemo(() => visible.filter((t) => t.kind === "added" && t.sign === 1).length, [visible]);

  const groups = groupBy(visible, (t) => monthLabel(t.date));

  const back = (
    <button type="button" className="sv-backlink" onClick={() => navigate("/student/payments")}>
      <ArrowLeft size={16} aria-hidden />
      Wallet
    </button>
  );

  if (loading) {
    return (
      <div className="mv-container sv-page" aria-busy="true" aria-label="Loading your statements">
        {back}
        <h1 className="sv-title">Payment statements</h1>
        <div className="mv-skel" style={{ height: 90 }} />
        <div className="mv-skel" style={{ height: 320 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mv-container sv-page">
        {back}
        <h1 className="sv-title">Payment statements</h1>
        <EmptyState role="alert" icon={<RefreshCw size={28} />} title="We couldn't load your statements" body={error}>
          <PrimaryButton type="button" variant="secondary" showArrow={false} icon={<RefreshCw size={16} aria-hidden />} onPress={load}>
            Try again
          </PrimaryButton>
        </EmptyState>
      </div>
    );
  }

  const kindFilters: Array<{ key: KindFilter; label: string; Icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }> }> = [
    { key: "all", label: "All", Icon: ListChecks },
    ...presentKinds.map((k) => ({ key: k as KindFilter, label: KIND_META[k].label, Icon: KIND_META[k].Icon })),
  ];

  return (
    <div className="mv-container sv-page">
      {back}
      <header className="sv-head">
        <div>
          <h1 className="sv-title">Payment statements</h1>
          <p className="sv-lede">A record of the money you've put into MEALVEST and what came back out.</p>
        </div>
        <button
          type="button"
          className="sv-eye"
          aria-pressed={revealed}
          aria-label={revealed ? "Hide amounts" : "Show amounts"}
          onClick={() => setRevealed((v) => !v)}
        >
          {revealed ? <Eye size={20} aria-hidden /> : <EyeOff size={20} aria-hidden />}
        </button>
      </header>

      {txs.length === 0 ? (
        <EmptyState icon={<FileText size={30} />} title="No payments yet" body="When you pay into MEALVEST, each payment is recorded here with its reference.">
          <PrimaryButton type="button" showArrow={false} onPress={() => navigate("/student/payments")}>
            Back to wallet
          </PrimaryButton>
        </EmptyState>
      ) : (
        <>
          <div className="sv-summary" aria-label="Summary of money added">
            <div>
              <span>Added to MEALVEST</span>
              <span>
                <Money value={addedTotal} hidden={!revealed} />
              </span>
            </div>
            <div>
              <span>Successful payments</span>
              <span>{addedCount}</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="sv-seg" role="group" aria-label="Type of record">
              {kindFilters.map(({ key, label, Icon }) => (
                <button key={key} type="button" aria-pressed={kind === key} onClick={() => setKind(key)}>
                  <Icon size={15} aria-hidden />
                  {label}
                </button>
              ))}
            </div>
            <div className="sv-seg" role="group" aria-label="Time period" style={{ alignSelf: "flex-start" }}>
              {(
                [
                  ["all", "All time"],
                  ["30", "Last 30 days"],
                  ["90", "Last 90 days"],
                ] as Array<[Range, string]>
              ).map(([key, label]) => (
                <button key={key} type="button" aria-pressed={range === key} onClick={() => setRange(key)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <p className="sv-meta" role="status" aria-live="polite" style={{ margin: "-6px 0 -10px 4px" }}>
            {visible.length} {visible.length === 1 ? "record" : "records"}
          </p>

          {visible.length === 0 ? (
            <EmptyState
              icon={<FileText size={30} />}
              title="Nothing here"
              body={range !== "all" ? "No records in this period. Try a longer one." : kind !== "all" ? KIND_META[kind as TxKind].empty : "No records found."}
            >
              {(range !== "all" || kind !== "all") && (
                <PrimaryButton
                  type="button"
                  variant="secondary"
                  showArrow={false}
                  onPress={() => {
                    setKind("all");
                    setRange("all");
                  }}
                >
                  Show everything
                </PrimaryButton>
              )}
            </EmptyState>
          ) : (
            <div className="sv-group">
              {groups.map((g) => (
                <React.Fragment key={g.key}>
                  <div className="sv-divider-label">{g.key}</div>
                  {g.items.map((t) => (
                    <TransactionRow key={t.id} tx={t} hidden={!revealed} />
                  ))}
                </React.Fragment>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
