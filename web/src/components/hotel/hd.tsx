import React, { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, Inbox, CircleAlert, TriangleAlert, CircleCheck } from "lucide-react";
import "../../styles/hotel.css";

/**
 * Hotel dashboard UI kit. Styling lives in styles/hotel.css (every class is
 * `.hd-` prefixed). Nothing here is used by — or may restyle — the approved
 * Profile page, which has its own `.hp-` stylesheet and components.
 */

/* ------------------------------------------------------------------ */
/* Formatting + status vocabulary                                      */
/* ------------------------------------------------------------------ */

export type Tone = "good" | "warn" | "ready" | "bad" | "muted";

const DATE_TIME: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-KE", DATE_TIME);
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

/** Short human reference for an order — the last 6 characters of its id. */
export function orderCode(id: string): string {
  return `#${id.replace(/-/g, "").slice(-6).toUpperCase()}`;
}

export function whole(amount: string | number | null | undefined): string {
  return `KSh ${Number(amount ?? 0).toLocaleString("en-KE")}`;
}

export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending_payment: { label: "Awaiting payment", tone: "muted" },
  paid: { label: "Preparing", tone: "warn" },
  ready: { label: "Ready for pickup", tone: "ready" },
  redeemed: { label: "Redeemed", tone: "good" },
  cancelled: { label: "Cancelled", tone: "muted" },
  refunded: { label: "Refunded", tone: "muted" },
};

export const PAYOUT_STATUS: Record<string, { label: string; tone: Tone }> = {
  successful: { label: "Paid", tone: "good" },
  pending: { label: "Processing", tone: "warn" },
  processing: { label: "Processing", tone: "warn" },
  approved: { label: "Processing", tone: "warn" },
  unknown: { label: "Processing", tone: "warn" },
  review: { label: "Under review", tone: "warn" },
  failed: { label: "Failed", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

export const HOTEL_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "good" },
  pending_verification: { label: "Pending verification", tone: "warn" },
  suspended: { label: "Suspended", tone: "bad" },
  expired: { label: "Contract expired", tone: "bad" },
};

export const VERIFICATION_STATUS: Record<string, { label: string; tone: Tone }> = {
  verified: { label: "Verified", tone: "good" },
  pending: { label: "Awaiting verification", tone: "warn" },
  requires_correction: { label: "Needs correction", tone: "bad" },
  rejected: { label: "Rejected", tone: "bad" },
};

export const PAYMENT_METHOD: Record<string, string> = {
  bank: "Bank account",
  mpesa_till: "M-Pesa Till",
  mpesa_pochi: "M-Pesa Pochi la Biashara",
};

export const BUDGET_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: "Active plan", tone: "good" },
  completed: { label: "Plan completed", tone: "muted" },
  suspended: { label: "Plan suspended", tone: "warn" },
  cancelled: { label: "Plan cancelled", tone: "muted" },
};

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="hd-head">
      <div className="hd-head-main">
        {eyebrow && <div className="hd-eyebrow">{eyebrow}</div>}
        <h1 className="hd-title">{title}</h1>
        {subtitle && <p className="hd-sub">{subtitle}</p>}
      </div>
      {actions && <div className="hd-head-actions">{actions}</div>}
    </header>
  );
}

export function Panel({
  children,
  dark,
  className = "",
  as: Tag = "section",
  ...rest
}: {
  children: React.ReactNode;
  dark?: boolean;
  className?: string;
  as?: React.ElementType;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={`hd-panel ${dark ? "hd-panel-dark" : ""} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function PanelHead({ icon, title, subtitle, right }: { icon?: React.ReactNode; title: string; subtitle?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="hd-panel-head">
      <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
        {icon}
        <div style={{ minWidth: 0 }}>
          <h2 className="hd-panel-title">{title}</h2>
          {subtitle && <p className="hd-panel-sub">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function StatTile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Panel className="hd-stat" as="div">
      <span className="hd-stat-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="hd-stat-label">{label}</span>
      <span className="hd-stat-value">{value}</span>
      {sub && <span className="hd-stat-sub">{sub}</span>}
    </Panel>
  );
}

export function StatusPill({ tone, children, onDark }: { tone: Tone; children: React.ReactNode; onDark?: boolean }) {
  return (
    <span className="hd-pill" data-tone={tone} data-surface={onDark ? "dark" : undefined}>
      {children}
    </span>
  );
}

export function Banner({
  tone = "warn",
  title,
  children,
  action,
}: {
  tone?: "warn" | "bad" | "good";
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const Icon = tone === "good" ? CircleCheck : tone === "bad" ? CircleAlert : TriangleAlert;
  return (
    <div className="hd-banner" data-tone={tone} role={tone === "bad" ? "alert" : "status"}>
      <Icon size={18} aria-hidden="true" />
      <div className="hd-banner-body">
        <span className="hd-banner-title">{title}</span>
        {children && <span className="hd-banner-text">{children}</span>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Panel className="hd-empty" as="div">
      <span className="hd-empty-icon" aria-hidden="true">
        {icon ?? <Inbox size={22} />}
      </span>
      <h2 className="hd-empty-title">{title}</h2>
      {children && <p className="hd-empty-text">{children}</p>}
      {action}
    </Panel>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="hd-search" role="search">
      <Search size={17} aria-hidden="true" />
      <input
        className="mv-input-plain"
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoCapitalize="none"
        autoComplete="off"
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")} style={{ background: "none", border: 0, color: "inherit", width: 32, height: 32 }}>
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export interface ChipOption {
  value: string;
  label: string;
  count?: number;
}

/** Single-select filter chips. aria-pressed carries the state, not just colour. */
export function Chips({ options, value, onChange, label }: { options: ChipOption[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="hd-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="hd-chip" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
          {typeof o.count === "number" && <span className="hd-chip-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function HdSwitch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="hd-switch" onClick={onChange} disabled={disabled}>
      <span className="hd-switch-track" aria-hidden="true">
        <span className="hd-switch-thumb" />
      </span>
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

/** Short-lived confirmation/error message, announced to screen readers. */
export function useNotice() {
  const [state, setState] = useState<{ text: string; tone: "good" | "bad" } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const notify = useCallback((text: string, tone: "good" | "bad" = "good") => {
    setState({ text, tone });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState(null), tone === "bad" ? 6000 : 3800);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const notice = state ? (
    <div className="hd-toast" data-tone={state.tone} role={state.tone === "bad" ? "alert" : "status"}>
      {state.text}
    </div>
  ) : null;

  return { notice, notify };
}

/** "2× Pilau, 1× Chai" — the order's line items as one readable string. */
export function itemsSummary(items: Array<{ name: string; quantity: number }> | null | undefined): string {
  if (!Array.isArray(items) || items.length === 0) return "No items";
  return items.map((it) => `${it.quantity}× ${it.name}`).join(", ");
}
