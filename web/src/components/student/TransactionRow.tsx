import React from "react";
import { ArrowDownToLine, ArrowUpFromLine, ShoppingBag, Undo2, Clock, CircleCheck, CircleX } from "lucide-react";
import { StatusBadge, formatDateTime, formatAmount } from "./ui";
import type { Transaction, TxKind } from "./transactions";

const KIND_ICON: Record<TxKind, React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  added: ArrowDownToLine,
  spent: ShoppingBag,
  refund: Undo2,
  withdrawal: ArrowUpFromLine,
};

/**
 * One ledger line. Direction is shown three ways (icon, +/− sign, words in the
 * badge) so it never depends on colour. Unsettled or failed rows carry no
 * sign: they did not move money.
 */
export function TransactionRow({ tx, hidden = false, compact = false }: { tx: Transaction; hidden?: boolean; compact?: boolean }) {
  const Icon = KIND_ICON[tx.kind];
  const StatusIcon = tx.outcome === "done" ? CircleCheck : tx.outcome === "pending" ? Clock : CircleX;
  const signChar = tx.sign === 1 ? "+" : tx.sign === -1 ? "−" : "";

  return (
    <div className="sv-tx">
      <span className="sv-tx-icon" data-kind={tx.sign === 1 ? "in" : tx.sign === -1 ? "out" : undefined} aria-hidden="true">
        <Icon size={19} />
      </span>
      <div className="sv-tx-main">
        <span className="sv-tx-title">{tx.title}</span>
        <span className="sv-tx-meta">
          {formatDateTime(tx.date)}
          {tx.detail ? ` · ${tx.detail}` : ""}
        </span>
        {!compact && tx.reference && <span className="sv-tx-ref">Ref {tx.reference}</span>}
        {!compact && tx.note && <span className="sv-tx-meta" style={{ color: "var(--sv-bad)" }}>{tx.note}</span>}
      </div>
      <div className="sv-tx-amt">
        <span className="sv-amount" data-sign={tx.sign === 1 ? "in" : tx.outcome === "void" ? "void" : undefined}>
          {hidden ? (
            <>
              <span aria-hidden="true">{signChar}KSh ••••</span>
              <span className="sv-visually-hidden">amount hidden</span>
            </>
          ) : (
            <>
              {signChar}KSh {formatAmount(tx.amount)}
            </>
          )}
        </span>
        <StatusBadge tone={tx.tone} label={tx.statusLabel} icon={<StatusIcon size={13} aria-hidden />} />
      </div>
    </div>
  );
}
