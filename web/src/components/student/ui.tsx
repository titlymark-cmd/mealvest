import React, { useEffect, useState } from "react";
import { UtensilsCrossed } from "lucide-react";

/**
 * Small, shared building blocks for the student pages. Styling lives in
 * styles/student.css (.sv-*), which only reuses the tokens from neu.css.
 */

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** "KSh 2,450" — whole shillings unless the value really has cents. */
export function formatKsh(value: string | number): string {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  return `KSh ${safe.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/** Number only (no currency), for layouts that style the currency separately. */
export function formatAmount(value: string | number): string {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const MASK = "••••••";

/**
 * Presentation-only privacy. The real value is always passed in by the
 * caller and never altered; when `hidden` it simply is not rendered, so it
 * is also absent from the DOM and from screen readers (which get a plain
 * "hidden" label instead). Nothing here touches storage or logs.
 */
export function Money({ value, hidden, withCurrency = true }: { value: string | number; hidden: boolean; withCurrency?: boolean }) {
  if (hidden) {
    return (
      <span>
        {withCurrency ? "KSh " : ""}
        <span aria-hidden="true" className="sv-mask">
          {MASK}
        </span>
        <span className="sv-visually-hidden">amount hidden</span>
      </span>
    );
  }
  return <span>{withCurrency ? formatKsh(value) : formatAmount(value)}</span>;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Status badge — always an icon AND words, never colour alone
// ---------------------------------------------------------------------------

export type BadgeTone = "ok" | "warn" | "bad" | "neutral";

export function StatusBadge({
  label,
  tone = "neutral",
  icon,
  surface = "dark",
}: {
  label: string;
  tone?: BadgeTone;
  icon?: React.ReactNode;
  surface?: "dark" | "cream";
}) {
  return (
    <span className="sv-badge" data-tone={tone} data-surface={surface}>
      {icon}
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Empty / error state
// ---------------------------------------------------------------------------

export function EmptyState({
  icon,
  title,
  body,
  children,
  role,
}: {
  icon: React.ReactNode;
  title: string;
  body?: string;
  children?: React.ReactNode;
  role?: "alert" | "status";
}) {
  return (
    <div className="sv-empty" role={role}>
      <span className="sv-empty-icon" aria-hidden="true">
        {icon}
      </span>
      <h2>{title}</h2>
      {body && <p>{body}</p>}
      {children && <div className="sv-empty-actions">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Food image — real image when we have one, a designed fallback when we
// don't (or when it fails to load), so the layout never changes shape.
// ---------------------------------------------------------------------------

export function FoodImage({
  src,
  alt = "",
  size = 28,
  fallbackClass,
  priority = false,
}: {
  src?: string | null;
  alt?: string;
  size?: number;
  fallbackClass: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return (
      <div className={fallbackClass} role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>
        <UtensilsCrossed size={size} aria-hidden />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

// ---------------------------------------------------------------------------
// Grouping helper — consecutive items sharing a key become one group
// ---------------------------------------------------------------------------

export function groupBy<T>(items: T[], keyOf: (item: T) => string): Array<{ key: string; items: T[] }> {
  const groups: Array<{ key: string; items: T[] }> = [];
  for (const item of items) {
    const key = keyOf(item);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, items: [item] });
  }
  return groups;
}
